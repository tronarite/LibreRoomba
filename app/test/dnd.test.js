// No molestar: lógica pura (franjas, medianoche, solapes, conflictos con la programación) y vigilante con el robot simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dnd = require('../core/dnd');
const { DndGuard } = require('../core/dnd-guard');
const { RobotCore } = require('../core/robot');
const { createFakeRobot } = require('../core/fake-robot');

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, ms = 1500) => { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error('timeout esperando condición'); await tick(5); } };
// Fechas en hora LOCAL (como las usa el servidor): el 25-oct-2026 es domingo
const at = (day, hour, min = 0) => new Date(2026, 9, 25 + day, hour, min);   // day: 0 = domingo ... 6 = sábado
const win = (over = {}) => ({ enabled: true, label: 'quiet', days: [1, 2, 3, 4, 5], start: { hour: 22, min: 0 }, end: { hour: 7, min: 0 }, ...over });

test('validate: normaliza, descarta claves extra y rechaza valores no válidos', () => {
  const [w] = dnd.validate([{ ...win({ days: [5, 1, 1] }), extra: 1, name: 'ignorado' }]);
  assert.deepEqual(w, { enabled: true, label: 'quiet', days: [1, 5], start: { hour: 22, min: 0 }, end: { hour: 7, min: 0 } });
  assert.equal(dnd.validate([win({ label: 'custom', name: '  Teletrabajo ' })])[0].name, 'Teletrabajo');
  assert.throws(() => dnd.validate('x'), /array/);
  assert.throws(() => dnd.validate([win({ label: 'fiesta' })]), /etiqueta/);
  assert.throws(() => dnd.validate([win({ days: [] })]), /día/);
  assert.throws(() => dnd.validate([win({ days: [7] })]), /día/);
  assert.throws(() => dnd.validate([win({ start: { hour: 24, min: 0 } })]), /inicio/);
  assert.throws(() => dnd.validate([win({ end: { hour: 22, min: 0 } })]), /misma hora/);
  assert.throws(() => dnd.validate([win({ label: 'custom', name: 'x'.repeat(31) })]), /30/);
  assert.throws(() => dnd.validate(Array.from({ length: 11 }, () => win())), /más de 10/);
  const dirty = JSON.parse('{"enabled":true,"label":"nap","days":[1],"start":{"hour":1,"min":0},"end":{"hour":2,"min":0},"__proto__":{"polluted":true}}');
  assert.deepEqual(Object.keys(dnd.validate([dirty])[0]).sort(), ['days', 'enabled', 'end', 'label', 'start']);
  assert.equal({}.polluted, undefined);
});

test('activeAt: la franja que cruza medianoche pertenece al día en que empieza', () => {
  const items = dnd.validate([win()]);   // L-V 22:00-07:00
  assert.equal(dnd.activeAt(items, at(1, 21, 59)), null, 'lunes antes de empezar');
  const hit = dnd.activeAt(items, at(1, 22, 0));
  assert.equal(hit.label, 'Momento de tranquilidad');
  assert.equal(hit.until, '07:00');
  assert.equal(hit.endsInMin, 540);
  assert.ok(dnd.activeAt(items, at(2, 6, 59)), 'martes de madrugada sigue la del lunes');
  assert.equal(dnd.activeAt(items, at(2, 7, 0)), null, 'el fin no está incluido');
  assert.ok(dnd.activeAt(items, at(6, 3, 0)), 'sábado de madrugada: la del viernes');
  assert.equal(dnd.activeAt(items, at(1, 3, 0)), null, 'lunes de madrugada: el domingo no tiene franja');
  assert.ok(dnd.activeAt(dnd.validate([win({ days: [6] })]), at(7, 3, 0)), 'la del sábado cruza al domingo (vuelta de semana)');
  assert.equal(dnd.activeAt(dnd.validate([win({ enabled: false })]), at(1, 23, 0)), null, 'desactivada');
  assert.equal(dnd.activeAt(dnd.validate([win({ label: 'custom', name: 'Bebé' })]), at(1, 23)).label, 'Bebé');
});

test('overlaps: detecta solapes, también a través de medianoche, e ignora las desactivadas', () => {
  const base = win();                                                                                   // L-V 22-07
  const next = win({ label: 'nap', days: [2], start: { hour: 6, min: 0 }, end: { hour: 8, min: 0 } });    // martes 6-8: pisa la del lunes
  const apart = win({ label: 'movie', days: [2], start: { hour: 8, min: 0 }, end: { hour: 9, min: 0 } }); // empieza justo al acabar la anterior
  assert.deepEqual(dnd.overlaps(dnd.validate([base, next, apart])), [[0, 1]]);
  assert.deepEqual(dnd.overlaps(dnd.validate([base, { ...next, enabled: false }])), []);
});

test('scheduleConflicts: programaciones de limpieza que empiezan dentro de una franja', () => {
  const items = dnd.validate([win({ label: 'meeting', days: [1, 3], start: { hour: 9, min: 30 }, end: { hour: 10, min: 30 } })]);
  const schedule = [
    { enabled: true, start: { day: [1, 2, 3, 4, 5], hour: 10, min: 0 } },   // la del usuario: L-V 10:00
    { enabled: false, start: { day: [1], hour: 10, min: 0 } },
    { enabled: true, start: { day: [1], hour: 10, min: 30 } }                // empieza justo al acabar
  ];
  assert.deepEqual(dnd.scheduleConflicts(items, schedule), [{ schedule: 0, dnd: 0, day: 1 }, { schedule: 0, dnd: 0, day: 3 }]);
  assert.deepEqual(dnd.scheduleConflicts(items, undefined), []);
});

