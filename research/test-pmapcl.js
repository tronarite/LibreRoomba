// Prueba {"pmapCL":true} por delta y por shadow desired; observa pmapCL, pmapLearningAllowed y optFeats; restaura. Uso: node test-pmapcl.js
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
c.on('message', (_t, m) => { try { const r = JSON.parse(m).state?.reported; if (r) merge(st, r); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = () => JSON.stringify({ pmapCL: st.pmapCL, pmapLearningAllowed: st.pmapLearningAllowed, optFeats: st.optFeats, pmaps: st.pmaps, cap: st.cap });
c.on('error', (e) => { console.log('error', e.message); process.exit(1); });
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  while (st.pmaps === undefined) await wait(500);
  console.log('inicial :', snap());
  const orig = st.pmapCL;
  for (const [label, topic, body] of [
    ['delta', 'delta', { state: { pmapCL: true } }],
    ['desired', `$aws/things/${b}/shadow/update`, { state: { desired: { pmapCL: true } } }],
  ]) {
    c.publish(topic, JSON.stringify(body)); await wait(5000);
    console.log(label.padEnd(8), ':', snap());
  }
  if (orig !== undefined) { c.publish('delta', JSON.stringify({ state: { pmapCL: orig } })); await wait(3000); }
  else console.log('pmapCL no estaba reportado; no hay valor previo que restaurar');
  console.log('final   :', snap());
  c.end(); process.exit(0);
})();
setTimeout(() => { console.log('timeout global'); process.exit(1); }, 60000);
