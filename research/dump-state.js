// Vuelca el estado reportado completo (fusionado) durante unos segundos. Uso: node dump-state.js [segundos]
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const st = {};
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
c.on('message', (_t, m) => { try { const r = JSON.parse(m).state?.reported; if (r) merge(st, r); } catch {} });
c.on('error', (e) => { console.log('error', e.message); process.exit(1); });
c.on('connect', () => c.subscribe('#'));
setTimeout(() => { console.log(JSON.stringify(st, null, 1)); c.end(); process.exit(0); }, Number(process.argv[2] || 8) * 1000);
