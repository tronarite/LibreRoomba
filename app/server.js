const http = require('http');
const fs = require('fs');
const path = require('path');
const constants = require('constants');

const ROBOT_IP = process.env.ROBOT_IP;
const ROBOT_BLID = process.env.ROBOT_BLID;
if (!process.env.MOCK && !process.argv.includes('--mock') && (!process.env.ROBOT_IP || !process.env.ROBOT_BLID)) {
  console.error('Falta ROBOT_IP o ROBOT_BLID (variables de entorno). Ver README.md.');
  process.exit(1);
}
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const mockMode = process.argv.includes('--mock') || process.env.MOCK === '1';
const COMMANDS = new Set(['start', 'stop', 'pause', 'resume', 'dock', 'find']);
// Ajustes verificados en el robot (research/inventory/roadmap.md): el robot los acepta en el topic delta.
const PREFS = { twoPass: (v) => typeof v === 'boolean', binPause: (v) => typeof v === 'boolean', openOnly: (v) => typeof v === 'boolean', childLock: (v) => typeof v === 'boolean', rankOverlap: (v) => [15, 25, 67, 85].includes(v), ecoCharge: (v) => typeof v === 'boolean', schedHold: (v) => typeof v === 'boolean', binTypeDetect: (v) => typeof v === 'boolean', name: (v) => typeof v === 'string' && /^[^\x00-\x1f]{1,20}$/.test(v.trim()) };
const PREF_TRANSFORM = { binTypeDetect: (v) => Number(v), name: (v) => v.trim() };   // el robot guarda binTypeDetect como 0/1
// SIN PROBAR en el robot (research/inventory/pending-robot-tests.md). Solo se aceptan con LIBREROOMBA_EXPERIMENTAL=1 (o en --mock).
const EXPERIMENTAL = process.env.LIBREROOMBA_EXPERIMENTAL === '1' || (mockMode && process.env.LIBREROOMBA_EXPERIMENTAL !== '0');
const EXPERIMENTAL_PREFS = { dispLight: (v) => typeof v === 'boolean', odoaMode: (v) => typeof v === 'boolean', suctionLevel: (v) => Number.isInteger(v) && v >= 0 && v <= 3, chrgLrPtrn: (v) => Number.isInteger(v) && v >= 0 && v <= 3 };
const EXPERIMENTAL_COMMANDS = new Set(['evac']);
const express = require('express');
const mqtt = require('mqtt');
const { WebSocketServer } = require('ws');
const { createHistory } = require('./history');
const { summarize } = require('./maintenance');
const schedule = require('./schedule');

const history = createHistory(path.join(__dirname, 'data', 'history.json'));

let state = {};
let connected = false;
let lastUpdate = null;
let mqttClient = null;
let reconnectTimer = null;
let reconnectDelay = 1000;

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function getPath(object, paths) {
  for (const dottedPath of paths) {
    const value = dottedPath.split('.').reduce((item, key) => item == null ? undefined : item[key], object);
    if (value !== undefined) return value;
  }
  return undefined;
}

function summary() {
  return {
    connected,
    batPct: getPath(state, ['batPct', 'battery.batPct']),
    phase: getPath(state, ['cleanMissionStatus.phase']),
    cycle: getPath(state, ['cleanMissionStatus.cycle']),
    error: getPath(state, ['cleanMissionStatus.error', 'error']),
    bin: {
      present: getPath(state, ['bin.present']),
      full: getPath(state, ['bin.full'])
    },
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
    experimentalPrefs: { dispLight: state.dispLight, odoaMode: state.odoaMode, suctionLevel: state.suctionLevel, chrgLrPtrn: state.chrgLrPtrn },
    lastUpdate
  };
}

function broadcast() {
  const message = JSON.stringify(summary());
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(message);
  });
}

function updateState(delta) {
  deepMerge(state, delta);
  lastUpdate = new Date().toISOString();
  history.observe(state);
  broadcast();
}

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  broadcast();
}

function robotPassword() {
  if (process.env.ROBOT_PASSWORD) return process.env.ROBOT_PASSWORD;
  return fs.readFileSync(path.resolve(__dirname, '../research/robot-password.txt'), 'utf8').trim();
}

function scheduleReconnect() {
  if (mockMode || reconnectTimer) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (mqttClient) mqttClient.reconnect();
  }, delay);
}

function connectRobot() {
  let password;
  try {
    password = robotPassword();
  } catch (_) {
    console.error('No se pudo leer la contraseña del robot. Configure ROBOT_PASSWORD o el archivo indicado.');
    return;
  }

  mqttClient = mqtt.connect(`mqtts://${ROBOT_IP}:8883`, {
    clientId: ROBOT_BLID,
    username: ROBOT_BLID,
    password,
    protocolVersion: 4,
    rejectUnauthorized: false,
    ciphers: 'AES128-SHA256',
    secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
    minVersion: 'TLSv1',
    reconnectPeriod: 0
  });

  mqttClient.on('connect', () => {
    reconnectDelay = 1000;
    setConnected(true);
    mqttClient.subscribe('#');
  });
  mqttClient.on('message', (_topic, payload) => {
    try {
      const message = JSON.parse(payload.toString());
      if (message && message.state && message.state.reported) updateState(message.state.reported);
    } catch (_) {
      // Algunos topics no contienen JSON de estado; se ignoran.
    }
  });
  mqttClient.on('close', () => {
    setConnected(false);
    scheduleReconnect();
  });
  mqttClient.on('error', (error) => {
    console.error('Error MQTT:', error.message);
    setConnected(false);
  });
}

