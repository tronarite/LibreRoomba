const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { RobotCore } = require('./core/robot');
const { createFakeRobot } = require('./core/fake-robot');
const { discover } = require('./core/discovery');
const { createHistory } = require('./history');
const { summarize } = require('./maintenance');
const { createRooms, measure } = require('./rooms');
const { createGuard } = require('./core/localguard');
const { createLocalParts } = require('./core/localparts');
const { createLocalMap } = require('./core/localmap');
const { createCloud, normalizeMission, mapRef } = require('./core/cloud');
const { createFakeCloud } = require('./core/fake-cloud');
const { normalizeParts } = require('./core/parts');
const { mergeMissions } = require('./core/mapmerge');
const { Notifier } = require('./core/notifier');
const { describe: describeError, describeNotReady, describeDock } = require('./core/errors');
const dnd = require('./core/dnd');
const { DndGuard } = require('./core/dnd-guard');

const mockMode = process.argv.includes('--mock') || process.env.MOCK === '1';
if (!mockMode && (!process.env.ROBOT_IP || !process.env.ROBOT_BLID)) {
  console.error('Falta ROBOT_IP o ROBOT_BLID (variables de entorno). Ver README.md.');
  process.exit(1);
}
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
// Funciones sin probar en el robot: cerradas salvo LIBREROOMBA_EXPERIMENTAL=1 (o --mock).
const EXPERIMENTAL = process.env.LIBREROOMBA_EXPERIMENTAL === '1' || (mockMode && process.env.LIBREROOMBA_EXPERIMENTAL !== '0');

function robotPassword() {
  if (process.env.ROBOT_PASSWORD) return process.env.ROBOT_PASSWORD;
  return fs.readFileSync(path.resolve(__dirname, '../research/robot-password.txt'), 'utf8').trim();
}

const history = createHistory(path.join(__dirname, 'data', 'history.json'));
const localParts = createLocalParts(process.env.LIBREROOMBA_PARTS_FILE || path.join(__dirname, 'data', 'parts.json'));
const localMap = createLocalMap(process.env.LIBREROOMBA_LOCALMAP_FILE || path.join(__dirname, 'data', 'localmap.json'));
const rooms = createRooms(process.env.LIBREROOMBA_ROOMS_FILE || path.join(__dirname, 'data', 'rooms.json'));
let core;
if (mockMode) {
  // MOCK_AUTH_FAIL=1 (solo con --mock, para pruebas): el robot simulado rechaza la contraseña.
  const fake = createFakeRobot({ password: process.env.MOCK_AUTH_FAIL === '1' ? 'otra' : undefined });
  core = new RobotCore({ ip: 'mock', blid: 'mock', password: 'mock', connect: fake.connect, experimental: EXPERIMENTAL });
} else {
  let password;
  try { password = robotPassword(); } catch (_) {
    console.error('No se pudo leer la contraseña del robot. Configure ROBOT_PASSWORD o el archivo indicado.');
    process.exit(1);
  }
  // LIBREROOMBA_DISCOVER=1: si el robot deja de responder, buscar su IP nueva por UDP (puerto 5678) filtrando por BLID.
  const blid = process.env.ROBOT_BLID;
  const discovering = process.env.LIBREROOMBA_DISCOVER === '1' ? () => discover({ blid }) : null;
  core = new RobotCore({ ip: process.env.ROBOT_IP, blid, password, experimental: EXPERIMENTAL, positionPolling: true, discover: discovering });
  core.on('ip-changed', ({ to }) => console.log(`El robot cambió de IP; ahora responde en ${to}.`));
}
core.on('error', (error) => console.error('Error MQTT:', error.message));
core.on('auth-failed', () => console.error(AUTH_HELP));
core.on('auth-recovered', () => console.log('El robot vuelve a aceptar la contraseña.'));

const AUTH_HELP = 'El robot rechaza la contraseña local (¿se ha vuelto a emparejar?). Con el robot en la base, mantén HOME 2-3 s hasta que parpadee el icono Wi-Fi y ejecuta: node research/get-password.js <ip>. Después reinicia el servidor.';
const VERSION = require('./package.json').version;
// Avisos (depósito lleno, misión terminada, errores...): solo transiciones, con antirrebote; en memoria (últimos 50)
const notifier = new Notifier(core, { authHelp: AUTH_HELP });
// No molestar: franjas guardadas en app/data/dnd.json; el vigilante manda el robot a la base según la semántica de la app oficial
const dndStore = dnd.createDndStore(process.env.LIBREROOMBA_DND_FILE || path.join(__dirname, 'data', 'dnd.json'));   // LIBREROOMBA_DND_FILE: pruebas
const dndGuard = new DndGuard(core, { items: dndStore.list, notify: (...args) => notifier.notify(...args) });
function dndState() {
  const items = dndStore.list();
  const hit = dndGuard.active();
  return {
    items, active: hit ? { index: hit.index, label: hit.label, until: hit.until } : null,
    conflicts: { overlaps: dnd.overlaps(items), schedule: dnd.scheduleConflicts(items, core.state.cleanSchedule2) }
  };
}

