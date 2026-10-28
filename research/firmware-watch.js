// Foto del estado del robot ANTES de una petición OTA y vigilancia DESPUÉS. Solo lectura: no manda nada al robot ni a la nube.
// Usa la web app ya en marcha (solo cabe 1 conexión MQTT local): GET /api/raw (estado completo) y GET /api/state (connected).
// Uso: node research/firmware-watch.js snapshot
//      node research/firmware-watch.js watch [--minutes 30]
// Variable: LIBREROOMBA_URL (por defecto http://localhost:3000). Salidas en research/firmware/ (ignorada por git), sin BLID/IP/MAC.
const fs = require('fs');
const path = require('path');

const BASE = (process.env.LIBREROOMBA_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.join(__dirname, 'firmware');
const POLL_MS = 5000;
const MIN_BATTERY = 60;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// Quita identificadores del robot de cualquier texto o JSON que se escriba a disco.
function scrub(text) {
  return String(text)
    .replace(/\b[0-9A-Fa-f]{32}\b/g, '<BLID>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<IP>')
    .replace(/\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g, '<MAC>');
}

async function fetchJson(route) {
  const response = await fetch(BASE + route);
  if (!response.ok && response.status !== 503) throw new Error(`HTTP ${response.status} en ${route}`);
  return response.json();
}

async function read() {
  const [state, summary] = await Promise.all([fetchJson('/api/raw'), fetchJson('/api/state')]);
  return { state, connected: !!summary.connected };
}

function pick(state, connected) {
  return {
    connected,
    softwareVer: get(state, 'softwareVer'),
    subModSwVer: get(state, 'subModSwVer'),
    hwPartsRev: get(state, 'hwPartsRev'),
    secureBoot: get(state, 'secureBoot'),
    deploymentState: get(state, 'deploymentState'),
    svcEndpoints: get(state, 'svcEndpoints'),
    cap: { ota: get(state, 'cap.ota'), langOta: get(state, 'cap.langOta') },
    batPct: get(state, 'batPct'),
    cleanMissionStatus: {
      phase: get(state, 'cleanMissionStatus.phase'), cycle: get(state, 'cleanMissionStatus.cycle'),
      notReady: get(state, 'cleanMissionStatus.notReady'), error: get(state, 'cleanMissionStatus.error')
    },
    dock: { state: get(state, 'dock.state'), fwVer: get(state, 'dock.fwVer') },
    bin: get(state, 'bin'),
    tz: get(state, 'tz')
  };
}

function preconditions(s) {
  const problems = [];
  const m = s.cleanMissionStatus;
  if (!s.connected) problems.push('el robot no está conectado a la web app');
  if (m.phase !== 'charge' && m.phase !== 'stop') problems.push(`fase "${m.phase}" (debe ser charge o stop, en la base)`);
  if (s.dock.state !== 301) problems.push(`dock.state ${s.dock.state} (301 = en la base y lista)`);
  if (typeof s.batPct !== 'number' || s.batPct < MIN_BATTERY) problems.push(`batería ${s.batPct}% (mínimo ${MIN_BATTERY}%)`);
  if (m.cycle && m.cycle !== 'none') problems.push(`misión en curso (cycle "${m.cycle}")`);
  if (m.error) problems.push(`error activo ${m.error}`);
  if (m.notReady) problems.push(`notReady ${m.notReady}`);
  return problems;
}

async function snapshot() {
  const { state, connected } = await read();
  const snap = pick(state, connected);
  const problems = preconditions(snap);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `pre-ota-state-${stamp()}.json`);
  fs.writeFileSync(file, scrub(JSON.stringify({ takenAt: new Date().toISOString(), ready: problems.length === 0, problems, state: snap }, null, 2)));
  console.log(scrub(JSON.stringify(snap, null, 2)));
  console.log(`\nGuardado en ${path.relative(process.cwd(), file)}`);
  if (problems.length) {
    console.log('\nCONDICIONES PREVIAS NO CUMPLIDAS:');
    for (const p of problems) console.log(` - ${p}`);
    process.exit(2);
  }
  console.log('Condiciones previas OK (en la base, cargado, sin misión ni error).');
}

async function watch(minutes) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `ota-watch-${stamp()}.log`);
  const log = (line, big = false) => {
    const text = scrub(`${new Date().toISOString()} ${line}`);
    console.log(big ? `\n!!!!!!!! ${text} !!!!!!!!\n` : text);
    fs.appendFileSync(file, text + '\n');
  };
  const view = (s) => ({ ver: s.softwareVer, dep: s.deploymentState, phase: s.cleanMissionStatus.phase, bat: s.batPct, conn: s.connected });
  log(`Vigilando ${minutes} min cada ${POLL_MS / 1000} s (solo lectura). Registro: ${path.relative(process.cwd(), file)}`);
  let prev = null;
  let lastBat = null;
  let failures = 0;
  const end = Date.now() + minutes * 60000;
  while (Date.now() < end) {
    let cur;
    try {
      const { state, connected } = await read();
      cur = view(pick(state, connected));
      failures = 0;
    } catch (error) {
      failures++;
      if (failures === 1) log(`la web app no responde (${error.message})`, true);
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    if (!prev) {
      log(`inicio: ${JSON.stringify(cur)}`);
      lastBat = cur.bat;
    } else {
      const changes = [];
      if (cur.ver !== prev.ver) { changes.push(`softwareVer ${prev.ver} -> ${cur.ver}`); log(`CAMBIO DE VERSIÓN DE FIRMWARE: ${prev.ver} -> ${cur.ver}`, true); }
      if (cur.dep !== prev.dep) { changes.push(`deploymentState ${prev.dep} -> ${cur.dep}`); log(`CAMBIO DE deploymentState (posible OTA): ${prev.dep} -> ${cur.dep}`, true); }
      if (cur.conn !== prev.conn) { changes.push(`connected ${prev.conn} -> ${cur.conn}`); if (!cur.conn) log('ROBOT DESCONECTADO (la actualización puede reiniciarlo)', true); else log('Robot reconectado', true); }
      if (cur.phase !== prev.phase) changes.push(`fase ${prev.phase} -> ${cur.phase}`);
      if (typeof cur.bat === 'number' && typeof lastBat === 'number' && Math.abs(cur.bat - lastBat) >= 5) { changes.push(`batería ${lastBat}% -> ${cur.bat}%`); lastBat = cur.bat; }
      if (changes.length) log(changes.join(' | '));
    }
    prev = cur;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  log('Fin de la vigilancia.');
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'snapshot') return snapshot();
  if (mode === 'watch') {
    const i = process.argv.indexOf('--minutes');
    const minutes = i > 0 ? Number(process.argv[i + 1]) : 30;
    if (!(minutes > 0)) throw new Error('--minutes debe ser un número positivo');
    return watch(minutes);
  }
  console.log('Uso: node research/firmware-watch.js snapshot | watch [--minutes 30]');
  process.exit(1);
}

main().catch((error) => { console.error(`Error: ${error.message}`); process.exit(1); });
