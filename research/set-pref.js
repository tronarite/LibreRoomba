// Envía un cambio de preferencia al shadow (state.desired), formato que usa la app oficial y muestra cómo queda reportado. Uso: node set-pref.js '{"pmapLearningAllowed":true}'
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID, pref = JSON.parse(process.argv[2]);
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const keys = Object.keys(pref);
c.on('connect', () => { c.subscribe('#'); setTimeout(() => { c.publish(`$aws/things/${b}/shadow/update`, JSON.stringify({ state: { desired: pref } })); console.log('enviado', JSON.stringify(pref)); }, 1500); });
c.on('message', (t, m) => { const r = (() => { try { return JSON.parse(m).state?.reported; } catch {} })(); if (!r) return;
  keys.forEach((k) => { if (k in r) console.log('reportado', k, JSON.stringify(r[k])); }); if (r.lastCommand) console.log('lastCommand', JSON.stringify(r.lastCommand)); });
setTimeout(() => { c.end(); process.exit(0); }, 12000);