function getPath(object, paths) {
  for (const dottedPath of paths) {
    const value = dottedPath.split('.').reduce((item, key) => item == null ? undefined : item[key], object);
    if (value !== undefined) return value;
  }
  return undefined;
}

// { code, title, message } o null (0, sin dato o ya listo)
function textOf(describeFn, value, state) {
  if (value === undefined || value === null || value === 0) return null;
  const d = describeFn(value, 'es', { robot: state.name });
  if (!d || d.ready) return null;
  return { code: value, title: d.title, message: d.message || null, error: d.error !== undefined ? d.error : true };
}

function summary() {
  const state = core.state;
  return {
    connected: core.connected,
    authFailed: core.authFailed,
    authHelp: core.authFailed ? AUTH_HELP : null,
    batPct: getPath(state, ['batPct', 'battery.batPct']),
    phase: getPath(state, ['cleanMissionStatus.phase']),
    cycle: getPath(state, ['cleanMissionStatus.cycle']),
    error: getPath(state, ['cleanMissionStatus.error', 'error']),
    // Textos de la app oficial para el error, el motivo por el que no empieza (notReady) y el estado de la base (dock.state)
    errorText: textOf(describeError, getPath(state, ['cleanMissionStatus.error', 'error']), state),
    notReady: textOf(describeNotReady, getPath(state, ['cleanMissionStatus.notReady']), state),
    dock: textOf(describeDock, getPath(state, ['dock.state']), state),
    bin: { present: getPath(state, ['bin.present']), full: getPath(state, ['bin.full']) },
    name: getPath(state, ['name']),
    softwareVer: getPath(state, ['softwareVer']),
    mssnM: getPath(state, ['mssnM']),
    prefs: { twoPass: state.twoPass, rankOverlap: state.rankOverlap, binPause: state.binPause, openOnly: state.openOnly, childLock: state.childLock, ecoCharge: state.ecoCharge, schedHold: state.schedHold, binTypeDetect: state.binTypeDetect, name: state.name },
    rssi: getPath(state, ['rssi', 'wifi.rssi', 'wifistat.rssi']),
    // Solo lectura, para la tarjeta "Información" (sin BLID, MAC ni datos de red)
    info: {
      sku: state.sku, country: state.country, timezone: state.timezone, cloudEnv: state.cloudEnv,
      language: getPath(state, ['langs2.sLang']), languagesAvailable: getPath(state, ['langs2.dLangs.langs']),
      dockFirmware: getPath(state, ['dock.fwVer']), evacAllowed: state.evacAllowed
    },
    dnd: dndState().active,
    experimental: EXPERIMENTAL,
    experimentalPrefs: { odoaMode: state.odoaMode, suctionLevel: state.suctionLevel, chrgLrPtrn: state.chrgLrPtrn },
    position: core.position,
    lastUpdate: core.lastUpdate
  };
}

function broadcast() {
  const message = JSON.stringify(summary());
  wss.clients.forEach((client) => { if (client.readyState === client.OPEN) client.send(message); });
}
core.on('state', () => { history.observe(core.state); broadcast(); });
core.on('position', broadcast);

