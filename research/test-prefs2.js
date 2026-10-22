// Pruebas con restauración: openOnly, childLock, reescritura idéntica de cleanSchedule2 y comando find.
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
c.on('message', (_t, m) => { try { const j = JSON.parse(m); if (j.state?.reported) merge(st, j.state.reported); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);
const sendA = (o) => c.publish('delta', JSON.stringify({ state: o }));
const sendB = (o) => c.publish(`$aws/things/${b}/shadow/update`, JSON.stringify({ state: { desired: o } }));
async function trySet(obj) {
  for (const [label, send] of [['delta', sendA], ['desired', sendB]]) {
    send(obj); await wait(4000);
    if (Object.keys(obj).every((k) => same(st[k], obj[k]))) return label;
  }
  return null;
}
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  while (st.pmaps === undefined) await wait(500);
  const sched = JSON.parse(JSON.stringify(st.cleanSchedule2));
  for (const k of ['openOnly', 'childLock']) {
    const orig = st[k];
    const via = await trySet({ [k]: !orig });
    console.log(k.padEnd(12), via ? `ACEPTADO vía ${via}` : 'ignorado');
    const back = await trySet({ [k]: orig });
    console.log('  restaurado:', back ? 'sí' : 'NO -> estado ' + st[k]);
  }
  // Reescritura idéntica: demuestra el canal sin cambiar nada.
  sendA({ cleanSchedule2: sched }); await wait(4000);
  console.log('cleanSchedule2 idéntica reenviada; sigue igual:', same(st.cleanSchedule2, sched), '| lastCommand:', JSON.stringify(st.lastCommand));
  c.publish('cmd', JSON.stringify({ command: 'find', time: Math.floor(Date.now() / 1000), initiator: 'localApp' })); await wait(4000);
  console.log('find -> lastCommand:', JSON.stringify(st.lastCommand), 'fase:', st.cleanMissionStatus?.phase);
  c.end(); process.exit(0);
})();
setTimeout(() => { console.log('timeout'); process.exit(1); }, 90000);
