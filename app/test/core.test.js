const test = require('node:test');
const assert = require('node:assert/strict');
const { RobotCore } = require('../core/robot');
const { createFakeRobot } = require('../core/fake-robot');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, ms = 1000) => { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error('timeout esperando condición'); await tick(5); } };

async function setup({ password = 'ok', fake = {}, core = {} } = {}) {
  const robot = createFakeRobot({ password: 'ok', ...fake });
  const c = new RobotCore({ ip: 'x', blid: 'b', password, connect: robot.connect, ...core, reconnect: { min: 10, max: 40, authMin: 40, authMax: 160, ...core.reconnect } });
  c.on('error', () => {});
  c.start();
  return { robot, c };
}

test('conecta, recibe el estado inicial y publica órdenes en `cmd`', async () => {
  const { robot, c } = await setup();
  await until(() => c.connected && c.state.batPct);
  c.command('evac');
  await until(() => c.state.cleanMissionStatus.phase === 'evac');
  assert.deepEqual(robot.published.map((p) => p.topic), ['cmd']);
  assert.equal(robot.published[0].body.command, 'evac');
  assert.equal(robot.published[0].body.initiator, 'localApp');
  c.stop();
});

test('ajustes: se validan y transforman antes de enviarse, y llegan por `delta`', async () => {
  const { robot, c } = await setup();
  await until(() => c.connected);
  c.setPref('binTypeDetect', true);
  c.setPref('name', '  Rumba  ');
  await until(() => c.state.name === 'Rumba' && c.state.binTypeDetect === 1);
  assert.equal(robot.published.length, 2);
  for (const [key, value] of [['twoPass', 'si'], ['rankOverlap', 50], ['name', ''], ['name', 'x'.repeat(21)], ['nada', true]]) {
    assert.throws(() => c.setPref(key, value), { code: 'invalid' }, `${key}=${value}`);
  }
  assert.equal(robot.published.length, 2, 'nada inválido llegó al robot');
  c.stop();
});

test('claves de nube y red nunca se envían, ni como ajuste normal ni experimental', async () => {
  const { robot, c } = await setup({ core: { experimental: true } });
  await until(() => c.connected);
  for (const key of ['cloudEnv', 'sdiscUrl', 'svcEndpoints', 'wlcfg', 'uap', 'wactivate', 'ntphosts']) {
    assert.throws(() => c.setPref(key, 'x'), { code: 'invalid' });
    assert.throws(() => c.setExperimentalPref(key, 'x'), { code: 'invalid' });
  }
  assert.equal(robot.published.length, 0);
  c.stop();
});

test('experimentales: cerrados por defecto (forbidden) y abiertos solo si se activa', async () => {
  const closed = await setup();
  await until(() => closed.c.connected);
  assert.throws(() => closed.c.setExperimentalPref('suctionLevel', 1), { code: 'forbidden' });
  assert.throws(() => closed.c.experimentalCommand('evac'), { code: 'forbidden' });
  closed.c.stop();
  const open = await setup({ core: { experimental: true } });
  await until(() => open.c.connected);
  open.c.setExperimentalPref('suctionLevel', 2);
  assert.throws(() => open.c.setExperimentalPref('suctionLevel', 9), { code: 'invalid' });
  await until(() => open.c.state.suctionLevel === 2);
  open.c.stop();
});

test('programación: valida, rechaza solapes y envía cleanSchedule2', async () => {
  const { robot, c } = await setup();
  await until(() => c.connected);
  const item = (hour) => ({ enabled: true, type: 0, start: { day: [1, 2], hour, min: 0 }, cmd: { command: 'start', time: 0, initiator: 'schedule' } });
  c.setSchedule([item(10)]);
  await until(() => Array.isArray(c.state.cleanSchedule2));
  assert.equal(robot.published.at(-1).topic, 'delta');
  assert.throws(() => c.setSchedule([item(10), item(10)]), { code: 'invalid' });
  assert.throws(() => c.setSchedule('no'), { code: 'invalid' });
  c.stop();
});

test('sin conexión: las órdenes fallan con offline y nada se publica', async () => {
  const robot = createFakeRobot({ password: 'ok' });
  const c = new RobotCore({ ip: 'x', blid: 'b', password: 'ok', connect: robot.connect });
  assert.throws(() => c.command('start'), { code: 'offline' });
  assert.throws(() => c.setPref('twoPass', true), { code: 'offline' });
  assert.equal(robot.published.length, 0);
});

