const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocalParts } = require('../core/localparts');

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parts-')), 'p.json');

test('sin configurar hasta que se marca una pieza; luego cuenta desde las horas del robot', () => {
  const p = createLocalParts(file());
  assert.ok(p.list(100).every((r) => r.status === 'sin configurar' && r.usedHours === null));
  p.update(35, { action: 'replace' }, 100);
  const filter = p.list(130).find((r) => r.id === '35');
  assert.deepEqual([filter.usedHours, filter.remainingHours, filter.status], [30, 30, 'bien']);
  assert.equal(p.list(155).find((r) => r.id === '35').status, 'pronto');
  assert.equal(p.list(170).find((r) => r.id === '35').status, 'agotada');
});

test('horas ya usadas, vida útil propia y persistencia', () => {
  const f = file();
  const p = createLocalParts(f);
  p.update(36, { usedHours: 50 }, 400);
  p.update(36, { lifeHours: 100 }, 400);
  const row = createLocalParts(f).list(410).find((r) => r.id === '36');
  assert.deepEqual([row.usedHours, row.lifeHours, row.remainingHours], [60, 100, 40]);
});

test('validación', () => {
  const p = createLocalParts(file());
  assert.throws(() => p.update(999, { action: 'replace' }, 10), { code: 'bad_request' });
  assert.throws(() => p.update(35, { action: 'replace' }, null), { code: 'bad_request' });
  assert.throws(() => p.update(35, { usedHours: -1 }, 10), { code: 'bad_request' });
  assert.throws(() => p.update(35, { lifeHours: 0 }, 10), { code: 'bad_request' });
  assert.throws(() => p.update(35, null, 10), { code: 'bad_request' });
});

test('API /api/parts en modo mock: lista local y errores claros', async (t) => {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--mock'], { env: { ...process.env, PORT: '3234', LIBREROOMBA_PARTS_FILE: file(), LIBREROOMBA_ROOMS_FILE: file(), LIBREROOMBA_DND_FILE: file() }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.on('data', (c) => { if (String(c).includes('disponible')) resolve(); }); });
  const base = 'http://127.0.0.1:3234/api/parts';
  const list = await (await fetch(base)).json();
  assert.equal(list.parts.length, 3);
  assert.ok(list.parts.every((r) => r.name && r.lifeHours > 0));
  const post = (id, body) => fetch(`${base}/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post(999, { action: 'replace' })).status, 400);
  assert.equal((await post(36, { lifeHours: 150 })).status, 200);
});
