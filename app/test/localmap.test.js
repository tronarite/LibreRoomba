const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocalMap, DEFAULT_RESOLUTION } = require('../core/localmap');

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lmap-')), 'm.json');
const cellAt = (map, x, y) => {
  const cx = Math.floor((x - map.origin.x) / map.resolution), cy = Math.floor((y - map.origin.y) / map.resolution);
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return 0;   // fuera de la rejilla = sin cobertura
  return Buffer.from(map.grid, 'base64')[cy * map.width + cx];
};

test('sin posiciones no hay mapa', () => {
  const m = createLocalMap(file());
  assert.equal(m.snapshot(), null);
  assert.equal(m.endMission(), false);
});

test('el trayecto entre dos lecturas queda relleno y cuenta una vez por misión', () => {
  const m = createLocalMap(file());
  m.add(0, 0); m.add(2, 0);        // 2 m en línea recta con solo dos lecturas
  m.endMission();
  const s = m.snapshot();
  assert.equal(s.missions, 1);
  assert.equal(cellAt(s, 1, 0), 1, 'a mitad de camino también hay cobertura');
  assert.equal(cellAt(s, 1, 1), 0, 'a 1 m del trazo no');
  assert.ok(s.areaM2 > 0.5 && s.areaM2 < 1.5, `área ${s.areaM2}`);
  m.add(0, 0); m.add(2, 0); m.endMission();
  const s2 = m.snapshot();
  assert.deepEqual([s2.missions, s2.peak, cellAt(s2, 1, 0)], [2, 2, 2]);
});

test('un salto grande no se une con trazo; valores no válidos se ignoran', () => {
  const m = createLocalMap(file());
  assert.equal(m.add(NaN, 0), false);
  assert.equal(m.add(0, 1e9), false);
  m.add(0, 0); m.add(20, 0);       // salto de 20 m: teletransporte
  m.endMission();
  const s = m.snapshot();
  assert.equal(cellAt(s, 10, 0), 0);
  assert.equal(cellAt(s, 20, 0), 1);
});

test('persiste y recarga; reset borra', () => {
  const f = file();
  const m = createLocalMap(f);
  m.add(0, 0); m.add(1, 1); m.endMission();
  const again = createLocalMap(f);
  assert.equal(again.missions, 1);
  assert.equal(again.snapshot().coveredCells, m.snapshot().coveredCells);
  again.reset();
  assert.equal(createLocalMap(f).snapshot(), null);
});

test('mismo formato que el mapa de la nube', () => {
  const m = createLocalMap(file());
  m.add(0, 0); m.add(1, 0); m.endMission();
  const s = m.snapshot();
  for (const k of ['resolution', 'origin', 'width', 'height', 'missions', 'peak', 'coveredCells', 'areaM2', 'alignedBy', 'dock', 'grid', 'stalls', 'stallTotals', 'borders']) assert.ok(k in s, k);
  assert.equal(Buffer.from(s.grid, 'base64').length, s.width * s.height);
});

test('servidor mock: la misión se registra en el mapa propio al terminar', async (t) => {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--mock'], { env: { ...process.env, PORT: '3235', LIBREROOMBA_POSITION_POLL_MS: '40', LIBREROOMBA_LOCALMAP_FILE: file(), LIBREROOMBA_PARTS_FILE: file(), LIBREROOMBA_ROOMS_FILE: file(), LIBREROOMBA_DND_FILE: file() }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.on('data', (c) => { if (String(c).includes('disponible')) resolve(); }); });
  const base = 'http://127.0.0.1:3235';
  assert.equal((await fetch(`${base}/api/localmap`)).status, 404, 'sin misiones no hay mapa propio');
  const cmd = (command) => fetch(`${base}/api/cmd`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
  assert.equal((await cmd('start')).status, 200);
  await new Promise((r) => setTimeout(r, 400));     // varias consultas de posición durante la misión
  assert.equal((await cmd('stop')).status, 200);
  let res; for (let i = 0; i < 30; i++) { res = await fetch(`${base}/api/localmap`); if (res.status === 200) break; await new Promise((r) => setTimeout(r, 50)); }
  assert.equal(res.status, 200);
  const map = await res.json();
  assert.equal(map.missions, 1);
  assert.equal(map.source, 'local');
});

test('seed: copia un mapa ya fusionado a un mapa propio vacío, conserva desgastes y no pisa uno existente', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-seed-')), 'localmap.json');
  const res = DEFAULT_RESOLUTION;
  const grid = Buffer.from([0, 3, 0, 5]).toString('base64');   // 2x2: dos celdas recorridas
  const snap = { resolution: res, width: 2, height: 2, origin: { x: 2 * res, y: -1 * res }, missions: 7, grid, stalls: [{ x: 1, y: 1 }], stallTotals: { n: 2 }, borders: [] };
  const map = createLocalMap(file);
  assert.equal(map.seed(snap), true);
  const out = map.snapshot();
  assert.equal(out.coveredCells, 2);
  assert.equal(out.missions, 7);
  assert.deepEqual(out.stalls, [{ x: 1, y: 1 }]);
  assert.equal(map.seed(snap), false);                         // ya hay datos: no se vuelve a sembrar
  assert.equal(createLocalMap(file).snapshot().coveredCells, 2);   // persistido en disco
  assert.equal(createLocalMap(path.join(path.dirname(file), 'otro.json')).seed({ ...snap, resolution: 0.5 }), false);   // otra resolución: se rechaza
});
