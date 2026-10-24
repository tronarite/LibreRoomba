// Pruebas del servidor en modo --mock (no se conecta a ningún robot). Uso: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function start(port, extraEnv = {}) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--mock'], { env: { ...process.env, PORT: String(port), ...extraEnv }, stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('disponible')) resolve(); });
  });
  return { child, ready, url: `http://127.0.0.1:${port}` };
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('modo mock: API de ajustes, comandos y experimentales', async (t) => {
  const s = start(3191); t.after(() => s.child.kill()); await s.ready;
  const state = await (await fetch(`${s.url}/api/state`)).json();
  assert.equal(state.connected, true);
  assert.equal(state.experimental, true);
  assert.equal(state.info.language, 'es-ES');
  assert.equal('blid' in state || 'mac' in state, false);

  assert.equal((await post(`${s.url}/api/pref`, { key: 'twoPass', value: true })).status, 200);
  assert.equal((await post(`${s.url}/api/pref`, { key: 'binTypeDetect', value: true })).status, 200);
  assert.equal((await post(`${s.url}/api/pref`, { key: 'twoPass', value: 'si' })).status, 400);
  assert.equal((await post(`${s.url}/api/pref`, { key: 'name', value: '' })).status, 400);
  assert.equal((await post(`${s.url}/api/pref`, { key: 'cloudEnv', value: 'x' })).status, 400, 'cloudEnv no está en la lista blanca');
  assert.equal((await post(`${s.url}/api/cmd`, { command: 'evac' })).status, 200, 'evac es un comando normal (probado en el robot)');
  assert.equal((await post(`${s.url}/api/cmd`, { command: 'start' })).status, 200);

  assert.equal((await post(`${s.url}/api/experimental/pref`, { key: 'suctionLevel', value: 2 })).status, 200);
  assert.equal((await post(`${s.url}/api/experimental/pref`, { key: 'suctionLevel', value: 9 })).status, 400);
  assert.equal((await post(`${s.url}/api/experimental/cmd`, { command: 'evac' })).status, 400);
  const after = await (await fetch(`${s.url}/api/state`)).json();
  assert.equal(after.phase, 'run');
  assert.equal(after.experimentalPrefs.suctionLevel, 2);
});

test('experimentales cerrados con LIBREROOMBA_EXPERIMENTAL=0', async (t) => {
  const s = start(3192, { LIBREROOMBA_EXPERIMENTAL: '0' }); t.after(() => s.child.kill()); await s.ready;
  assert.equal((await post(`${s.url}/api/experimental/cmd`, { command: 'evac' })).status, 403);
  assert.equal((await post(`${s.url}/api/experimental/pref`, { key: 'odoaMode', value: true })).status, 403);
  assert.equal((await (await fetch(`${s.url}/api/state`)).json()).experimental, false);
});

test('/api/health: conectado y sano en mock, con versión y antigüedad del estado', async (t) => {
  const s = start(3192); t.after(() => s.child.kill()); await s.ready;
  const response = await fetch(`${s.url}/api/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.connected, true);
  assert.equal(health.authFailed, false);
  assert.equal(health.mock, true);
  assert.match(health.version, /^[0-9]+[.][0-9]+[.][0-9]+$/);
  assert.ok(health.ageSeconds >= 0 && health.ageSeconds < 30);
  assert.ok(health.uptimeSeconds >= 0);
  assert.equal('blid' in health || 'ip' in health || 'password' in health, false);
});

test('contraseña rechazada: /api/state y /api/health lo reflejan, con ayuda, y las órdenes dan 503', async (t) => {
  const s = start(3193, { MOCK_AUTH_FAIL: '1' }); t.after(() => s.child.kill()); await s.ready;
  let state;
  for (let i = 0; i < 50; i += 1) { state = await (await fetch(`${s.url}/api/state`)).json(); if (state.authFailed) break; await new Promise((r) => setTimeout(r, 50)); }
  assert.equal(state.authFailed, true);
  assert.equal(state.connected, false);
  assert.match(state.authHelp, /get-password/);
  const health = await fetch(`${s.url}/api/health`);
  assert.equal(health.status, 503);
  const body = await health.json();
  assert.equal(body.ok, false);
  assert.equal(body.authFailed, true);
  assert.equal((await post(`${s.url}/api/cmd`, { command: 'start' })).status, 503);
});