test('reconecta tras un corte de red y recupera el estado', async () => {
  const { robot, c } = await setup();
  const seen = [];
  c.on('connected', (v) => seen.push(v));
  await until(() => c.connected);
  robot.drop();
  await until(() => !c.connected);
  await until(() => c.connected, 2000);
  assert.deepEqual(seen, [true, false, true]);
  c.command('stop');
  await until(() => c.state.cleanMissionStatus.phase === 'stop');
  c.stop();
});

test('contraseña incorrecta: informa del error, no se conecta y sigue reintentando con espera creciente', async () => {
  const { robot, c } = await setup({ password: 'mala' });
  const errors = [];
  c.on('error', (e) => errors.push(e.message));
  await tick(250);
  assert.equal(c.connected, false);
  assert.ok(errors.length >= 2, `reintentos: ${errors.length}`);
  assert.match(errors[0], /Bad username or password/);
  assert.equal(c.authFailed, true);
  assert.ok(errors.length < 12, 'el backoff debe espaciar los intentos');
  assert.throws(() => c.command('start'), { code: 'offline' });
  c.stop();
  const before = errors.length;
  await tick(150);
  assert.equal(errors.length, before, 'tras stop() no debe reintentar');
  assert.equal(robot.clients.length, 0);
});

test('stop() es idempotente y deja el núcleo desconectado', async () => {
  const { c } = await setup();
  await until(() => c.connected);
  c.stop();
  c.stop();
  assert.equal(c.connected, false);
});

test('contraseña cambiada: authFailed + evento una sola vez, espera larga y se recupera con setPassword', async () => {
  const { robot, c } = await setup({ core: { reconnect: { authMin: 60, authMax: 60 } } });
  const events = [];
  c.on('auth-failed', () => events.push('failed'));
  c.on('auth-recovered', () => events.push('recovered'));
  await until(() => c.connected);
  assert.equal(c.authFailed, false);
  robot.changePassword('nueva');            // el robot cambia la contraseña y expulsa al cliente
  await until(() => c.authFailed, 2000);
  const errorsAt = robot.clients.length;
  assert.equal(errorsAt, 0);
  assert.equal(c.connected, false);
  await tick(200);                           // con authMin=60 ms hay unos pocos intentos, no una avalancha
  assert.deepEqual(events, ['failed'], 'el evento se emite solo al cambiar de estado');
  c.setPassword('nueva');                    // contraseña renovada con get-password
  await until(() => c.connected && !c.authFailed, 1000);
  assert.deepEqual(events, ['failed', 'recovered']);
  c.stop();
});

test('espera tras rechazo de contraseña respeta authMin (sin bucle agresivo)', async () => {
  const { c } = await setup({ password: 'mala', core: { reconnect: { min: 5, max: 5, authMin: 120, authMax: 120 } } });
  let errors = 0;
  c.on('error', () => { errors += 1; });
  await tick(300);
  assert.ok(errors <= 4, `con min=5 ms y authMin=120 ms hubo ${errors} intentos`);
  c.stop();
});

test('descubrimiento: tras N fallos seguidos busca la IP nueva y reconecta; sin descubrimiento no cambia nada', async () => {
  const robot = createFakeRobot({ password: 'ok' });
  const urls = [];
  const connect = (url, options) => {
    urls.push(url);
    return url.includes('10.0.0.44') ? robot.connect(url, options) : (() => { const e = new (require('events'))(); e.subscribe = () => {}; e.publish = () => {}; e.end = () => {}; setImmediate(() => { e.emit('error', new Error('connect ETIMEDOUT')); e.emit('close'); }); return e; })();
  };
  let calls = 0;
  const c = new RobotCore({ ip: '10.0.0.42', blid: 'b', password: 'ok', connect, reconnect: { min: 5, max: 10 }, discoverAfter: 3, discover: async () => { calls += 1; return { ip: '10.0.0.44' }; } });
  c.on('error', () => {});
  const moved = [];
  c.on('ip-changed', (x) => moved.push(x));
  c.start();
  await until(() => c.connected, 2000);
  assert.equal(c.ip, '10.0.0.44');
  assert.deepEqual(moved, [{ from: '10.0.0.42', to: '10.0.0.44' }]);
  assert.equal(calls, 1);
  assert.ok(urls.slice(0, 3).every((u) => u.includes('10.0.0.42')));
  c.stop();
  // sin descubrimiento configurado: nunca cambia de IP
  const c2 = new RobotCore({ ip: '10.0.0.42', blid: 'b', password: 'ok', connect, reconnect: { min: 5, max: 10 } });
  c2.on('error', () => {});
  c2.start();
  await tick(150);
  assert.equal(c2.ip, '10.0.0.42');
  c2.stop();
});