test('createDndStore: guarda, relee y no acepta datos no válidos', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lr-dnd-')), 'dnd.json');
  const store = dnd.createDndStore(file);
  assert.deepEqual(store.list(), []);
  store.set([win()]);
  assert.equal(dnd.createDndStore(file).list().length, 1);
  assert.throws(() => store.set([win({ days: [] })]));
  assert.equal(store.list().length, 1, 'un fallo no borra lo guardado');
  fs.writeFileSync(file, '{roto');
  assert.deepEqual(dnd.createDndStore(file).list(), [], 'archivo corrupto: vacío');
});

// Vigilante: reloj controlado y tick() manual (el intervalo real es de una hora para que no interfiera)
async function setup({ items = [win()], start = at(1, 21, 0), fake = {} } = {}) {
  const robot = createFakeRobot({ password: 'ok', dockDelayMs: 15, ...fake });
  const core = new RobotCore({ ip: 'x', blid: 'b', password: 'ok', connect: robot.connect, reconnect: { min: 10, max: 40 } });
  core.on('error', () => {});
  let t = start.getTime();
  const now = () => t;
  now.set = (date) => { t = date.getTime(); };
  const notes = [];
  const valid = dnd.validate(items);
  const guard = new DndGuard(core, { items: () => valid, now, intervalMs: 3600000, notify: (type, severity, title, message, data) => notes.push({ type, severity, title, message, data }) });
  const changes = [];
  guard.on('change', (hit) => changes.push(hit));
  core.start();
  await until(() => core.connected && core.state.batPct !== undefined);
  guard.start();
  await tick(20);
  const docks = () => robot.published.filter((p) => p.topic === 'cmd' && p.body.command === 'dock').length;
  return { robot, core, guard, now, notes, changes, docks, stop: () => { guard.stop(); core.stop(); } };
}

test('al empezar la franja, la misión en curso termina (base) y se avisa', async () => {
  const s = await setup();
  s.core.command('start');
  await until(() => s.core.state.cleanMissionStatus.phase === 'run');
  s.now.set(at(1, 22, 0)); s.guard.tick();
  await until(() => s.core.state.cleanMissionStatus.phase === 'hmUsrDock');
  assert.equal(s.docks(), 1);
  assert.deepEqual(s.notes.map((n) => n.type), ['dnd-started', 'dnd-ended-mission']);
  assert.equal(s.changes.length, 1);
  s.guard.tick();
  assert.equal(s.docks(), 1, 'seguir dentro de la franja no repite');
  s.now.set(at(2, 7, 0)); s.guard.tick();
  assert.deepEqual(s.notes.map((n) => n.type), ['dnd-started', 'dnd-ended-mission', 'dnd-ended']);
  assert.equal(s.changes.at(-1), null);
  s.stop();
});

test('arrancar el servidor en mitad de la franja con una misión en curso no la termina', async () => {
  const s = await setup({ start: at(1, 23, 0), fake: { state: { cleanMissionStatus: { phase: 'run', cycle: 'clean', initiator: 'schedule' } } } });
  s.guard.tick(); await tick(30);
  assert.equal(s.docks(), 0);
  assert.deepEqual(s.notes, []);
  s.stop();
});

test('durante la franja: la misión iniciada por el usuario se respeta; la de la programación vuelve a la base', async () => {
  const s = await setup({ start: at(1, 23, 0) });
  s.core.command('start');                              // desde el panel (localApp)
  await until(() => s.core.state.cleanMissionStatus.phase === 'run');
  assert.equal(s.core.state.cleanMissionStatus.initiator, 'localApp');
  s.robot.report({ cleanMissionStatus: { phase: 'charge', cycle: 'none' } }); await tick(20);
  s.robot.startBy('manual');                            // botón del robot
  await tick(30);
  assert.equal(s.docks(), 0);
  s.robot.report({ cleanMissionStatus: { phase: 'charge', cycle: 'none' } }); await tick(20);
  s.robot.startBy('schedule');                          // programación del propio robot
  await until(() => s.docks() === 1);
  assert.equal(s.notes.at(-1).type, 'dnd-blocked-schedule');
  assert.equal(s.notes.at(-1).title, 'Programación bloqueada por No molestar');
  s.stop();
});

test('fuera de la franja la programación limpia con normalidad, y el antirrebote evita bucles', async () => {
  const s = await setup({ start: at(1, 12, 0) });
  s.robot.startBy('schedule');
  await tick(30);
  assert.equal(s.docks(), 0, 'fuera de franja');
  s.now.set(at(1, 23, 0)); s.guard.tick();             // entra con misión en curso: base
  await until(() => s.docks() === 1);
  s.robot.report({ cleanMissionStatus: { phase: 'charge', cycle: 'none' } }); await tick(20);
  s.robot.startBy('schedule');                          // dentro del antirrebote (120 s)
  await tick(30);
  assert.equal(s.docks(), 1);
  s.robot.report({ cleanMissionStatus: { phase: 'charge', cycle: 'none' } }); await tick(20);
  s.now.set(at(1, 23, 5));
  s.robot.startBy('schedule');
  await until(() => s.docks() === 2);
  s.stop();
});

test('robot desconectado: avisa de que no pudo mandarlo a la base', async () => {
  const s = await setup();
  s.core.command('start');
  await until(() => s.core.state.cleanMissionStatus.phase === 'run');
  s.core.stop();                                         // conserva el estado pero sin conexión
  s.now.set(at(1, 22, 0)); s.guard.tick();
  assert.equal(s.notes.at(-1).type, 'dnd-dock-failed');
  assert.equal(s.notes.at(-1).severity, 'error');
  s.guard.stop();
});
