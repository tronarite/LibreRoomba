// /api/events y avisos por WebSocket en modo --mock (no se conecta a ningún robot).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');

function start(port, env = {}) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--mock'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`el servidor salió con código ${code} (¿puerto ocupado?)`)));
    setTimeout(() => reject(new Error('el servidor no arrancó en 10 s')), 10000).unref();   // sin esto, un puerto ocupado cuelga toda la suite
    child.stdout.on('data', (c) => { if (String(c).includes('disponible')) resolve(); });
  });
  return { child, ready, url: `http://127.0.0.1:${port}` };
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('/api/events: vacío al arrancar y, tras una misión simulada, un único aviso de misión terminada (API y WebSocket)', async (t) => {
  const s = start(3198); t.after(() => s.child.kill()); await s.ready;
  assert.deepEqual(await (await fetch(`${s.url}/api/events`)).json(), [], 'sin avisos del estado inicial');

  const ws = new WebSocket(`ws://127.0.0.1:3198/ws`);
  const pushed = [];
  ws.on('message', (m) => { const d = JSON.parse(m); if (d.notification) pushed.push(d.notification); });
  await new Promise((resolve) => ws.once('open', resolve));
  t.after(() => ws.close());

  assert.equal((await post(`${s.url}/api/cmd`, { command: 'start' })).status, 200);
  await wait(200);
  assert.equal((await post(`${s.url}/api/cmd`, { command: 'dock' })).status, 200);
  const deadline = Date.now() + 8000;
  let events = [];
  while (Date.now() < deadline) { events = await (await fetch(`${s.url}/api/events`)).json(); if (events.length) break; await wait(200); }

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'mission-finished');
  assert.equal(events[0].severity, 'info');
  assert.ok(Date.parse(events[0].at) > 0);
  await wait(100);
  assert.equal(pushed.length, 1, 'el WebSocket recibió el mismo aviso');
  assert.equal(pushed[0].id, events[0].id);
  assert.ok(!('notification' in events[0]));
});

test('/api/dnd: guarda franjas, devuelve conflictos y rechaza datos no válidos (archivo temporal)', async (t) => {
  const fs = require('node:fs');
  const file = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lr-dnd-')), 'dnd.json');
  const s = start(3197, { LIBREROOMBA_DND_FILE: file }); t.after(() => s.child.kill()); await s.ready;
  assert.deepEqual(await (await fetch(`${s.url}/api/dnd`)).json(), { items: [], active: null, conflicts: { overlaps: [], schedule: [] } });
  const w = { enabled: true, label: 'quiet', days: [1], start: { hour: 9, min: 0 }, end: { hour: 11, min: 0 } };
  const saved = await post(`${s.url}/api/dnd`, { items: [w, { ...w, label: 'nap' }] });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.equal(body.items.length, 2);
  assert.deepEqual(body.conflicts.overlaps, [[0, 1]]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 2, 'guardado en el archivo indicado');
  const bad = await post(`${s.url}/api/dnd`, { items: [{ ...w, days: [9] }] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /día/);
  const sched = await post(`${s.url}/api/schedule`, { items: [{ enabled: true, start: { day: [1], hour: 10, min: 0 } }] });
  assert.equal(sched.status, 200);
  assert.deepEqual((await sched.json()).warnings, [{ schedule: 0, dnd: 0, day: 1 }]);
  assert.ok('dnd' in await (await fetch(`${s.url}/api/state`)).json(), 'el resumen incluye el estado de No molestar');
});
