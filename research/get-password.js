// Obtiene la contraseña local del robot. Reintenta hasta que el robot esté en modo emparejamiento
// (HOME ~2 s en la base: tono + luz Wi-Fi parpadeando). Uso: node get-password.js <ip> [segundos]
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { SSL_OP_LEGACY_SERVER_CONNECT } = require('constants');

const ip = process.argv[2];
const maxSec = Number(process.argv[3] || 120);
if (!ip) { console.error('Uso: node get-password.js <ip> [segundos]'); process.exit(1); }

const packet = Buffer.from('f005efcc3b2900', 'hex');
const deadline = Date.now() + maxSec * 1000;

function attempt() {
  let buf = Buffer.alloc(0);
  const sock = tls.connect(
    { host: ip, port: 8883, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: SSL_OP_LEGACY_SERVER_CONNECT, minVersion: 'TLSv1' },
    () => sock.write(packet)
  );
  const next = () => { sock.destroy(); if (Date.now() < deadline) setTimeout(attempt, 2000); else { console.error('Tiempo agotado sin modo emparejamiento.'); process.exit(2); } };
  sock.setTimeout(4000, next);
  sock.on('error', next);
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (buf.length <= 7) return; // eco sin contraseña: no está en modo emparejamiento
    const pass = buf.slice(7).toString('utf8').split(String.fromCharCode(0)).join(''); // quita el terminador NUL
    if (pass.startsWith(':1:')) {
      fs.writeFileSync(path.join(__dirname, 'robot-password.txt'), pass);
      console.log('OK: contraseña guardada en research/robot-password.txt (longitud ' + pass.length + ')');
      process.exit(0);
    }
  });
}
attempt();
