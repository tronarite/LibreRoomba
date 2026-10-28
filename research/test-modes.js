// Prueba modos de limpieza extra en el robot real y lo devuelve a la base. Uso: node test-modes.js quick spot train regions [segundos]
// Por cada modo: envía la orden, registra 30 s (fase, ciclo, notReady, error, operatingMode, lastCommand) y, si el robot salió,
// stop -> espera notReady 0 (+3 s) -> dock si no está cargando (la i1+ ignora dock en run y durante el 39 tras el stop).
// `regions` envía la orden de limpieza por habitaciones con ids falsos (la i1+ no tiene pmaps): solo observar si la rechaza.
// No cambia ningún ajuste. Requiere ROBOT_IP y ROBOT_BLID y que no haya otra conexión local (parar app/server.js).
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const args = process.argv.slice(2);
const secs = Number(args.find((a) => /^\d+$/.test(a)) || 30);
const modes = args.filter((a) => !/^\d+$/.test(a));
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let last = '';
const ms = () => st.cleanMissionStatus || {};
function line() {
  const m = ms();
  return JSON.stringify({ phase: m.phase, cycle: m.cycle, nr: m.notReady, err: m.error, op: m.operatingMode, ini: m.initiator, dock: st.dock && st.dock.state, last: st.lastCommand && st.lastCommand.command });
}
c.on('message', (_t, raw) => {
  try { const r = JSON.parse(raw).state?.reported; if (!r) return; merge(st, r); const l = line(); if (l !== last && st.pmaps !== undefined) { last = l; console.log(ts(), l); } } catch {}
});
c.on('error', (e) => { console.log('error', e.message); process.exit(1); });
const publish = (body) => { c.publish('cmd', JSON.stringify({ time: Math.floor(Date.now() / 1000), initiator: 'localApp', ...body })); console.log(ts(), 'orden:', JSON.stringify(body)); };
async function until(check, maxMs) { const end = Date.now() + maxMs; while (Date.now() < end) { if (check()) return true; await wait(250); } return false; }

async function home() {
  if (ms().phase === 'charge') return true;
  if (ms().phase === 'run') { publish({ command: 'stop' }); await until(() => ms().phase !== 'run', 10000); }
  await until(() => ms().notReady === 0, 15000); await wait(3000);
  if (ms().phase === 'charge') return true;
  publish({ command: 'dock' });
  return until(() => ms().phase === 'charge', 240000);
}

const BODIES = {
  quick: { command: 'quick' }, spot: { command: 'spot' }, train: { command: 'train' },
  regions: { command: 'clean', ordered: 1, pmap_id: 'prueba-sin-pmap', user_pmapv_id: 'prueba', regions: [{ region_id: '1', type: 'rid' }] }
};
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  await until(() => st.pmaps !== undefined, 15000);
  console.log(ts(), 'inicio', line(), 'bat', st.batPct);
  for (const mode of modes) {
    if (!BODIES[mode]) { console.log('modo desconocido', mode); continue; }
    if (ms().phase !== 'charge') { console.log(ts(), 'el robot no está en la base: paro aquí'); break; }
    console.log(`\n=== ${mode} ===`);
    publish(BODIES[mode]);
    await wait(secs * 1000);
    const m = ms();
    if (m.phase === 'stuck' || (m.error && m.error !== 0)) { console.log(ts(), `ATASCO/ERROR (error ${m.error}, notReady ${m.notReady}): paro las pruebas; el robot necesita ayuda`); break; }
    const ok = await home();
    console.log(ts(), ok ? 'de vuelta en la base' : 'NO volvió a la base');
    if (!ok) break;
    await until(() => ms().phase === 'charge' && (st.dock || {}).state === 301, 60000);   // tras un posible vaciado
    await wait(3000);
  }
  console.log(ts(), 'final', line(), 'bat', st.batPct);
  c.end(); setTimeout(() => process.exit(0), 500);
})();
setTimeout(() => { console.log('timeout global'); process.exit(1); }, (modes.length * (secs + 330) + 60) * 1000);
