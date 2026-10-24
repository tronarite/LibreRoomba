// Datos de ejemplo inventados (no son del robot real).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');
const { parseNotes, resolveConfig } = require('../start');

const notesFile = (text) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notes-')), 'LOCAL-NOTES.md'); fs.writeFileSync(f, text); return f; };

test('parseNotes: solo las claves permitidas, con comillas y comentarios, ignorando el resto', () => {
  const found = parseNotes([
    '# Datos locales (NO subir a git)', 'ROBOT_IP=10.0.0.5', 'ROBOT_BLID = "ABC123"  # el BLID', 'MAC=00:11:22:33:44:55',
    'Contraseña: research/robot-password.txt', '  $env:ROBOT_IP="9.9.9.9"; node app/server.js', 'ROBOT_IP=10.0.0.6'
  ].join('\r\n'));
  assert.deepEqual(found, { ROBOT_IP: '10.0.0.5', ROBOT_BLID: 'ABC123' });
});

test('resolveConfig: el entorno gana a LOCAL-NOTES.md y se informa de dónde sale cada dato', () => {
  const f = notesFile('ROBOT_IP=10.0.0.5\nROBOT_BLID=ABC123\n');
  const r = resolveConfig({ ROBOT_IP: '10.0.0.77' }, f);
  assert.deepEqual(r.env, { ROBOT_IP: '10.0.0.77', ROBOT_BLID: 'ABC123' });
  assert.deepEqual(r.sources, { ROBOT_IP: 'entorno', ROBOT_BLID: 'LOCAL-NOTES.md' });
  assert.deepEqual(r.missing, []);
});

test('resolveConfig: sin archivo ni entorno lista lo que falta', () => {
  const r = resolveConfig({}, path.join(os.tmpdir(), 'no-existe-LOCAL-NOTES.md'));
  assert.deepEqual(r.missing, ['ROBOT_IP', 'ROBOT_BLID']);
  assert.deepEqual(r.env, {});
});

test('start.js sin datos: sale con error claro y no imprime ningún valor (nunca usa los datos reales del equipo)', () => {
  const env = { ...process.env };
  delete env.ROBOT_IP; delete env.ROBOT_BLID;
  // LIBREROOMBA_NOTES apunta a un archivo inexistente: aunque haya un LOCAL-NOTES.md real, la prueba no lo ve ni arranca el servidor.
  const missing = path.join(os.tmpdir(), 'no-existe-LOCAL-NOTES.md');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'start.js')], { env: { ...env, LIBREROOMBA_NOTES: missing }, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Faltan datos del robot: ROBOT_IP, ROBOT_BLID/);
  assert.match(r.stderr, /npm run mock/);
  assert.equal(r.stdout, '');
});
