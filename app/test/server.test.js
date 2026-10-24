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
  assert.equal((await post(`${s.url}/api/cmd`, { command: 'evac' })).status, 400, 'evac solo por la ruta experimental');
  assert.equal((await post(`${s.url}/api/cmd`, { command: 'start' })).status, 200);

  assert.equal((await post(`${s.url}/api/experimental/pref`, { key: 'suctionLevel', value: 2 })).status, 200);
  assert.equal((await post(`${s.url}/api/experimental/pref`, { key: 'suctionLevel', value: 9 })).status, 400);
  assert.equal((await post(`${s.url}/api/experimental/cmd`, { command: 'evac' })).status, 200);
  const after = await (await fetch(`${s.url}/api/state`)).json();
  assert.equal(after.phase, 'evac');
  assert.equal(after.experimentalPrefs.suctionLevel, 2);
});

test('experimentales cerrados con LIBREROOMBA_EXPERIMENTAL=0', async (t) => {
  const s = start(3192, { LIBREROOMBA_EXPERIMENTAL: '0' }); t.after(() => s.child.kill()); await s.ready;
  assert.equal((await post(`${s.url}/api/experimental/cmd`, { command: 'evac' })).status, 403);
  assert.equal((await post(`${s.url}/api/experimental/pref`, { key: 'odoaMode', value: true })).status, 403);
  assert.equal((await (await fetch(`${s.url}/api/state`)).json()).experimental, false);
});
