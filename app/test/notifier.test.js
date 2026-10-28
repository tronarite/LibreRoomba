const test = require('node:test');
const assert = require('node:assert/strict');
const { RobotCore } = require('../core/robot');
const { createFakeRobot } = require('../core/fake-robot');
const { Notifier } = require('../core/notifier');

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, ms = 1500) => { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error('timeout esperando condición'); await tick(5); } };

// Reloj controlado: el antirrebote y las duraciones no dependen del tiempo real
function clock(start = Date.parse('2026-10-24T12:00:00Z')) { let t = start; const fn = () => t; fn.advance = (ms) => { t += ms; }; return fn; }

async function setup({ fake = {}, notifier = {}, core = {} } = {}) {
  const robot = createFakeRobot({ password: 'ok', dockDelayMs: 15, ...fake });
  const c = new RobotCore({ ip: 'x', blid: 'b', password: 'ok', connect: robot.connect, ...core, reconnect: { min: 10, max: 40, authMin: 40, authMax: 80, ...core.reconnect } });
  c.on('error', () => {});
  const now = clock();
  const n = new Notifier(c, { now, disconnectGraceMs: 30, ...notifier });
  const seen = [];
  n.on('event', (e) => seen.push(e));
  c.start();
  await until(() => c.connected && c.state.batPct !== undefined);
  await tick(20);
  return { robot, c, n, seen, now };
}
const types = (seen) => seen.map((e) => e.type);

test('el estado inicial no genera avisos aunque esté "mal" (depósito lleno, error, batería baja)', async () => {
  const { seen, c, n } = await setup({ fake: { state: { bin: { present: true, full: true }, cleanMissionStatus: { phase: 'stop', cycle: 'none', error: 5 }, batPct: 8 } } });
  assert.equal(c.state.bin.full, true);
  assert.deepEqual(types(seen), []);
  assert.deepEqual(n.list(), []);
  c.stop(); n.stop();
});

test('depósito lleno: avisa al pasar de vacío a lleno y no repite con el antirrebote', async () => {
  const { robot, seen, c, n, now } = await setup();
  robot.report({ bin: { full: true } });
  await until(() => types(seen).includes('bin-full'));
  robot.report({ bin: { full: false } }); await tick(10);
  robot.report({ bin: { full: true } }); await tick(20);
  assert.equal(types(seen).filter((t) => t === 'bin-full').length, 1, 'rebote dentro del cooldown');
  robot.report({ bin: { full: false } }); await tick(10);
  now.advance(61000);
  robot.report({ bin: { full: true } });
  await until(() => types(seen).filter((t) => t === 'bin-full').length === 2);
  c.stop(); n.stop();
});

test('misión: run -> dock -> charge avisa una sola vez de misión terminada, con duración', async () => {
  const { robot, seen, c, n, now } = await setup();
  c.command('start');
  await until(() => c.state.cleanMissionStatus.phase === 'run');
  now.advance(25 * 60000);
  c.command('dock');
  await until(() => c.state.cleanMissionStatus.phase === 'charge');
  await tick(20);
  const finished = seen.filter((e) => e.type === 'mission-finished');
  assert.equal(finished.length, 1);
  assert.equal(finished[0].data.minutes, 25);
  assert.match(finished[0].message, /25 min/);
  robot.report({ cleanMissionStatus: { phase: 'charge' } }); await tick(10);
  assert.equal(seen.filter((e) => e.type === 'mission-finished').length, 1, 'no se repite');
  c.stop(); n.stop();
});

test('vaciar el depósito en la base (evac) no cuenta como misión', async () => {
  const { seen, c, n } = await setup();
  c.command('evac');
  await until(() => c.state.cleanMissionStatus.phase === 'evac');
  await until(() => c.state.cleanMissionStatus.phase === 'charge');
  await tick(20);
  assert.deepEqual(types(seen), []);
  c.stop(); n.stop();
});

test('pausa no es fin de misión; parada con ciclo "none" sí avisa de misión detenida', async () => {
  const { robot, seen, c, n } = await setup();
  c.command('start');
  await until(() => c.state.cleanMissionStatus.phase === 'run');
  c.command('pause');                                               // el simulado deja stop/clean = pausa
  await until(() => c.state.cleanMissionStatus.phase === 'stop');
  await tick(20);
  assert.deepEqual(types(seen), []);
  robot.report({ cleanMissionStatus: { phase: 'run', cycle: 'clean' } }); await tick(10);
  robot.report({ cleanMissionStatus: { phase: 'stop', cycle: 'none' } });
  await until(() => types(seen).includes('mission-stopped'));
  c.stop(); n.stop();
});

test('error del robot: texto de la app, sin duplicados y nuevo aviso con otro código', async () => {
  const { robot, seen, c, n } = await setup();
  robot.report({ cleanMissionStatus: { error: 14 } });
  await until(() => types(seen).includes('robot-error'));
  const first = seen.find((e) => e.type === 'robot-error');
  assert.equal(first.severity, 'error');
  assert.equal(first.data.code, 14);
  assert.equal(first.title, 'Falta depósito');
  assert.match(first.message, /Vuelve a colocar el depósito/);
  robot.report({ cleanMissionStatus: { error: 14 } }); await tick(10);
  assert.equal(seen.filter((e) => e.type === 'robot-error').length, 1);
  robot.report({ cleanMissionStatus: { error: 0 } }); await tick(10);
  robot.report({ cleanMissionStatus: { error: 9999 } });
  await until(() => seen.filter((e) => e.type === 'robot-error').length === 2);
  assert.equal(seen.at(-1).title, 'Error 9999: sin descripción');
  c.stop(); n.stop();
});

