// Cambia la hora de la 1ª entrada de cleanSchedule2 (+1 h), verifica y restaura. Deja siempre el valor original.
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
c.on('message', (_t, m) => { try { const r = JSON.parse(m).state?.reported; if (r) for (const k of Object.keys(r)) st[k] = r[k]; } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const sendA = (o) => c.publish('delta', J({ state: o }));
const sendB = (o) => c.publish(`$aws/things/${b}/shadow/update`, J({ state: { desired: o } }));
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  while (st.cleanSchedule2 === undefined) await wait(500);
  const orig = JSON.parse(J(st.cleanSchedule2));
  const changed = JSON.parse(J(orig)); changed[0].start.hour = (changed[0].start.hour + 1) % 24;
  let via = null;
  for (const [label, send] of [['delta', sendA], ['desired', sendB]]) { send({ cleanSchedule2: changed }); await wait(4000); if (J(st.cleanSchedule2) === J(changed)) { via = label; break; } }
  console.log('cambio de hora:', via ? `ACEPTADO vía ${via}` : 'ignorado', '| ahora hora =', st.cleanSchedule2?.[0]?.start?.hour);
  for (let i = 0; i < 3 && J(st.cleanSchedule2) !== J(orig); i++) { (via === 'desired' ? sendB : sendA)({ cleanSchedule2: orig }); await wait(4000); }
  console.log('restaurada a la original:', J(st.cleanSchedule2) === J(orig), '| hora =', st.cleanSchedule2?.[0]?.start?.hour);
  c.end(); process.exit(J(st.cleanSchedule2) === J(orig) ? 0 : 2);
})();
setTimeout(() => { console.log('timeout'); process.exit(1); }, 60000);
