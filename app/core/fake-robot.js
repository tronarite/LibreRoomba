// Robot simulado que habla el mismo protocolo que la i1+ (topics `cmd` y `delta`, estado en `state.reported`).
// Sirve para el modo --mock y para pruebas: createFakeRobot() devuelve una función `connect` para RobotCore.
const EventEmitter = require('events');
const { deepMerge } = require('./robot');

const INITIAL = {
  name: 'Roomba i1+', batPct: 82, softwareVer: 'mock-1.0', mssnM: 0, rssi: -53,
  bin: { present: true, full: false }, cleanMissionStatus: { phase: 'charge', cycle: 'none', error: 0 },
  sku: 'mock-sku', country: 'ES', timezone: 'Europe/Madrid', cloudEnv: 'prod', evacAllowed: true,
  langs2: { sLang: 'es-ES', dLangs: { langs: ['de-DE', 'en-GB', 'es-ES', 'fr-FR', 'it-IT'] } }, dock: { fwVer: 'mock' },
  pmaps: [], bbmssn: { nMssn: 0, nMssnOk: 0, nMssnC: 0, nMssnF: 0, aMssnM: 0 }
};
const PHASE = { start: 'run', resume: 'run', pause: 'stop', stop: 'stop', dock: 'hmUsrDock', evac: 'evac' };

// opciones: password (si se da, rechaza otras), state (parte del estado inicial), dockDelayMs (tiempo hasta volver a cargar)
function createFakeRobot({ password, state = {}, dockDelayMs = 4000 } = {}) {
  const robot = { password, clients: [], published: [], state: deepMerge(JSON.parse(JSON.stringify(INITIAL)), state) };

  robot.report = (delta) => {
    deepMerge(robot.state, delta);
    const payload = Buffer.from(JSON.stringify({ state: { reported: delta } }));
    for (const client of robot.clients) client.emit('message', 'shadow/update', payload);
  };

  robot.connect = (_url, options = {}) => {
    const client = new EventEmitter();
    client.options = options;
    client.subscribe = () => setImmediate(() => client.emit('message', 'shadow/update', Buffer.from(JSON.stringify({ state: { reported: robot.state } }))));
    client.publish = (topic, raw) => {
      const body = JSON.parse(raw);
      robot.published.push({ topic, body });
      setImmediate(() => handle(topic, body));
    };
    client.end = () => { robot.clients = robot.clients.filter((c) => c !== client); setImmediate(() => client.emit('close')); };
    setImmediate(() => {
      if (robot.password !== undefined && options.password !== robot.password) {
        client.emit('error', new Error('Connection refused: Bad username or password'));
        return client.emit('close');
      }
      robot.clients.push(client);
      client.emit('connect');
    });
    return client;
  };

  // Simula que el robot cambia su contraseña (p. ej. tras emparejarlo de nuevo): corta a los clientes y rechaza al resto.
  robot.changePassword = (next) => { robot.password = next; robot.drop(); };

  robot.drop = () => { const lost = robot.clients; robot.clients = []; lost.forEach((c) => c.emit('close')); };   // corte de red

  function handle(topic, body) {
    if (topic === 'delta') return robot.report(body.state || {});
    if (topic !== 'cmd') return;
    const phase = PHASE[body.command];
    if (!phase) return;   // find y desconocidos: sin cambio de fase
    const returns = body.command === 'dock' || body.command === 'evac';
    robot.report({ cleanMissionStatus: { phase, cycle: returns ? 'none' : 'clean' } });
    if (returns) {
      const timer = setTimeout(() => robot.report({ cleanMissionStatus: { phase: 'charge', cycle: 'none' } }), dockDelayMs);
      if (timer.unref) timer.unref();
    }
  }

  return robot;
}

module.exports = { createFakeRobot };
