// Cliente de SOLO LECTURA de la nube de iRobot. Usa la sesión que crea research/cloud/login.js (el usuario escribe su contraseña, nunca este código).
// Solo GET a rutas de una lista blanca, parámetros validados, nunca registra credenciales. `fetch` se inyecta (las pruebas no tocan la red).
const fs = require('fs');
const path = require('path');
const { sign } = require('./sigv4');

const REGION = 'us-east-1';
const SERVICE = 'execute-api';
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const ROUTES = {                      // rutas leídas del nativo de la app; %s = BLID, %p = pmapId, %v = versión
  history: '/v1/%s/missionhistory',
  umf: '/v1/%s/pmaps/%p/versions/%v/umf'
};
const HISTORY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SESSION = path.resolve(__dirname, '../../research/cloud/session.json');

class CloudError extends Error {
  // code: 'no-session' | 'expired' | 'invalid' | 'http' | 'network'
  constructor(message, code, status) { super(message); this.name = 'CloudError'; this.code = code; this.status = status; }
}

const RESULTS = { ok: ['ok', 'Completada'], cncl: ['cancelada', 'Cancelada'], stuck: ['atascada', 'Atascada'], inc: ['incompleta', 'Incompleta'] };

// Misión de la nube -> fila para el panel (sin identificadores ni datos de red)
function normalizeMission(m) {
  const [result, label] = RESULTS[m.done] || ['desconocido', m.done ? String(m.done) : 'Desconocido'];
  const start = Number(m.startTime || m.timestamp);
  const entry = Array.isArray(m.pmaps_robot) && m.pmaps_robot[0] ? Object.entries(m.pmaps_robot[0])[0] : null;
  return {
    startedAt: Number.isFinite(start) ? new Date(start * 1000).toISOString() : null,
    durationMin: Number.isFinite(m.durationM) ? m.durationM : null,
    result, label,
    areaM2: Number.isFinite(m.sqft) ? Math.round(m.sqft * 0.0929 * 10) / 10 : null,
    evacs: Number.isFinite(m.evacs) ? m.evacs : 0,
    dockedAtStart: m.dockedAtStart === true ? true : m.dockedAtStart === false ? false : null,
    nMssn: Number.isFinite(m.nMssn) ? m.nMssn : null,
    hasMap: !!entry
  };
}

// Referencia (pmapId, versión) del mapa de una misión de la nube, solo para uso del servidor
function mapRef(m) {
  const entry = Array.isArray(m.pmaps_robot) && m.pmaps_robot[0] ? Object.entries(m.pmaps_robot[0])[0] : null;
  return entry && SAFE.test(entry[0]) && SAFE.test(entry[1]) ? { pmapId: entry[0], version: entry[1] } : null;
}

function createCloud({ sessionPath = DEFAULT_SESSION, fetchFn = globalThis.fetch, cacheDir = null, now = () => Date.now() } = {}) {
  const memory = { history: null };

  function session() {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8')); } catch (_) {
      throw new CloudError('No hay sesión de la nube. Ejecuta en tu terminal: node research/cloud/login.js', 'no-session');
    }
    const exp = raw.credentials && Date.parse(raw.credentials.Expiration);
    if (Number.isFinite(exp) && exp < now()) throw new CloudError('La sesión de la nube caducó. Vuelve a ejecutar: node research/cloud/login.js', 'expired');
    if (!raw.credentials || !raw.deployment || !raw.deployment.httpBaseAuth || !raw.robots || !Object.keys(raw.robots).length) throw new CloudError('La sesión de la nube no es válida. Vuelve a ejecutar: node research/cloud/login.js', 'no-session');
    return raw;
  }

  function status() {
    try { const s = session(); return { hasSession: true, expiresAt: s.credentials.Expiration || null, robots: Object.values(s.robots).map((r) => ({ name: r.name || null, sku: r.sku || null })) }; }
    catch (error) { return { hasSession: false, reason: error.code, message: error.message }; }
  }

  function cacheFile(name) { return cacheDir ? path.join(cacheDir, name) : null; }
  function readCache(file, ttl) {
    if (!file) return null;
    try {
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));          // { at, data }: la marca va dentro, así la caducidad usa el mismo reloj que el resto
      if (!entry || entry.data === undefined || (ttl && !(now() - entry.at <= ttl))) return null;
      return entry.data;
    } catch (_) { return null; }
  }
  function writeCache(file, data) {
    if (!file) return;
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at: now(), data })); } catch (_) { /* sin disco: solo memoria */ }
  }

  async function get(routeKey, params = {}) {
    if (!Object.hasOwn(ROUTES, routeKey)) throw new CloudError('Ruta no permitida', 'invalid');
    for (const value of Object.values(params)) if (!SAFE.test(String(value))) throw new CloudError('Parámetro no válido', 'invalid');
    const s = session();
    const blid = Object.keys(s.robots)[0];
    const route = ROUTES[routeKey].replace('%s', blid).replace('%p', params.pmapId || '').replace('%v', params.version || '');
    const url = s.deployment.httpBaseAuth + route;
    if (new URL(url).protocol !== 'https:') throw new CloudError('Solo HTTPS', 'invalid');
    let response;
    try { response = await fetchFn(url, { method: 'GET', headers: sign({ method: 'GET', url, credentials: s.credentials, region: REGION, service: SERVICE, now: new Date(now()) }) }); }
    catch (_) { throw new CloudError('No se pudo contactar con la nube de iRobot.', 'network'); }
    if (response.status === 401 || response.status === 403) throw new CloudError('La nube rechazó la sesión (caducada). Vuelve a ejecutar: node research/cloud/login.js', 'expired', response.status);
    if (response.status !== 200) throw new CloudError(`La nube respondió HTTP ${response.status}`, 'http', response.status);
    return response.json();
  }

  // Historial: caché en memoria y en disco durante 5 minutos (refresh=true lo salta)
  async function missionHistory({ refresh = false } = {}) {
    const file = cacheFile('cloud-history.json');
    if (!refresh) {
      if (memory.history && now() - memory.history.at < HISTORY_TTL_MS) return memory.history.data;
      const cached = readCache(file, HISTORY_TTL_MS);
      if (cached) { memory.history = { at: now(), data: cached }; return cached; }
    }
    const data = await get('history');
    if (!Array.isArray(data)) throw new CloudError('Formato inesperado en el historial de la nube.', 'http');
    memory.history = { at: now(), data };
    writeCache(file, data);
    return data;
  }

  // Un mapa UMF es inmutable por versión: se guarda sin caducidad
  async function umf(pmapId, version) {
    if (!SAFE.test(pmapId) || !SAFE.test(version)) throw new CloudError('Parámetro no válido', 'invalid');
    const file = cacheFile(path.join('cloud-umf', `${pmapId}_${version}.json`));
    const cached = readCache(file, 0);
    if (cached) return cached;
    const data = await get('umf', { pmapId, version });
    writeCache(file, data);
    return data;
  }

  return { status, missionHistory, umf };
}

module.exports = { createCloud, CloudError, normalizeMission, mapRef, SAFE };
