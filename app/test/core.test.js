const test = require('node:test');
const assert = require('node:assert/strict');
const { RobotCore } = require('../core/robot');
const { createFakeRobot } = require('../core/fake-robot');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, ms = 1000) => { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error('timeout esperando condición'); await tick(5); } };

async function setup({ password = 'ok', fake = {}, core = {} } = {}) {
  const robot = createFakeRobot({ password: 'ok', ...fake });
  const c = new RobotCore({ ip: 'x', blid: 'b', password, connect: robot.connect, reconnect: { min: 10, max: 40 }, ...core });
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
  assert.ok(errors.length >= 3, `reintentos: ${errors.length}`);
  assert.match(errors[0], /Bad username or password/);
  assert.ok(errors.length < 25, 'el backoff debe espaciar los intentos');
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
