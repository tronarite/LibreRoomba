// Arranca una misión, registra durante N s qué claves llegan (busca "pose") y manda el robot a la base.
const mqtt = require('mqtt'), fs = require('fs'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const b = process.env.ROBOT_BLID, secs = Number(process.argv[2] || 60);
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const log = [];
const send = (command) => c.publish('cmd', JSON.stringify({ command, time: Math.floor(Date.now() / 1000), initiator: 'localApp' }));
c.on('connect', () => { c.subscribe('#'); setTimeout(() => { send('start'); console.log('start enviado'); }, 1500); });
c.on('message', (t, m) => {
  const s = m.toString(); log.push({ t: Date.now(), topic: t, body: s });
  if (/"pose"/.test(s)) console.log('POSE >>', s.slice(0, 250));
  const ph = s.match(/"phase": ?"(\w+)"/); if (ph) console.log('phase', ph[1]);
});
setTimeout(() => { send('dock'); console.log('dock enviado'); fs.writeFileSync(__dirname + '/mission-log.json', JSON.stringify(log)); setTimeout(() => { c.end(); process.exit(0); }, 3000); }, secs * 1000);