// Mapa propio sin nube: durante una misión se pide la posición cada POSITION_POLL_MS (solo con experimental, formato RRTP sin confirmar en el robot real)
const POSITION_POLL_MS = Number(process.env.LIBREROOMBA_POSITION_POLL_MS || 2000);
const missionPhase = () => (core.state.cleanMissionStatus || {}).phase;
let wasRunning = false;
core.on('state', () => { const running = missionPhase() === 'run'; if (wasRunning && !running) localMap.endMission(); wasRunning = running; });
core.on('position', (p) => { if (missionPhase() === 'run') localMap.add(p.x, p.y); });
if (EXPERIMENTAL || !mockMode) {   // pedir la posición es solo lectura: el mapa propio no depende del modo experimental
  const poll = setInterval(() => { if (core.connected && missionPhase() === 'run') { try { core.requestPosition(); } catch (_) { /* sin conexión */ } } }, POSITION_POLL_MS);
  if (poll.unref) poll.unref();
}
// Durante una misión se graba todo lo que manda el robot (tope 5 MB) para conocer el formato real de la posición
const CAPTURE_FILE = path.join(__dirname, 'data', 'mission-capture.jsonl');
const CAPTURE_MAX = 5 * 1024 * 1024;
let captured = 0;
try { captured = fs.statSync(CAPTURE_FILE).size; } catch (_) { /* sin captura previa */ }
if (!mockMode) core.on('raw', ({ topic, text }) => {
  if (missionPhase() !== 'run' || captured >= CAPTURE_MAX || topic === 'wifistat') return;
  const line = JSON.stringify({ t: new Date().toISOString(), topic, text: text.length > 4000 ? `${text.slice(0, 4000)}…` : text }).replace(/[0-9A-F]{32}/g, '<id>') + '\n';
  try { fs.mkdirSync(path.dirname(CAPTURE_FILE), { recursive: true }); fs.appendFileSync(CAPTURE_FILE, line); captured += line.length; } catch (_) { /* sin disco */ }
});
// El mapa propio parte de lo que ya está descargado de la nube (en disco); desde entonces no necesita la nube
if (!mockMode && !localMap.snapshot()) Promise.resolve().then(() => new Promise((r) => setImmediate(r))).then(() => buildCloudMap(200)).then((m) => { if (m) localMap.seed(m); }).catch(() => { /* sin mapas guardados: se irá construyendo con las misiones */ });
core.on('connected', broadcast);
dndGuard.on('change', broadcast);
// Los avisos viajan por el mismo WebSocket con otra forma ({ notification }); el panel los distingue del resumen de estado
notifier.on('event', (event) => {
  const message = JSON.stringify({ notification: event });
  wss.clients.forEach((client) => { if (client.readyState === client.OPEN) client.send(message); });
});

// code del RobotError -> estado HTTP
const STATUS = { offline: 503, invalid: 400, forbidden: 403 };
function handle(res, action) {
  try {
    action();
    res.json({ ok: true });
  } catch (error) {
    res.status(STATUS[error.code] || 500).json({ error: error.message });
  }
}

