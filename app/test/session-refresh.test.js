const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { refreshSession } = require('../core/session-refresh');
const { createCloud } = require('../core/cloud');

// Sesión ficticia: nada de esto es una credencial real
function setup(expiration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-'));
  const sessionPath = path.join(dir, 'session.json');
  fs.writeFileSync(sessionPath, JSON.stringify({
    deployment: { httpBase: 'https://base.test', httpBaseAuth: 'https://auth.test' },
    credentials: { AccessKeyId: 'old', SecretKey: 'old', SessionToken: 'old', Expiration: expiration },
    robots: { BLIDFAKE: { name: 'R', sku: 'x' } },
    gigya: { apiKey: 'k', domain: 'g.test', uid: 'u', sessionToken: 't', sessionSecret: Buffer.from('s').toString('base64') },
  }));
  return sessionPath;
}
const fakeFetch = (log, { gigyaOk = true } = {}) => async (url, init) => {
  log.push(String(url));
  const json = (o) => ({ status: 200, text: async () => JSON.stringify(o), json: async () => o });
  if (String(url).includes('accounts.getAccountInfo')) return json(gigyaOk ? { UIDSignature: 'sig', signatureTimestamp: '1', UID: 'u' } : { errorCode: 403005 });
  if (String(url).endsWith('/v2/login')) return json({ credentials: { AccessKeyId: 'new', SecretKey: 'n', SessionToken: 'n', Expiration: '2099-01-01T00:00:00+00:00' }, robots: { BLIDFAKE: { name: 'R', sku: 'x' } } });
  return json([]);
};

test('refreshSession guarda credenciales nuevas y un appId, conservando Gigya', async () => {
  const p = setup('2000-01-01T00:00:00+00:00'); const log = [];
  const r = await refreshSession({ sessionPath: p, fetchFn: fakeFetch(log) });
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(r.expiresAt, '2099-01-01T00:00:00+00:00');
  assert.equal(s.credentials.AccessKeyId, 'new');
  assert.match(s.appId, /^ANDROID-/);
  assert.equal(s.gigya.sessionToken, 't');
});

test('refreshSession falla con código expired si Gigya rechaza la sesión, sin tocar el archivo', async () => {
  const p = setup('2000-01-01T00:00:00+00:00'); const before = fs.readFileSync(p, 'utf8');
  await assert.rejects(refreshSession({ sessionPath: p, fetchFn: fakeFetch([], { gigyaOk: false }) }), { code: 'expired' });
  assert.equal(fs.readFileSync(p, 'utf8'), before);
});

test('createCloud con autoRenew renueva una sesión caducada y sigue; sin autoRenew avisa', async () => {
  const p = setup('2000-01-01T00:00:00+00:00'); const log = [];
  const f = fakeFetch(log);
  const cloud = createCloud({ sessionPath: p, fetchFn: f, autoRenew: true });
  await cloud.missionHistory({ refresh: true });
  assert.ok(log.some((u) => u.endsWith('/v2/login')));
  assert.ok(log.some((u) => u.includes('auth.test')));
  const manual = createCloud({ sessionPath: setup('2000-01-01T00:00:00+00:00'), fetchFn: fakeFetch([]) });
  await assert.rejects(manual.missionHistory({ refresh: true }), { code: 'expired' });
});
