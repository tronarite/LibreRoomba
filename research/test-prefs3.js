// Prueba ajustes reportados (ecoCharge, noPP, schedHold, binTypeDetect, name): cambia, verifica, restaura. Uso: node test-prefs3.js
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
c.on('message', (_t, m) => { try { const r = JSON.parse(m).state?.reported; if (r) merge(st, r); } catch {} });
c.on('error', (e) => { console.log('error', e.message); process.exit(1); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (label, o) => c.publish(label === 'delta' ? 'delta' : `$aws/things/${b}/shadow/update`, JSON.stringify({ state: label === 'delta' ? o : { desired: o } }));
async function trySet(key, val) {
  for (const label of ['delta', 'desired']) { send(label, { [key]: val }); await wait(4000); if (st[key] === val) return label; }
  return null;
}
(async () => {
  await new Promise((r) => c.on('connect', r)); console.log('conectado'); c.subscribe('#');
  while (st.pmaps === undefined) await wait(500);
  const tests = [['ecoCharge', !st.ecoCharge], ['noPP', !st.noPP], ['schedHold', !st.schedHold], ['binTypeDetect', st.binTypeDetect === 0 ? 1 : 0], ['name', st.name + '-test']];
  for (const [k, v] of tests) {
    const orig = st[k];
    const via = await trySet(k, v);
    console.log(k.padEnd(14), via ? `ACEPTADO vía ${via} (${JSON.stringify(orig)} -> ${JSON.stringify(st[k])})` : `ignorado (sigue ${JSON.stringify(st[k])})`);
    const back = await trySet(k, orig);
    console.log('  restaurado:', back ? 'sí' : 'NO', JSON.stringify(st[k]));
  }
  c.end(); process.exit(0);
})();
setTimeout(() => { console.log('timeout global'); process.exit(1); }, 150000);