const app = express();
const guard = createGuard({ host: HOST, extraHosts: (process.env.LIBREROOMBA_ALLOWED_HOSTS || '').split(',') });   // LIBREROOMBA_ALLOWED_HOSTS: nombres extra (p. ej. el de la LAN)
app.use(guard.middleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/state', (_req, res) => res.json(summary()));
// Para vigilar el servicio: ok = conectado y con contraseña válida. ageSeconds = antigüedad del último estado recibido.
app.get('/api/health', (_req, res) => {
  const age = core.lastUpdate ? Math.round((Date.now() - Date.parse(core.lastUpdate)) / 1000) : null;
  res.status(core.connected ? 200 : 503).json({
    ok: core.connected && !core.authFailed, connected: core.connected, authFailed: core.authFailed,
    ageSeconds: age, mock: mockMode, version: VERSION, uptimeSeconds: Math.round(process.uptime())
  });
});
app.get('/api/history', (_req, res) => res.json(history.list()));
app.get('/api/events', (_req, res) => res.json(notifier.list()));   // últimos 50 avisos, el más reciente primero

// Nube de iRobot (solo lectura, con la sesión de research/cloud/login.js). En --mock se usa una nube simulada.
const cloud = mockMode ? createFakeCloud() : createCloud({ cacheDir: path.join(__dirname, 'data'), autoRenew: true });
const CLOUD_STATUS = { 'no-session': 401, expired: 401, invalid: 400, network: 502, http: 502 };
function cloudFail(res, error) {
  res.status(CLOUD_STATUS[error.code] || 500).json({ error: error.message, code: error.code || 'internal' });
}
let mapCache = { key: null, value: null };
let mapInflight = { key: null, promise: null };   // el mapa y las habitaciones lo piden a la vez al cargar la página: una sola descarga
async function buildCloudMap(limit) {
  const refs = (await cloud.missionHistory()).map(mapRef).filter(Boolean).slice(0, limit);
  const key = refs.map((r) => `${r.pmapId}:${r.version}`).join(',');
  if (mapCache.key === key) return mapCache.value;
  if (mapInflight.key === key) return mapInflight.promise;
  const promise = downloadAndMerge(refs, key);
  mapInflight = { key, promise };
  try { return await promise; } finally { if (mapInflight.promise === promise) mapInflight = { key: null, promise: null }; }
}
async function downloadAndMerge(refs, key) {
  const maps = [];
  let authError = null;
  let next = 0;
  async function worker() {                                  // 3 descargas a la vez como máximo; los mapas ya vistos salen de la caché en disco
    while (next < refs.length) {
      const ref = refs[next++];
      try { maps.push(await cloud.umf(ref.pmapId, ref.version)); } catch (error) { if (error.code === 'expired' || error.code === 'no-session') authError = error; }   // los que ya están en caché siguen valiendo sin sesión
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (authError && !maps.length) throw authError;
  const value = mergeMissions(maps);
  mapCache = { key, value };
  return value;
}
app.get('/api/cloud/status', (_req, res) => res.json(cloud.status()));
app.get('/api/cloud/history', async (_req, res) => {
  try {
    const missions = (await cloud.missionHistory()).map(normalizeMission).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    res.json({ missions, total: missions.length });
  } catch (error) { cloudFail(res, error); }
});
app.get('/api/cloud/parts', async (_req, res) => {
  try { res.json(normalizeParts(await cloud.robotParts())); } catch (error) { cloudFail(res, error); }
});
app.get('/api/cloud/map', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 60));
    const map = await buildCloudMap(limit);
    if (!map) return res.status(404).json({ error: 'Todavía no hay mapas de misiones con base reconocida.', code: 'empty' });
    res.json(map);
  } catch (error) { cloudFail(res, error); }
});
app.get('/api/rooms', async (_req, res) => {
  let map = null;
  try { map = localMap.snapshot() || await buildCloudMap(60); } catch (_) { /* sin nube: se devuelven sin cobertura */ }
  res.json({ rooms: measure(rooms.list(), map) });
});
app.put('/api/rooms', async (req, res) => {
  try { rooms.set((req.body || {}).rooms); } catch (error) { return res.status(400).json({ error: error.message }); }
  let map = null;
  try { map = localMap.snapshot() || await buildCloudMap(60); } catch (_) { /* igual */ }
  res.json({ rooms: measure(rooms.list(), map) });
});
// Piezas sin nube: horas del robot (bbrun.hr) menos las de su instalación
const runHours = () => { const h = (core.state.bbrun || {}).hr; return Number.isFinite(h) ? h : null; };
app.get('/api/parts', (_req, res) => res.json({ parts: localParts.list(runHours()), runHours: runHours() }));
app.post('/api/parts/:id', (req, res) => {
  try { res.json({ parts: localParts.update(req.params.id, req.body, runHours()), runHours: runHours() }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.get('/api/localmap', (_req, res) => {
  const map = localMap.snapshot();
  if (!map) return res.status(404).json({ error: 'Todavía no hay mapa propio: se construye con la posición del robot durante las misiones (experimental).', code: 'empty' });
  res.json(map);
});
app.get('/api/maintenance', (_req, res) => res.json(summarize(core.state)));
app.get('/api/raw', (_req, res) => res.json(core.state));
app.get('/api/schedule', (_req, res) => res.json(core.state.cleanSchedule2 || []));
// warnings: programaciones que empezarían dentro de una franja de No molestar (no se desactivan solas, a diferencia de la app)
app.post('/api/schedule', (req, res) => {
  try {
    const items = (req.body || {}).items;
    core.setSchedule(items);
    res.json({ ok: true, warnings: dnd.scheduleConflicts(dndStore.list(), items) });
  } catch (error) { res.status(STATUS[error.code] || 500).json({ error: error.message }); }
});
app.get('/api/dnd', (_req, res) => res.json(dndState()));
app.post('/api/dnd', (req, res) => {
  try { dndStore.set((req.body || {}).items); } catch (error) { return res.status(400).json({ error: error.message }); }
  dndGuard.reset();   // guardar no manda el robot a la base: solo el comienzo de una franja por la hora termina misiones
  broadcast();
  res.json(dndState());
});
app.post('/api/pref', (req, res) => handle(res, () => core.setPref((req.body || {}).key, (req.body || {}).value)));
app.post('/api/cmd', (req, res) => handle(res, () => core.command((req.body || {}).command)));
app.post('/api/experimental/pref', (req, res) => handle(res, () => core.setExperimentalPref((req.body || {}).key, (req.body || {}).value)));
app.post('/api/experimental/position', (_req, res) => handle(res, () => core.requestPosition()));
app.post('/api/experimental/cmd', (req, res) => handle(res, () => core.experimentalCommand((req.body || {}).command)));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  if (guard.check(request.headers) || new URL(request.url, `http://${request.headers.host}`).pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});
wss.on('connection', (ws) => ws.send(JSON.stringify(summary())));

core.start();
dndGuard.start();
if (mockMode) console.log('Modo simulado activo: no se conectará al robot.');
server.listen(PORT, HOST, () => console.log(`LibreRoomba disponible en http://${HOST}:${PORT}`));
