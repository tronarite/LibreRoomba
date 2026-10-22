// Prueba ajustes inofensivos: cambia, verifica lo reportado, restaura y verifica. Uso: node test-prefs.js
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
c.on('message', (_t, m) => { try { const r = JSON.parse(m).state?.reported; if (r) merge(st, r); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);
const sendA = (o) => c.publish('delta', JSON.stringify({ state: o }));
const sendB = (o) => c.publish(`$aws/things/${b}/shadow/update`, JSON.stringify({ state: { desired: o } }));
async function trySet(name, obj) {
  const keys = Object.keys(obj);
  for (const [label, send] of [['delta', sendA], ['desired', sendB]]) {
    send(obj); await wait(4000);
    if (keys.every((k) => same(st[k], obj[k]))) return label;
  }
  return null;
}
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  while (st.pmaps === undefined) await wait(500);
  const tests = [];
  const flip = (k) => typeof st[k] === 'boolean' || st[k] === 0 || st[k] === 1 ? (typeof st[k] === 'boolean' ? !st[k] : 1 - st[k]) : undefined;
  if ('carpetBoost' in st && 'vacHigh' in st) tests.push(['carpetBoost', { carpetBoost: !st.carpetBoost, vacHigh: st.vacHigh }, { carpetBoost: st.carpetBoost, vacHigh: st.vacHigh }]);
  if ('vacHigh' in st && 'carpetBoost' in st) tests.push(['vacHigh', { carpetBoost: st.carpetBoost, vacHigh: !st.vacHigh }, { carpetBoost: st.carpetBoost, vacHigh: st.vacHigh }]);
  if ('twoPass' in st) tests.push(['twoPass', { twoPass: !st.twoPass, noAutoPasses: st.noAutoPasses }, { twoPass: st.twoPass, noAutoPasses: st.noAutoPasses }]);
  if ('rankOverlap' in st) tests.push(['rankOverlap', { rankOverlap: st.rankOverlap === 25 ? 85 : 25 }, { rankOverlap: st.rankOverlap }]);
  if ('binPause' in st) tests.push(['binPause', { binPause: !st.binPause }, { binPause: st.binPause }]);
  if ('dispLight' in st) tests.push(['dispLight', { dispLight: !st.dispLight }, { dispLight: st.dispLight }]);
  console.log('valores iniciales:', JSON.stringify(Object.fromEntries(['carpetBoost', 'vacHigh', 'twoPass', 'noAutoPasses', 'rankOverlap', 'binPause', 'dispLight'].map((k) => [k, st[k]]))));
  const initial = {}; tests.forEach(([, , orig]) => Object.assign(initial, orig));
  for (const [name, change, orig] of tests) {
    const via = await trySet(name, change);
    console.log(name.padEnd(12), via ? `ACEPTADO vía ${via}` : 'ignorado');
    const back = await trySet(name, orig);
    if (!back) { console.log('  ! no pude restaurar', name, JSON.stringify(orig), 'estado actual', JSON.stringify(Object.fromEntries(Object.keys(orig).map((k) => [k, st[k]])))); }
  }
  const bad = Object.entries(initial).filter(([k, v]) => !same(st[k], v));
  console.log(bad.length ? 'DIFERENCIAS FINALES: ' + JSON.stringify(bad) : 'todo restaurado a los valores iniciales');
  c.end(); process.exit(0);
})();
setTimeout(() => { console.log('timeout global'); process.exit(1); }, 150000);
