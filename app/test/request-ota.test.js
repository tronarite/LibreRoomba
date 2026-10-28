const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, buildRequest, findInteresting, ROUTE } = require('../../research/cloud/request-ota');

// Sesión ficticia: nada de esto es una credencial real
function setup(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-'));
  const sessionPath = path.join(dir, 'session.json');
  fs.writeFileSync(sessionPath, JSON.stringify({
    appId: 'ANDROID-TEST-1234', deployment: { httpBaseAuth: 'https://auth.example.test' },
    credentials: { AccessKeyId: 'AKTEST', SecretKey: 'SKTEST', SessionToken: 'TOKTEST', Expiration: '2999-01-01T00:00:00Z' },
    robots: { BLIDTEST1234: { name: 'Robot' } }, ...extra
  }));
  return { dir, sessionPath, outDir: path.join(dir, 'out') };
}
const noNet = () => { throw new Error('no debe tocar la red'); };

test('modo prueba: muestra la petición y no usa la red', async () => {
  const s = setup(); const lines = [];
  const r = await run({ argv: ['--version', 'daredevil+2.6.0'], env: {}, fetchFn: noNet, ...s, log: (l) => lines.push(l) });
  assert.equal(r.sent, false);
  const out = lines.join('\n');
  assert.match(out, /software_version/);
  assert.match(out, /…1234/);
  assert.ok(!/TOKTEST|SKTEST|AKTEST|BLIDTEST1234/.test(out), 'sin secretos ni blid completo');
  assert.ok(!/authorization/i.test(out));
});

test('--send sin LIBREROOMBA_CONFIRM_OTA=yes aborta sin red', async () => {
  const s = setup();
  await assert.rejects(run({ argv: ['--send', '--version', 'v1'], env: {}, fetchFn: noNet, ...s, log() {} }), /LIBREROOMBA_CONFIRM_OTA/);
  await assert.rejects(run({ argv: ['--send', '--version', 'v1'], env: { LIBREROOMBA_CONFIRM_OTA: 'si' }, fetchFn: noNet, ...s, log() {} }), /LIBREROOMBA_CONFIRM_OTA/);
});

test('la confirmación sola (sin --send) tampoco envía', async () => {
  const s = setup();
  const r = await run({ argv: ['--version', 'v1'], env: { LIBREROOMBA_CONFIRM_OTA: 'yes' }, fetchFn: noNet, ...s, log() {} });
  assert.equal(r.sent, false);
});

test('falta --version, falta appId: errores claros', async () => {
  const s = setup();
  await assert.rejects(run({ argv: [], env: {}, fetchFn: noNet, ...s, log() {} }), /--version/);
  const s2 = setup({ appId: undefined });
  await assert.rejects(run({ argv: ['--version', 'v1'], env: {}, fetchFn: noNet, ...s2, log() {} }), /login\.js/);
});

test('la petición va firmada, es POST y solo a la ruta request-ota', () => {
  const session = JSON.parse(fs.readFileSync(setup().sessionPath, 'utf8'));
  const req = buildRequest(session, 'daredevil+2.6.0', new Date('2026-10-28T19:00:00Z'));
  assert.equal(req.method, 'POST');
  assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKTEST\//);
  assert.equal(req.headers['x-amz-security-token'], 'TOKTEST');
  assert.equal(req.body, '{"software_version":"daredevil+2.6.0"}');
  const u = new URL(req.url);
  assert.equal(u.host, 'auth.example.test');
  assert.ok(ROUTE.test(u.pathname));
  assert.equal(u.searchParams.get('app_id'), 'ANDROID-TEST-1234');
  assert.throws(() => buildRequest({ ...session, robots: { 'a/../b': {} } }, 'v1'), /no válido/);
});

test('envío con fetch simulado: una sola petición, guarda la respuesta y encuentra las URL', async () => {
  const s = setup(); let calls = 0;
  const payload = { status: 'ok', update: { downloadUrl: 'https://cdn.example.test/fw/pkg.bin', size: 12, sha256: 'abc', deploymentMpkg: 'mpkg1' }, list: [{ other: 'https://x.example.test/y' }, { u: 'http://no.example.test' }] };
  const fetchFn = async (url, opts) => {
    calls++;
    assert.equal(opts.method, 'POST');
    return { status: 200, headers: new Map([['content-type', 'application/json'], ['set-cookie', 'secreto']]), text: async () => JSON.stringify(payload) };
  };
  const r = await run({ argv: ['--send', '--version', 'v1'], env: { LIBREROOMBA_CONFIRM_OTA: 'yes' }, fetchFn, ...s, log() {} });
  assert.equal(calls, 1);
  assert.equal(r.found.urls.length, 2);
  const saved = JSON.parse(fs.readFileSync(r.saved, 'utf8'));
  assert.equal(saved.status, 200);
  assert.ok(!('set-cookie' in saved.headers));
  assert.deepEqual(saved.body, payload);
});

test('findInteresting: URLs https y claves de interés', () => {
  const f = findInteresting({ a: { downloadUrl: 'https://h/x', size: 5, signature: 's' }, b: ['https://z', 'http://no'] });
  assert.deepEqual(f.urls.map((u) => u.url), ['https://h/x', 'https://z']);
  assert.deepEqual(f.fields.map((x) => x.path).sort(), ['a.downloadUrl', 'a.signature', 'a.size']);
});

test('--download baja con streaming, calcula sha256 y rechaza http', async () => {
  const s = setup(); const data = Buffer.from('contenido-de-prueba');
  const fetchFn = async (url, opts) => {
    if (opts.method === 'POST') return { status: 200, headers: new Map(), text: async () => JSON.stringify({ downloadUrl: 'https://cdn.example.test/fw/pkg.bin' }) };
    return { status: 200, headers: { get: () => String(data.length) }, body: (async function* () { yield data; })() };
  };
  const r = await run({ argv: ['--send', '--download', '--version', 'v1'], env: { LIBREROOMBA_CONFIRM_OTA: 'yes' }, fetchFn, ...s, log() {} });
  assert.equal(r.downloads[0].size, data.length);
  assert.equal(r.downloads[0].sha256, require('crypto').createHash('sha256').update(data).digest('hex'));
  assert.ok(fs.existsSync(r.downloads[0].file));
});
