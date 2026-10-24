// Prueba dispLight: apaga 15 s y restaura. Registra cualquier clave nueva del estado y mensajes fuera de reported. Uso: node test-disp.js
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {}; const log = [];
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
c.on('message', (topic, m) => { try { const j = JSON.parse(m); const r = j.state?.reported; if (r) merge(st, r); else log.push(`${topic}: ${String(m).slice(0, 200)}`); } catch {} });
c.on('error', (e) => { console.log('error', e.message); process.exit(1); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  while (st.pmaps === undefined) await wait(500);
  const before = new Set(Object.keys(st));
  console.log('dispLight antes:', st.dispLight);
  c.publish('delta', JSON.stringify({ state: { dispLight: false } })); console.log('enviado dispLight=false'); await wait(15000);
  console.log('dispLight reportado:', st.dispLight, '| claves nuevas:', Object.keys(st).filter((k) => !before.has(k)));
  c.publish('delta', JSON.stringify({ state: { dispLight: true } })); console.log('enviado dispLight=true (restaurar)'); await wait(5000);
  console.log('dispLight final:', st.dispLight, '| claves nuevas:', Object.keys(st).filter((k) => !before.has(k)));
  console.log('otros mensajes:', log.slice(0, 8));
  c.end(); process.exit(0);
})();
setTimeout(() => { console.log('timeout global'); process.exit(1); }, 60000);
