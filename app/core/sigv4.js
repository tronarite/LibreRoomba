// Firma AWS Signature V4 para peticiones GET/sin cuerpo (lo que necesita el cliente de solo lectura de la nube de iRobot).
const crypto = require('crypto');

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// credentials: { AccessKeyId, SecretKey, SessionToken? }. Devuelve las cabeceras a enviar (host, x-amz-date, x-amz-security-token?, authorization).
function sign({ method = 'GET', url, credentials, region = 'us-east-1', service = 'execute-api', now = new Date(), payload = '' }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const headers = { host: u.host, 'x-amz-date': amzDate };
  if (credentials.SessionToken) headers['x-amz-security-token'] = credentials.SessionToken;
  const names = Object.keys(headers).sort();
  const canonical = [method, u.pathname || '/', query, names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), sha(payload)].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + credentials.SecretKey, date), region), service), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.AccessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${hmac(key, toSign).toString('hex')}`;
  return headers;
}

module.exports = { sign };