test('fase "stuck": avisa de atasco, pero si llega con un código de error solo avisa del error', async () => {
  const a = await setup();
  a.robot.report({ cleanMissionStatus: { phase: 'stuck' } });
  await until(() => types(a.seen).includes('robot-stuck'));
  a.c.stop(); a.n.stop();
  const b = await setup();
  b.robot.report({ cleanMissionStatus: { phase: 'stuck', error: 1 } });
  await until(() => types(b.seen).includes('robot-error'));
  await tick(20);
  assert.deepEqual(types(b.seen), ['robot-error']);
  b.c.stop(); b.n.stop();
});

test('batería baja: avisa al cruzar el umbral, no repite hasta recuperarse y no avisa si está cargando', async () => {
  const { robot, seen, c, n } = await setup();
  robot.report({ batPct: 30, cleanMissionStatus: { phase: 'run', cycle: 'clean' } }); await tick(10);
  robot.report({ batPct: 14 });
  await until(() => types(seen).includes('battery-low'));
  robot.report({ batPct: 13 }); await tick(10);
  robot.report({ batPct: 12 }); await tick(10);
  assert.equal(types(seen).filter((t) => t === 'battery-low').length, 1);
  robot.report({ cleanMissionStatus: { phase: 'charge', cycle: 'none' }, batPct: 11 }); await tick(10);   // cargando: no avisa y rearma
  assert.equal(types(seen).filter((t) => t === 'battery-low').length, 1);
  c.stop(); n.stop();
});

test('arrancar con la batería ya baja no avisa hasta que se recupere y vuelva a bajar', async () => {
  const { robot, seen, c, n, now } = await setup({ fake: { state: { batPct: 10, cleanMissionStatus: { phase: 'stop', cycle: 'none', error: 0 } } } });
  assert.deepEqual(types(seen), []);
  robot.report({ batPct: 9 }); await tick(10);
  assert.deepEqual(types(seen), []);
  robot.report({ batPct: 50 }); await tick(10);
  now.advance(61000);
  robot.report({ batPct: 14 });
  await until(() => types(seen).includes('battery-low'));
  c.stop(); n.stop();
});

test('desconexión: no avisa en un corte breve; si dura, avisa y luego avisa de la reconexión', async () => {
  const { robot, seen, c, n } = await setup({ notifier: { disconnectGraceMs: 120 } });
  robot.drop();
  await until(() => !c.connected);
  await until(() => c.connected, 2000);                        // reconecta antes de la gracia
  await tick(150);
  assert.deepEqual(types(seen), [], 'corte breve sin aviso');
  c.stop(); n.stop();

  const longer = await setup({ notifier: { disconnectGraceMs: 20 }, core: { reconnect: { min: 120, max: 120 } } });
  longer.robot.drop();
  await until(() => types(longer.seen).includes('robot-disconnected'), 2000);
  await until(() => types(longer.seen).includes('robot-reconnected'), 3000);
  assert.deepEqual(types(longer.seen), ['robot-disconnected', 'robot-reconnected']);
  longer.c.stop(); longer.n.stop();
});

test('contraseña rechazada y recuperada', async () => {
  const { robot, seen, c, n } = await setup({ notifier: { authHelp: 'Pon el robot en emparejamiento.' } });
  robot.changePassword('nueva');
  await until(() => types(seen).includes('auth-failed'), 3000);
  const failed = seen.find((e) => e.type === 'auth-failed');
  assert.equal(failed.severity, 'error');
  assert.equal(failed.message, 'Pon el robot en emparejamiento.');
  c.setPassword('nueva');
  await until(() => types(seen).includes('auth-recovered'), 3000);
  c.stop(); n.stop();
});

test('list(): más reciente primero y máximo 50 en memoria', async () => {
  const { robot, c, n, now, seen } = await setup({ notifier: { cooldownMs: 0 } });
  for (let i = 0; i < 60; i++) {
    robot.report({ bin: { full: false } }); await tick(2);
    robot.report({ bin: { full: true } }); await tick(2);
    now.advance(1000);
  }
  const list = n.list();
  assert.equal(list.length, 50);
  assert.ok(seen.length >= 55);
  assert.ok(list[0].id > list[1].id, 'el más reciente va primero');
  assert.equal(list[0].id, seen.at(-1).id);
  c.stop(); n.stop();
});

test('no puede empezar (notReady) y errores de la base avisan una vez por transición, con el texto de la app', async () => {
  const { robot, seen, c, n } = await setup({ fake: { state: { cleanMissionStatus: { notReady: 0 }, dock: { state: 301 } } } });
  robot.report({ cleanMissionStatus: { notReady: 16 } });
  await until(() => types(seen).includes('not-ready'));
  const notReady = seen.find((e) => e.type === 'not-ready');
  assert.equal(notReady.data.code, 216);
  assert.equal(notReady.severity, 'warning');
  robot.report({ batPct: 81 }); await tick(20);
  assert.equal(types(seen).filter((t) => t === 'not-ready').length, 1, 'sin cambio no repite');
  robot.report({ dock: { state: 302 } }); await tick(20);
  assert.ok(!types(seen).includes('dock-error'), 'vaciar no es un error');
  robot.report({ dock: { state: 353 } });
  await until(() => types(seen).includes('dock-error'));
  const dock = seen.find((e) => e.type === 'dock-error');
  assert.equal(dock.data.code, 353);
  assert.match(dock.title, /^Clean Base: /);
  c.stop(); n.stop();
});

test('estado inicial con notReady o error de la base: no avisa', async () => {
  const { seen, c, n } = await setup({ fake: { state: { cleanMissionStatus: { notReady: 7 }, dock: { state: 351 } } } });
  assert.deepEqual(types(seen), []);
  c.stop(); n.stop();
});
