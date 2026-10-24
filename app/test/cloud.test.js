const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCloud, CloudError, normalizeMission, mapRef } = require('../core/cloud');

// Sesión ficticia: nada de esto es una credencial real
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-')); }
function writeSession(dir, extra = {}) {
  const file = path.join(dir, 'session.json');
  fs.writeFileSync(file, JSON.stringify({
    deployment: { httpBaseAuth: 'https://auth.example.test' },
    credentials: { AccessKeyId: 'AKTEST', SecretKey: 'SKTEST', SessionToken: 'TOKTEST', Expiration: '2999-01-01T00:00:00Z' },
    robots: { BLIDTEST: { name: 'Robot', sku: 'sku1' } }, ...extra
  }));
  return file;
}
const ok = (data) => ({ status: 200, json: async () => data });
function fakeFetch(handler) { const calls = []; const fn = async (url, init) => { calls.push({ url, init }); return handler(url, init); }; fn.calls = calls; return fn; }

test('sin sesión: mensaje claro y estado sin credenciales', async () => {
  const cloud = createCloud({ sessionPath: path.join(tmp(), 'no-existe.json'), fetchFn: fakeFetch(() => ok([])) });
  await assert.rejects(cloud.missionHistory(), (e) => e instanceof CloudError && e.code === 'no-session' && /login\.js/.test(e.message));
  assert.deepEqual(Object.keys(cloud.status()).sort(), ['hasSession', 'message', 'reason']);
});

test('sesión caducada se detecta antes de pedir nada', async () => {
  const dir = tmp();
  const fetchFn = fakeFetch(() => ok([]));
  const cloud = createCloud({ sessionPath: writeSession(dir, { credentials: { AccessKeyId: 'a', SecretKey: 'b', SessionToken: 'c', Expiration: '2000-01-01T00:00:00Z' } }), fetchFn });
  await assert.rejects(cloud.missionHistory(), { code: 'expired' });
  assert.equal(fetchFn.calls.length, 0);
});

test('historial: GET firmado a la ruta correcta, sin cuerpo y sin filtrar credenciales al estado', async () => {
  const dir = tmp();
  const fetchFn = fakeFetch(() => ok([{ startTime: 1 }]));
  const cloud = createCloud({ sessionPath: writeSession(dir), fetchFn, cacheDir: path.join(dir, 'cache') });
  const data = await cloud.missionHistory();
  assert.equal(data.length, 1);
  const [call] = fetchFn.calls;
  assert.equal(call.url, 'https://auth.example.test/v1/BLIDTEST/missionhistory');
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.body, undefined);
  assert.match(call.init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKTEST\//);
  assert.equal(call.init.headers['x-amz-security-token'], 'TOKTEST');
  const status = JSON.stringify(cloud.status());
  assert.ok(!/TOKTEST|SKTEST|AKTEST|BLIDTEST/.test(status), 'el estado no debe incluir credenciales ni BLID');
});

test('caché: el historial no se vuelve a pedir dentro de 5 minutos, refresh lo fuerza, y el mapa de una versión se pide una sola vez', async () => {
  const dir = tmp();
  let t = Date.parse('2026-10-24T12:00:00Z');
  const fetchFn = fakeFetch((url) => ok(url.endsWith('/umf') ? { maps: [] } : []));
  const cloud = createCloud({ sessionPath: writeSession(dir), fetchFn, cacheDir: path.join(dir, 'c'), now: () => t });
  await cloud.missionHistory(); await cloud.missionHistory();
  assert.equal(fetchFn.calls.length, 1);
  await cloud.missionHistory({ refresh: true });
  assert.equal(fetchFn.calls.length, 2);
  t += 6 * 60 * 1000;
  await cloud.missionHistory();
  assert.equal(fetchFn.calls.length, 3, 'caducó la caché');
  await cloud.umf('mapA', 'v1'); await cloud.umf('mapA', 'v1');
  assert.equal(fetchFn.calls.filter((c) => c.url.endsWith('/umf')).length, 1);
  assert.equal(fetchFn.calls.at(-1).url, 'https://auth.example.test/v1/BLIDTEST/pmaps/mapA/versions/v1/umf');
  // otra instancia (otro arranque del servidor) reutiliza el disco
  const again = createCloud({ sessionPath: writeSession(dir), fetchFn, cacheDir: path.join(dir, 'c'), now: () => t });
  await again.umf('mapA', 'v1');
  assert.equal(fetchFn.calls.filter((c) => c.url.endsWith('/umf')).length, 1);
});

test('parámetros inválidos nunca llegan a la red (no se puede colar otra ruta)', async () => {
  const fetchFn = fakeFetch(() => ok({}));
  const cloud = createCloud({ sessionPath: writeSession(tmp()), fetchFn });
  for (const [id, v] of [['../x', 'v'], ['a/b', 'v'], ['a', 'v?x=1'], ['', 'v'], ['a'.repeat(65), 'v']]) {
    await assert.rejects(cloud.umf(id, v), { code: 'invalid' }, `${id}|${v}`);
  }
  assert.equal(fetchFn.calls.length, 0);
});

test('errores de la nube: 401/403 = sesión caducada, 5xx = http, fallo de red = network', async () => {
  const mk = (handler) => createCloud({ sessionPath: writeSession(tmp()), fetchFn: fakeFetch(handler) });
  await assert.rejects(mk(() => ({ status: 403 })).missionHistory(), { code: 'expired' });
  await assert.rejects(mk(() => ({ status: 401 })).missionHistory(), { code: 'expired' });
  await assert.rejects(mk(() => ({ status: 500 })).missionHistory(), { code: 'http', status: 500 });
  await assert.rejects(mk(() => { throw new Error('ECONNRESET con TOKTEST'); }).missionHistory(), (e) => e.code === 'network' && !/TOKTEST/.test(e.message));
  await assert.rejects(mk(() => ok({ no: 'lista' })).missionHistory(), { code: 'http' });
});

test('normalizeMission: resultado, área en m², hora y referencia de mapa', () => {
  const m = { done: 'cncl', startTime: 1792845000, durationM: 12, sqft: 100, evacs: 2, dockedAtStart: true, nMssn: 7, pmaps_robot: [{ 'pmapAAAA': '261024T123126' }] };
  const n = normalizeMission(m);
  assert.deepEqual([n.result, n.label, n.durationMin, n.areaM2, n.evacs, n.dockedAtStart, n.hasMap], ['cancelada', 'Cancelada', 12, 9.3, 2, true, true]);
  assert.equal(n.startedAt, new Date(1792845000 * 1000).toISOString());
  assert.ok(!('pmaps_robot' in n) && !JSON.stringify(n).includes('pmapAAAA'), 'la ficha pública no lleva ids de mapa');
  assert.deepEqual(mapRef(m), { pmapId: 'pmapAAAA', version: '261024T123126' });
  assert.equal(mapRef({ pmaps_robot: [{ '../mal': 'v' }] }), null);
  for (const [done, result] of [['ok', 'ok'], ['stuck', 'atascada'], ['inc', 'incompleta'], ['raro', 'desconocido'], [undefined, 'desconocido']]) assert.equal(normalizeMission({ done }).result, result);
  const empty = normalizeMission({});
  assert.deepEqual([empty.startedAt, empty.durationMin, empty.areaM2, empty.evacs, empty.hasMap], [null, null, null, 0, false]);
});
