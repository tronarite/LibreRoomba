const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeMissions, toCommon, DEFAULT_RESOLUTION } = require('../core/mapmerge');

const R = DEFAULT_RESOLUTION;

// Habitación "real" (sistema del mundo: base en (0,0) mirando a 0): rectángulo de celdas más una franja estrecha, para que el desenfoque se note
function worldPoints() {
  const pts = [];
  for (let i = 0; i < 60; i++) for (let j = -15; j < 15; j++) pts.push([i * R, j * R]);
  for (let i = 60; i < 120; i++) for (let j = 5; j < 8; j++) pts.push([i * R, j * R]);
  return pts;
}

// UMF sintético: la misión ve el mundo con la base en `t` y orientación `theta` (p_misión = Rot(theta) * p_mundo + t)
function umfFor(world, { t = [0, 0], theta = 0, dock = true, stalls = [] } = {}) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const tf = ([x, y]) => [x * c - y * s + t[0], x * s + y * c + t[1]];
  const poses2d = dock ? [{ id: '100002', coordinates: t, ori_rad: theta }] : [{ id: '100000', coordinates: t, ori_rad: theta }];
  return {
    maps: [{
      map_header: { resolution: R, area: world.length * R * R },
      poses2d, typed_poses: dock ? { dock_poses: { geometry: { type: 'multipose', ids: ['100002'] } } } : { start_pose: { geometry: { type: 'multipose', ids: ['100000'] } } },
      points2d: [{ id: 'a', coordinates: tf([0, 0]) }, { id: 'b', coordinates: tf([5, 0]) }, { id: 'c', coordinates: tf([5, 3]) }],
      borders: [{ id: '0', geometry: { type: 'polygon', ids: [['a', 'b', 'c']] } }],
      layers: [
        { layer_type: 'coverage', geometry: { type: 'multipoint2d', coordinates: world.map(tf) } },
        { layer_type: 'escape_events', geometry: { type: 'pose2dconcise_event', list: stalls.map(([x, y]) => ({ pose: [...tf([x, y]), 0], event: 'side_brush_stall_detected' })) } }
      ]
    }]
  };
}

test('toCommon: traslada y rota alrededor de la base', () => {
  const [x, y] = toCommon(1 + Math.cos(0.5), 2 + Math.sin(0.5), { x: 1, y: 2, theta: 0.5 });
  assert.ok(Math.abs(x - 1) < 1e-9 && Math.abs(y) < 1e-9, `${x},${y}`);
});

test('rotar y desplazar una misión no la desenfoca: coincide con el mismo recorrido sin rotar', () => {
  const world = worldPoints();
  const a = mergeMissions([umfFor(world), umfFor(world)]);
  const b = mergeMissions([umfFor(world), umfFor(world, { t: [3.2, -1.7], theta: 0.1 })]);
  assert.equal(a.peak, 2);
  // con alineado, las celdas cubiertas por las dos misiones (valor 2) son casi las mismas que con dos copias idénticas
  const two = (m) => { let n = 0; for (const v of Buffer.from(m.grid, 'base64')) if (v === 2) n++; return n; };
  assert.ok(two(b) / two(a) > 0.8, `solape ${two(b)} / ${two(a)}`);
  assert.ok(Math.abs(b.coveredCells - a.coveredCells) / a.coveredCells < 0.2, 'la extensión cubierta no debe inflarse');
});

test('sin alinear por orientación el resultado SÍ se desenfoca (la rotación importa)', () => {
  const world = worldPoints();
  // misma misión rotada 0.1 rad, pero fingiendo que la base no tiene orientación (se ignora theta): referencia de lo que evitamos
  const wrong = umfFor(world, { theta: 0.1 });
  wrong.maps[0].poses2d[0].ori_rad = 0;
  const bad = mergeMissions([umfFor(world), wrong]);
  const good = mergeMissions([umfFor(world), umfFor(world, { theta: 0.1 })]);
  const ideal = mergeMissions([umfFor(world), umfFor(world)]);
  const two = (m) => { let n = 0; for (const v of Buffer.from(m.grid, 'base64')) if (v === 2) n++; return n; };
  // alineado conserva casi todo el solape ideal (dos copias idénticas); sin rotar pierde claramente más (en datos sintéticos: ~96 % frente a ~82 %)
  assert.ok(two(good) / two(ideal) > 0.9, `alineado ${two(good)} de ${two(ideal)}`);
  assert.ok(two(bad) / two(ideal) < 0.9, `sin rotar ${two(bad)} de ${two(ideal)}`);
  assert.ok(two(good) > two(bad));
});

test('una misión cuenta una sola vez por celda y el pico es el número de misiones', () => {
  const world = worldPoints();
  const merged = mergeMissions([umfFor(world), umfFor(world), umfFor(world)]);
  assert.equal(merged.missions, 3);
  assert.equal(merged.peak, 3);
  assert.equal(merged.alignedBy.dock, 3);
  assert.equal(merged.grid.length > 0, true);
  assert.equal(Buffer.from(merged.grid, 'base64').length, merged.width * merged.height);
});

test('misión sin base usa la pose de arranque; atascos de varias misiones se agrupan; bordes alineados', () => {
  const world = worldPoints();
  const merged = mergeMissions([
    umfFor(world, { stalls: [[1, 0.2]] }),
    umfFor(world, { t: [2, 1], theta: -0.2, dock: false, stalls: [[1.02, 0.21]] })
  ], { requireDock: false, stallMin: 1 });
  assert.deepEqual([merged.alignedBy.dock, merged.alignedBy.start], [1, 1]);
  assert.equal(merged.stalls.length, 1);
  assert.equal(merged.stalls[0].n, 2);
  assert.deepEqual(merged.stallTotals, { side_brush_stall_detected: 2 });
  assert.equal(merged.borders.length, 1);
  const [p0, p1] = merged.borders[0];
  assert.ok(Math.abs(p0[0]) < 0.01 && Math.abs(p1[0] - 5) < 0.01, 'el borde queda en el sistema común (base en el origen)');
});

test('entradas vacías o sin cobertura devuelven null sin romper', () => {
  assert.equal(mergeMissions([]), null);
  assert.equal(mergeMissions([{ maps: [{ layers: [] }] }, null, {}]), null);
});

test('por defecto una misión sin pose de base se descarta (y se cuenta como omitida)', () => {
  const world = worldPoints();
  const merged = mergeMissions([umfFor(world), umfFor(world, { t: [2, 1], theta: -0.2, dock: false })]);
  assert.equal(merged.missions, 1);
  assert.equal(merged.skipped, 1);
  assert.equal(mergeMissions([umfFor(world, { dock: false })]), null);
});

test('atascos: solo zonas con suficientes eventos, ordenadas por frecuencia, y totales de todos los eventos', () => {
  const world = worldPoints();
  const hot = Array.from({ length: 5 }, () => [1.0, 0.2]);             // 5 eventos en la misma zona
  const rare = [[3.0, 0.5]];                                           // 1 evento suelto
  const merged = mergeMissions([umfFor(world, { stalls: [...hot, ...rare] })]);
  assert.equal(merged.stalls.length, 1, 'el evento suelto se descarta por defecto');
  assert.equal(merged.stalls[0].n, 5);
  assert.equal(merged.stallTotals.side_brush_stall_detected, 6, 'los totales cuentan todos los eventos');
  const capped = mergeMissions([umfFor(world, { stalls: [...hot, ...rare] })], { stallMin: 1, stallMax: 1 });
  assert.equal(capped.stalls.length, 1);
  assert.equal(capped.stalls[0].n, 5, 'con tope se queda la más frecuente');
});
