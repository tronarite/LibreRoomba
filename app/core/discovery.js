// Descubrimiento UDP de la Roomba (para encontrar su IP si el router se la cambia).
// Protocolo (research/protocol-notes.md): se envía el texto `irobotmcs` al puerto UDP 5678 (broadcast o a una IP);
// el robot contesta con un JSON { hostname: 'Roomba-<BLID>' | 'iRobot-<BLID>', ip, mac, sku, sw, ... }.
// No necesita contraseña. Solo se llama bajo petición explícita (LIBREROOMBA_DISCOVER=1): nunca en pruebas.
const PREFIXES = new Set(['Roomba', 'iRobot']);
const norm = (value) => String(value || '').toLowerCase().replace(/[^0-9a-f]/g, '');

// Devuelve { ip, blid, mac, hostname, sku, sw, raw } si el datagrama es una respuesta de robot, o null.
function parseReply(message) {
  let data;
  try { data = JSON.parse(String(message)); } catch (_) { return null; }
  if (!data || typeof data.hostname !== 'string' || typeof data.ip !== 'string') return null;
  const [prefix, ...rest] = data.hostname.split('-');
  if (!PREFIXES.has(prefix) || !rest.length) return null;
  return { ip: data.ip, blid: rest.join('-'), mac: data.mac, hostname: data.hostname, sku: data.sku, sw: data.sw, raw: data };
}

// Opciones:
//   blid / mac : si se dan, solo se acepta el robot que coincida (con cualquiera de los dos).
//   address    : destino (por defecto broadcast); puede ser la IP de un robot (unicast).
//   port       : puerto UDP del robot (5678). bindPort: puerto local (5678 como la app; 0 = efímero; si está ocupado se usa uno efímero).
//   timeoutMs  : tiempo máximo de espera. dgram: módulo inyectable para probar.
// Resuelve con la primera coincidencia o null al agotar el tiempo. No rechaza salvo errores de programación.
function discover({ blid, mac, address = '255.255.255.255', port = 5678, bindPort = 5678, timeoutMs = 3000, payload = 'irobotmcs', dgram = require('dgram') } = {}) {
  return new Promise((resolve) => {
    const wantBlid = norm(blid);
    const wantMac = norm(mac);
    let socket;
    let done = false;
    let timer;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch (_) { /* ya cerrado */ }
      resolve(result);
    };
    const accepts = (info) => {
      if (!wantBlid && !wantMac) return true;
      return (wantBlid && norm(info.blid) === wantBlid) || (wantMac && norm(info.mac) === wantMac);
    };

    try { socket = dgram.createSocket('udp4'); } catch (_) { return resolve(null); }
    socket.on('error', (error) => {
      // Si 5678 está ocupado (otra herramienta escuchando), se reintenta con un puerto efímero.
      if (error && error.code === 'EADDRINUSE' && bindPort !== 0 && !done) {
        done = true;
        clearTimeout(timer);
        try { socket.close(); } catch (_) { /* nada */ }
        return resolve(discover({ blid, mac, address, port, bindPort: 0, timeoutMs, payload, dgram }));
      }
      finish(null);
    });
    socket.on('message', (message) => {
      const info = parseReply(message);
      if (info && accepts(info)) finish(info);
    });
    const send = () => {
      try {
        if (address === '255.255.255.255' || address.endsWith('.255')) socket.setBroadcast(true);
        socket.send(Buffer.from(payload), port, address, (error) => { if (error) finish(null); });
      } catch (_) { finish(null); }
    };
    timer = setTimeout(() => finish(null), timeoutMs);
    if (timer.unref) timer.unref();
    try { socket.bind(bindPort, send); } catch (_) { finish(null); }
  });
}

module.exports = { discover, parseReply };
