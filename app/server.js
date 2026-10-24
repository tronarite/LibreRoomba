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
const { createCloud, normalizeMission, mapRef } = require('./core/cloud');
const { createFakeCloud } = require('./core/fake-cloud');
const { normalizeParts } = require('./core/parts');
const { mergeMissions } = require('./core/mapmerge');
const { Notifier } = require('./core/notifier');

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
  core = new RobotCore({ ip: process.env.ROBOT_IP, blid, password, experimental: EXPERIMENTAL, discover: discovering });
  core.on('ip-changed', ({ to }) => console.log(`El robot cambió de IP; ahora responde en ${to}.`));
}
core.on('error', (error) => console.error('Error MQTT:', error.message));
core.on('auth-failed', () => console.error(AUTH_HELP));
core.on('auth-recovered', () => console.log('El robot vuelve a aceptar la contraseña.'));

const AUTH_HELP = 'El robot rechaza la contraseña local (¿se ha vuelto a emparejar?). Con el robot en la base, mantén HOME 2-3 s hasta que parpadee el icono Wi-Fi y ejecuta: node research/get-password.js <ip>. Después reinicia el servidor.';
const VERSION = require('./package.json').version;
// Avisos (depósito lleno, misión terminada, errores...): solo transiciones, con antirrebote; en memoria (últimos 50)
const notifier = new Notifier(core, { authHelp: AUTH_HELP });

function getPath(object, paths) {
  for (const dottedPath of paths) {
    const value = dottedPath.split('.').reduce((item, key) => item == null ? undefined : item[key], object);
    if (value !== undefined) return value;
  }
  return undefined;
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
    experimental: EXPERIMENTAL,
    experimentalPrefs: { odoaMode: state.odoaMode, suctionLevel: state.suctionLevel, chrgLrPtrn: state.chrgLrPtrn },
    lastUpdate: core.lastUpdate
  };
}

function broadcast() {
  const message = JSON.stringify(summary());
  wss.clients.forEach((client) => { if (client.readyState === client.OPEN) client.send(message); });
}
core.on('state', () => { history.observe(core.state); broadcast(); });
core.on('connected', broadcast);
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
const cloud = mockMode ? createFakeCloud() : createCloud({ cacheDir: path.join(__dirname, 'data') });
const CLOUD_STATUS = { 'no-session': 401, expired: 401, invalid: 400, network: 502, http: 502 };
function cloudFail(res, error) {
  res.status(CLOUD_STATUS[error.code] || 500).json({ error: error.message, code: error.code || 'internal' });
}
let mapCache = { key: null, value: null };
async function buildCloudMap(limit) {
  const refs = (await cloud.missionHistory()).map(mapRef).filter(Boolean).slice(0, limit);
  const key = refs.map((r) => `${r.pmapId}:${r.version}`).join(',');
  if (mapCache.key === key) return mapCache.value;
  const maps = [];
  let next = 0;
  async function worker() {                                  // 3 descargas a la vez como máximo; los mapas ya vistos salen de la caché en disco
    while (next < refs.length) {
      const ref = refs[next++];
      try { maps.push(await cloud.umf(ref.pmapId, ref.version)); } catch (error) { if (error.code === 'expired' || error.code === 'no-session') throw error; }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
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
app.get('/api/maintenance', (_req, res) => res.json(summarize(core.state)));
app.get('/api/raw', (_req, res) => res.json(core.state));
app.get('/api/schedule', (_req, res) => res.json(core.state.cleanSchedule2 || []));
app.post('/api/schedule', (req, res) => handle(res, () => core.setSchedule((req.body || {}).items)));
app.post('/api/pref', (req, res) => handle(res, () => core.setPref((req.body || {}).key, (req.body || {}).value)));
app.post('/api/cmd', (req, res) => handle(res, () => core.command((req.body || {}).command)));
app.post('/api/experimental/pref', (req, res) => handle(res, () => core.setExperimentalPref((req.body || {}).key, (req.body || {}).value)));
app.post('/api/experimental/cmd', (req, res) => handle(res, () => core.experimentalCommand((req.body || {}).command)));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url, `http://${request.headers.host}`).pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});
wss.on('connection', (ws) => ws.send(JSON.stringify(summary())));

core.start();
if (mockMode) console.log('Modo simulado activo: no se conectará al robot.');
server.listen(PORT, HOST, () => console.log(`LibreRoomba disponible en http://${HOST}:${PORT}`));
