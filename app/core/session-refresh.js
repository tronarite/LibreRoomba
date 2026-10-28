// Renueva las credenciales de la nube de iRobot (duran ~1 h) sin pedir la contraseña: usa la sesión de Gigya que guardó login.js
// (token + secreto), obtiene una firma nueva de la cuenta y repite el login de iRobot (/v2/login). No escribe nada en la cuenta.
const fs = require('fs');
const crypto = require('crypto');

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

class RefreshError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// Firma de Gigya (estilo OAuth1): sig = base64(HMAC-SHA1(secreto, "POST&url&parámetros ordenados"))
function signedParams(url, g, params, now) {
  const all = { ...params, apiKey: g.apiKey, oauth_token: g.sessionToken, nonce: `${now}_${crypto.randomInt(1e9)}`, timestamp: String(Math.floor(now / 1000)), format: 'json', httpStatusCodes: 'false' };
  const query = Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join('&');
  all.sig = crypto.createHmac('sha1', Buffer.from(g.sessionSecret, 'base64')).update(`POST&${enc(url)}&${enc(query)}`).digest('base64');
  return all;
}

async function postJson(fetchFn, url, init) {
  let response;
  try { response = await fetchFn(url, init); } catch (_) { throw new RefreshError('No se pudo contactar con iRobot para renovar la sesión.', 'network'); }
  const text = await response.text();
  try { return JSON.parse(text); } catch (_) { throw new RefreshError(`Respuesta no válida al renovar la sesión (${response.status}).`, 'http'); }
}

async function refreshSession({ sessionPath, fetchFn = globalThis.fetch, now = () => Date.now() } = {}) {
  let session;
  try { session = JSON.parse(fs.readFileSync(sessionPath, 'utf8')); } catch (_) { throw new RefreshError('No hay sesión guardada: ejecuta node research/cloud/login.js', 'no-session'); }
  const g = session.gigya;
  if (!g || !g.sessionToken || !g.sessionSecret) throw new RefreshError('La sesión no trae datos de Gigya: ejecuta node research/cloud/login.js', 'no-session');

  const url = `https://accounts.${g.domain}/accounts.getAccountInfo`;
  const info = await postJson(fetchFn, url, { method: 'POST', body: new URLSearchParams(signedParams(url, g, { include: 'profile' }, now())) });
  if (info.errorCode || !info.UIDSignature) throw new RefreshError(`La sesión de la cuenta caducó (Gigya ${info.errorCode || 'sin firma'}): ejecuta node research/cloud/login.js`, 'expired');

  const appId = session.appId || `ANDROID-${crypto.randomUUID().toUpperCase()}`;
  const body = { app_id: appId, assume_robot_ownership: '0', gigya: { signature: info.UIDSignature, timestamp: info.signatureTimestamp, uid: info.UID } };
  const login = await postJson(fetchFn, `${session.deployment.httpBase}/v2/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!login.credentials || !login.robots) throw new RefreshError('iRobot no devolvió credenciales nuevas: ejecuta node research/cloud/login.js', 'expired');

  const next = { ...session, savedAt: new Date(now()).toISOString(), appId, credentials: login.credentials, robots: login.robots };
  fs.writeFileSync(sessionPath, JSON.stringify(next));
  return { expiresAt: login.credentials.Expiration || null };
}

module.exports = { refreshSession, RefreshError };
