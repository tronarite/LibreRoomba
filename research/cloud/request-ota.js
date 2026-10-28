// ESCRIBE en tu robot (vía la nube de iRobot): pide la actualización de firmware, igual que la app oficial (`/v1/<robot>/request-ota`).
// Por defecto es MODO PRUEBA: enseña la petición y no hace ninguna llamada de red.
// Uso: node research/cloud/request-ota.js --version daredevil+2.6.0                (solo muestra)
//      LIBREROOMBA_CONFIRM_OTA=yes node research/cloud/request-ota.js --version <v> --send [--download]
// Una sola petición, sin reintentos, una única ruta permitida. Si la nube ordena una actualización, el robot la instalará y no se deshace.
const fs = require('fs');
const { refreshSession } = require('../../app/core/session-refresh');
const path = require('path');
const crypto = require('crypto');
const { sign } = require('../../app/core/sigv4');

const REGION = 'us-east-1';
const SERVICE = 'execute-api';
const SESSION = path.join(__dirname, 'session.json');
const OUT_DIR = path.resolve(__dirname, '../firmware');
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION = /^[A-Za-z0-9._+-]{1,64}$/;
const ROUTE = /^\/v1\/[A-Za-z0-9_-]{1,64}\/request-ota$/;
const MAX_BYTES = 600 * 1024 * 1024;
const SECRET_HEADERS = /^(authorization|x-amz-security-token|set-cookie|cookie|x-api-key)$/i;
const INTERESTING = /^(downloadUrl|deploymentMpkg|size|sha|sha1|sha256|checksum|signature)$/i;

class OtaError extends Error {}

function parseArgs(argv) {
  const args = { send: false, download: false, version: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--send') args.send = true;
    else if (argv[i] === '--download') args.download = true;
    else if (argv[i] === '--version') args.version = argv[++i] || null;
  }
  return args;
}

function loadSession(sessionPath) {
  let s;
  try { s = JSON.parse(fs.readFileSync(sessionPath, 'utf8')); } catch (_) { throw new OtaError('No hay sesión de la nube. Ejecuta en tu terminal: node research/cloud/login.js'); }
  if (!s.appId) throw new OtaError('La sesión no guarda el app_id (es de antes del cambio en login.js). Vuelve a ejecutar: node research/cloud/login.js');
  if (!s.credentials || !s.deployment || !s.deployment.httpBaseAuth || !s.robots || !Object.keys(s.robots).length) throw new OtaError('La sesión de la nube no es válida. Vuelve a ejecutar: node research/cloud/login.js');
  const exp = Date.parse(s.credentials.Expiration);
  if (Number.isFinite(exp) && exp < Date.now()) throw new OtaError('La sesión de la nube caducó. Vuelve a ejecutar: node research/cloud/login.js');
  return s;
}

// Construye la petición firmada. Lista blanca: solo POST https a /v1/<blid>/request-ota en el host de la sesión.
function buildRequest(session, version, now = new Date()) {
  if (!version || !VERSION.test(version)) throw new OtaError('Falta --version <texto> (obligatorio, sin valor por defecto; solo letras, números y . _ + -).');
  const blid = Object.keys(session.robots)[0];
  if (!SAFE.test(blid) || !SAFE.test(session.appId)) throw new OtaError('Identificador de robot o app_id no válido.');
  const base = new URL(session.deployment.httpBaseAuth);
  const url = `${base.origin}/v1/${blid}/request-ota?app_id=${encodeURIComponent(session.appId)}`;
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.host !== base.host || !ROUTE.test(u.pathname)) throw new OtaError('Ruta no permitida.');
  const body = JSON.stringify({ software_version: version });
  const signed = sign({ method: 'POST', url, credentials: session.credentials, region: REGION, service: SERVICE, now, payload: body });
  return { method: 'POST', url, body, headers: { ...signed, 'content-type': 'application/json' }, blid };
}

function describe(req) {
  const u = new URL(req.url);
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !SECRET_HEADERS.test(k)));
  return { method: req.method, url: `${u.origin}${u.pathname.replace(req.blid, `…${req.blid.slice(-4)}`)}?app_id=…`, robot: `…${req.blid.slice(-4)}`, body: req.body, headers };
}

