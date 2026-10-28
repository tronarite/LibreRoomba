const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createGuard } = require('../core/localguard');

test('acepta nombres locales y rechaza hosts ajenos (DNS rebinding)', () => {
  const g = createGuard({ host: '127.0.0.1' });
  for (const host of ['127.0.0.1:3000', 'localhost:3000', '[::1]:3000', 'LOCALHOST']) assert.equal(g.check({ host }), null, host);
  for (const host of ['evil.example:3000', '127.0.0.1.evil.example', '', undefined]) assert.equal(g.check({ host }), 'Host no permitido', String(host));
});

test('Origin debe coincidir con Host', () => {
  const g = createGuard();
  assert.equal(g.check({ host: 'localhost:3000', origin: 'http://localhost:3000' }), null);
  assert.equal(g.check({ host: 'localhost:3000', origin: 'https://evil.example' }), 'Origen no permitido');
  assert.equal(g.check({ host: 'localhost:3000', origin: 'http://localhost:9999' }), 'Origen no permitido');
  assert.equal(g.check({ host: 'localhost:3000', origin: 'null' }), 'Origen no permitido');
});

test('host configurado y hosts extra', () => {
  const g = createGuard({ host: '192.168.1.5', extraHosts: [' roomba.lan '] });
  assert.equal(g.check({ host: '192.168.1.5:3000' }), null);
  assert.equal(g.check({ host: 'roomba.lan' }), null);
  assert.equal(createGuard({ host: '0.0.0.0' }).check({ host: '0.0.0.0:3000' }), 'Host no permitido');
});

test('servidor mock: peticiones de otro origen o host reciben 403', async (t) => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--mock'], { env: { ...process.env, PORT: '3231', LIBREROOMBA_DND_FILE: path.join(require('os').tmpdir(), 'dnd-guard-test.json') }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.on('data', (c) => { if (String(c).includes('disponible')) resolve(); }); });
  const url = 'http://127.0.0.1:3231/api/cmd';
  const post = (headers) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ command: 'find' }) });
  assert.equal((await post({})).status, 200);
  assert.equal((await post({ Origin: 'http://127.0.0.1:3231' })).status, 200);
  assert.equal((await post({ Origin: 'https://evil.example' })).status, 403);
  const status = await new Promise((resolve, reject) => {
    require('node:http').get({ host: '127.0.0.1', port: 3231, path: '/api/state', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403, 'Host ajeno (DNS rebinding)');
});