function mockCommand(command) {
  const phases = { start: 'run', resume: 'run', pause: 'stop', stop: 'stop', dock: 'hmUsrDock', evac: 'evac' };
  if (!phases[command]) return;   // find: sin cambio de fase
  updateState({ cleanMissionStatus: { phase: phases[command], cycle: command === 'dock' || command === 'evac' ? 'none' : 'clean' } });
  if (command === 'dock' || command === 'evac') {
    setTimeout(() => updateState({ cleanMissionStatus: { phase: 'charge', cycle: 'none' }, batPct: Math.min(100, (state.batPct || 0) + 1) }), 4000);
  }
}

function sendPref(key, value) {
  if (mockMode) return updateState({ [key]: value });
  if (!mqttClient || !connected) throw new Error('Robot desconectado');
  mqttClient.publish('delta', JSON.stringify({ state: { [key]: value } }));
}

function sendSchedule(items) {
  if (mockMode) return updateState({ cleanSchedule2: items });
  if (!mqttClient || !connected) throw new Error('Robot desconectado');
  mqttClient.publish('delta', JSON.stringify({ state: { cleanSchedule2: items } }));
}

function sendCommand(command) {
  if (mockMode) return mockCommand(command);
  if (!mqttClient || !connected) throw new Error('Robot desconectado');
  mqttClient.publish('cmd', JSON.stringify({ command, time: Math.floor(Date.now() / 1000), initiator: 'localApp' }));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/state', (_req, res) => res.json(summary()));
app.get('/api/history', (_req, res) => res.json(history.list()));
app.get('/api/maintenance', (_req, res) => res.json(summarize(state)));
app.get('/api/raw', (_req, res) => res.json(state));
app.get('/api/schedule', (_req, res) => res.json(state.cleanSchedule2 || []));
app.post('/api/schedule', (req, res) => {
  try {
    const items = schedule.validate((req.body || {}).items);
    const clashes = schedule.conflicts(items);
    if (clashes.length) return res.status(400).json({ error: 'Hay programaciones que coinciden en día y hora.' });
    sendSchedule(items);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.message === 'Robot desconectado' ? 503 : 400).json({ error: error.message });
  }
});
app.post('/api/pref', (req, res) => {
  const { key, value } = req.body || {};
  if (!Object.hasOwn(PREFS, key) || !PREFS[key](value)) return res.status(400).json({ error: 'Ajuste no válido' });
  try {
    sendPref(key, PREF_TRANSFORM[key] ? PREF_TRANSFORM[key](value) : value);
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});
// Funciones sin probar: cerradas salvo LIBREROOMBA_EXPERIMENTAL=1 (o --mock)
app.post('/api/experimental/pref', (req, res) => {
  if (!EXPERIMENTAL) return res.status(403).json({ error: 'Funciones experimentales desactivadas (LIBREROOMBA_EXPERIMENTAL=1)' });
  const { key, value } = req.body || {};
  if (!Object.hasOwn(EXPERIMENTAL_PREFS, key) || !EXPERIMENTAL_PREFS[key](value)) return res.status(400).json({ error: 'Ajuste no válido' });
  try {
    sendPref(key, value);
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});
app.post('/api/experimental/cmd', (req, res) => {
  if (!EXPERIMENTAL) return res.status(403).json({ error: 'Funciones experimentales desactivadas (LIBREROOMBA_EXPERIMENTAL=1)' });
  const { command } = req.body || {};
  if (!EXPERIMENTAL_COMMANDS.has(command)) return res.status(400).json({ error: 'Comando no válido' });
  try {
    sendCommand(command);
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});
app.post('/api/cmd', (req, res) => {
  const { command } = req.body || {};
  if (!COMMANDS.has(command)) return res.status(400).json({ error: 'Comando no válido' });
  try {
    sendCommand(command);
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url, `http://${request.headers.host}`).pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});
wss.on('connection', (ws) => ws.send(JSON.stringify(summary())));

if (mockMode) {
  updateState({
    name: 'Roomba i1+', batPct: 82, softwareVer: 'mock-1.0', mssnM: 0, rssi: -53,
    bin: { present: true, full: false }, cleanMissionStatus: { phase: 'charge', cycle: 'none', error: 0 },
    sku: 'mock-sku', country: 'ES', timezone: 'Europe/Madrid', cloudEnv: 'prod', evacAllowed: true,
    langs2: { sLang: 'es-ES', dLangs: { langs: ['de-DE', 'en-GB', 'es-ES', 'fr-FR', 'it-IT'] } }, dock: { fwVer: 'mock' }
  });
  setConnected(true);
  console.log('Modo simulado activo: no se conectará al robot.');
} else {
  connectRobot();
}

server.listen(PORT, HOST, () => console.log(`LibreRoomba disponible en http://${HOST}:${PORT}`));