// Busca recursivamente URLs https y claves de interés (downloadUrl, deploymentMpkg, size, sha, checksum, signature)
function findInteresting(node, pathKey = '', out = { urls: [], fields: [] }) {
  if (typeof node === 'string') { if (node.startsWith('https://')) out.urls.push({ path: pathKey, url: node }); }
  else if (Array.isArray(node)) node.forEach((v, i) => findInteresting(v, `${pathKey}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const p = pathKey ? `${pathKey}.${k}` : k;
      if (INTERESTING.test(k) && (v === null || typeof v !== 'object')) out.fields.push({ path: p, value: v });
      findInteresting(v, p, out);
    }
  }
  return out;
}

async function download(url, outDir, fetchFn) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new OtaError('Solo se descarga por https.');
  const name = (path.basename(u.pathname).replace(/[^A-Za-z0-9._-]/g, '_') || 'firmware').slice(0, 80);
  const file = path.join(outDir, `${name.replace(/\.bin$/, '')}.bin`);
  const res = await fetchFn(url, { method: 'GET' });
  if (res.status !== 200) throw new OtaError(`La descarga respondió HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new OtaError('El archivo supera el límite de 600 MB.');
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'w');
  let size = 0;
  try {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new OtaError('El archivo supera el límite de 600 MB.');
      hash.update(chunk); fs.writeSync(fd, chunk);
    }
  } catch (e) { fs.closeSync(fd); fs.rmSync(file, { force: true }); throw e; }
  fs.closeSync(fd);
  return { file, size, sha256: hash.digest('hex') };
}

// Punto de entrada testeable: todo (argumentos, entorno, red, rutas, log) se inyecta
async function run({ argv = [], env = {}, fetchFn = globalThis.fetch, sessionPath = SESSION, outDir = OUT_DIR, log = console.log, now = () => new Date() } = {}) {
  const args = parseArgs(argv);
  try { loadSession(sessionPath); } catch (error) {
    // Credenciales caducadas (duran ~1 h): se renuevan con la sesión de Gigya, sin pedir la contraseña
    if (!/caduc/.test(error.message)) throw error;
    try { await refreshSession({ sessionPath, fetchFn }); log('Sesión de la nube renovada automáticamente.'); } catch (_) { throw error; }
  }
  const session = loadSession(sessionPath);
  const req = buildRequest(session, args.version, now());
  log('Petición (sin secretos):');
  log(JSON.stringify(describe(req), null, 2));
  if (!args.send) { log('\nMODO PRUEBA: no se ha enviado nada. Para enviar: LIBREROOMBA_CONFIRM_OTA=yes … --send'); return { sent: false }; }
  if (env.LIBREROOMBA_CONFIRM_OTA !== 'yes') throw new OtaError('Abortado: --send necesita también LIBREROOMBA_CONFIRM_OTA=yes en el entorno.');
  log('\nEnviando UNA petición (sin reintentos)…');
  let res;
  try { res = await fetchFn(req.url, { method: 'POST', headers: req.headers, body: req.body }); } catch (_) { throw new OtaError('No se pudo contactar con la nube de iRobot.'); }
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch (_) { parsed = text; }
  const headers = {}; res.headers.forEach((v, k) => { if (!SECRET_HEADERS.test(k)) headers[k] = v; });
  fs.mkdirSync(outDir, { recursive: true });
  const saved = path.join(outDir, `ota-response-${now().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(saved, JSON.stringify({ status: res.status, headers, body: parsed }, null, 2));
  log(`Respuesta HTTP ${res.status}. Guardada en ${saved}`);
  const found = findInteresting(parsed);
  found.fields.forEach((f) => log(`  ${f.path} = ${f.value}`));
  found.urls.forEach((u) => log(`  URL ${u.path}: ${u.url}`));
  const result = { sent: true, status: res.status, saved, found };
  if (args.download && found.urls.length) {
    result.downloads = [];
    for (const u of found.urls) {
      const d = await download(u.url, outDir, fetchFn);
      log(`Descargado ${d.file} (${d.size} bytes, sha256 ${d.sha256}). No se ha ejecutado nada.`);
      result.downloads.push(d);
    }
  } else if (found.urls.length) log('Hay URL(s): vuelve a lanzar con --download para bajarlas.');
  return result;
}

module.exports = { run, parseArgs, buildRequest, describe, findInteresting, OtaError, ROUTE };

if (require.main === module) {
  run({ argv: process.argv.slice(2), env: process.env }).catch((e) => { console.error(e instanceof OtaError ? e.message : `Error: ${e.message}`); process.exit(1); });
}