test('descubrimiento: no se usa si el fallo es de contraseña (el robot está ahí) ni si devuelve la misma IP o lanza', async () => {
  let calls = 0;
  const robot = createFakeRobot({ password: 'ok' });
  const c = new RobotCore({ ip: 'x', blid: 'b', password: 'mala', connect: robot.connect, reconnect: { min: 5, max: 5, authMin: 5, authMax: 5 }, discoverAfter: 1, discover: async () => { calls += 1; return { ip: 'otra' }; } });
  c.on('error', () => {});
  c.start();
  await tick(150);
  assert.equal(calls, 0);
  assert.equal(c.ip, 'x');
  c.stop();
  const bad = new RobotCore({ ip: 'x', blid: 'b', password: 'ok', connect: () => { throw new Error('no debería abrirse tras stop'); }, discover: async () => { throw new Error('UDP'); } });
  await bad._rediscover();                    // un fallo del descubrimiento no rompe nada
  assert.equal(bad.ip, 'x');
});

test('base mientras limpia: la i1+ ignora dock en run, así que se envía stop y después dock', async () => {
  const { robot, c } = await setup({ fake: { dockDelayMs: 20, savingMapMs: 30 }, core: { dockSettleMs: 20 } });
  await until(() => c.connected && c.state.batPct);
  c.command('start');
  await until(() => c.state.cleanMissionStatus.phase === 'run');
  c.command('dock');
  c.command('dock');                                   // repetir no duplica el dock pendiente
  await until(() => c.state.cleanMissionStatus.phase === 'charge');
  assert.deepEqual(robot.published.map((p) => p.body.command), ['start', 'stop', 'stop', 'dock']);
  c.command('dock');                                   // fuera de run: dock directo
  await tick();
  assert.equal(robot.published.at(-1).body.command, 'dock');
  c.stop();
});

test('base con la misión recién arrancada sobre la base: tras el stop ya carga y no se manda dock (provocaría un vaciado)', async () => {
  const { robot, c } = await setup({ fake: { savingMapMs: 20 }, core: { dockSettleMs: 20 } });
  await until(() => c.connected && c.state.batPct);
  robot.onDock = true;
  robot.startBy('schedule');
  await until(() => c.state.cleanMissionStatus.phase === 'run');
  c.command('dock');
  await until(() => c.state.cleanMissionStatus.phase === 'charge');
  await tick(80);
  assert.deepEqual(robot.published.map((p) => p.body.command), ['stop']);
  c.stop();
});

test('base mientras limpia: si el robot no sale de run, envía dock igualmente al acabar la espera', async () => {
  const { robot, c } = await setup({ core: { dockWaitMs: 60 } });
  await until(() => c.connected && c.state.batPct);
  robot.startBy('manual');
  await until(() => c.state.cleanMissionStatus.phase === 'run');
  robot.ignore.add('stop');                            // stop perdido: el robot sigue en run
  c.command('dock');
  await until(() => robot.published.some((p) => p.body.command === 'dock'));
  assert.deepEqual(robot.published.map((p) => p.body.command), ['stop', 'dock']);
  assert.equal(c.state.cleanMissionStatus.phase, 'run', 'el simulado, como el real, ignora dock en run');
  c.stop();
});

test('train es una orden normal y arranca un ciclo de reconocimiento', async () => {
  const { c } = await setup();
  await until(() => c.connected && c.state.batPct);
  c.command('train');
  await until(() => c.state.cleanMissionStatus.cycle === 'train');
  assert.equal(c.state.cleanMissionStatus.phase, 'run');
  c.stop();
});
