// Tras activar PMAP_CL_FSW en la cuenta: prueba pmapLearningAllowed y pmapCL por delta y por shadow desired; observa optFeats; restaura. Uso: node test-pmaplearn.js
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
c.on('message', (_t, m) => { try { const r = JSON.parse(m).state?.reported; if (r) merge(st, r); } catch {} });
c.on('error', (e) => { console.log('error', e.message); process.exit(1); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = () => JSON.stringify({ pmapLearningAllowed: st.pmapLearningAllowed, pmapCL: st.pmapCL, pmapEnabled: st.optFeats?.pmaps?.enabled, cap_pmaps: st.cap?.pmaps, pmaps: st.pmaps?.length });
const send = (kind, o) => c.publish(kind === 'delta' ? 'delta' : `$aws/things/${b}/shadow/update`, JSON.stringify({ state: kind === 'delta' ? o : { desired: o } }));
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  while (st.pmaps === undefined) await wait(500);
  console.log('inicial :', snap());
  const orig = { pmapLearningAllowed: st.pmapLearningAllowed };
  for (const kind of ['delta', 'desired']) {
    send(kind, { pmapLearningAllowed: true }); await wait(6000); console.log(`${kind}/pmapLearningAllowed=true :`, snap());
    send(kind, { pmapCL: true }); await wait(6000); console.log(`${kind}/pmapCL=true              :`, snap());
  }
  send('delta', orig); await wait(4000);
  if (st.pmapCL !== undefined) { send('delta', { pmapCL: false }); await wait(3000); }
  console.log('final   :', snap());
  c.end(); setTimeout(() => process.exit(0), 300);
})();
setTimeout(() => { console.log('timeout global'); process.exit(1); }, 90000);
