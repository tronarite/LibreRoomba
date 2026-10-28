const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('node:child_process');
const { createRooms, measure } = require('../rooms');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-')), 'r.json');

test('guarda, ordena las esquinas y persiste', () => {
  const f = tmp();
  const r = createRooms(f);
  r.set([{ name: ' Salón ', x0: 3, y0: 2, x1: 1, y1: -1 }]);
  assert.deepEqual(createRooms(f).list(), [{ name: 'Salón', x0: 1, y0: -1, x1: 3, y1: 2 }]);
});

test('rechaza nombres vacíos, rectángulos diminutos, valores no numéricos y exceso', () => {
  const r = createRooms(tmp());
  const ok = { name: 'A', x0: 0, y0: 0, x1: 1, y1: 1 };
  for (const bad of [{ ...ok, name: '' }, { ...ok, name: 'x'.repeat(31) }, { ...ok, x1: 0.1 }, { ...ok, x0: '0' }, { ...ok, y1: 1000 }, null]) {
    assert.throws(() => r.set([bad]), { code: 'bad_request' });
  }
  assert.throws(() => r.set(Array(31).fill(ok)), { code: 'bad_request' });
  assert.deepEqual(r.list(), [], 'un fallo no cambia nada');
});

test('measure: área del rectángulo y porcentaje cubierto del mapa fusionado', () => {
  // mapa 4x4 de 0,5 m con origen (0,0); cubierta la mitad izquierda (columnas 0 y 1)
  const grid = Buffer.alloc(16);
  for (let cy = 0; cy < 4; cy++) { grid[cy * 4] = 1; grid[cy * 4 + 1] = 2; }
  const map = { origin: { x: 0, y: 0 }, width: 4, height: 4, resolution: 0.5, grid: grid.toString('base64') };
  const [a] = measure([{ name: 'Todo', x0: 0, y0: 0, x1: 2, y1: 2 }], map);
  assert.deepEqual([a.areaM2, a.coveredM2, a.coveragePct], [4, 2, 50]);
  const [b] = measure([{ name: 'Todo', x0: 0, y0: 0, x1: 2, y1: 2 }], null);
  assert.deepEqual([b.areaM2, b.coveredM2, b.coveragePct], [4, null, null]);
});

test('API /api/rooms en modo mock', async (t) => {
  const f = tmp();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--mock'], { env: { ...process.env, PORT: '3232', LIBREROOMBA_ROOMS_FILE: f }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.on('data', (c) => { if (String(c).includes('disponible')) resolve(); }); });
  const url = 'http://127.0.0.1:3232/api/rooms';
  const put = (rooms) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rooms }) });
  assert.deepEqual((await (await fetch(url)).json()).rooms, []);
  const res = await put([{ name: 'Cocina', x0: -1, y0: -1, x1: 2, y1: 2 }]);
  assert.equal(res.status, 200);
  const [room] = (await res.json()).rooms;
  assert.equal(room.areaM2, 9);
  assert.equal(typeof room.coveragePct, 'number', 'con el mapa mock hay cobertura');
  assert.equal((await put([{ name: '', x0: 0, y0: 0, x1: 1, y1: 1 }])).status, 400);
});

test('mapa y habitaciones pedidos a la vez responden bien (comparten la descarga en curso)', async (t) => {
  const f = tmp();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--mock'], { env: { ...process.env, PORT: '3233', LIBREROOMBA_ROOMS_FILE: f }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.on('data', (c) => { if (String(c).includes('disponible')) resolve(); }); });
  const [map, rooms] = await Promise.all([fetch('http://127.0.0.1:3233/api/cloud/map'), fetch('http://127.0.0.1:3233/api/rooms')]);
  assert.equal(map.status, 200);
  assert.equal(rooms.status, 200);
});
