// Consultas de SOLO LECTURA a la nube de iRobot con la sesión de research/cloud/session.json (la crea login.js).
// Uso: node research/cloud/query.js <pmaps|missionhistory>
// Solo hace GET a rutas de una lista blanca. Guarda la respuesta en research/cloud/out/ (ignorado por git) y muestra solo la ESTRUCTURA (claves y tamaños).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REGION = 'us-east-1';
const SERVICE = 'execute-api';
const ALLOWED = { pmaps: '/v1/%s/pmaps?visible=true&activeDetails=2', missionhistory: '/v1/%s/missionhistory', pmaps_all: '/v1/%s/pmaps' };
// Rutas con parámetros (solo lectura): <pmapId> y <version> se validan para que no pueda colarse otra ruta
const PARAMETRIC = {
  versions: ['/v1/%s/pmaps/%p/versions/%v', 'pmapId', 'version'],
  umf: ['/v1/%s/pmaps/%p/versions/%v/umf', 'pmapId', 'version'],
  settings: ['/v1/%s/pmaps/%p/settings', 'pmapId']
};
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;   // rutas leídas del nativo de la app

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function signedHeaders(method, url, credentials) {
  const u = new URL(url);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const query = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const headers = { host: u.host, 'x-amz-date': amzDate, 'x-amz-security-token': credentials.SessionToken };
  const names = Object.keys(headers).sort();
  const canonical = [method, u.pathname, query, names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), sha('')].join('\n');
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + credentials.SecretKey, date), REGION), SERVICE), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.AccessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${hmac(key, toSign).toString('hex')}`;
  return headers;
}

// Estructura sin contenido: tipos, tamaños y claves hasta cierta profundidad
function shape(value, depth = 0) {
  if (Array.isArray(value)) return `[${value.length}]` + (value.length && depth < 3 ? ' de ' + shape(value[0], depth + 1) : '');
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    return depth >= 3 ? `{${keys.length} claves}` : '{' + keys.slice(0, 14).map((k) => `${k}: ${shape(value[k], depth + 1)}`).join(', ') + (keys.length > 14 ? ', …' : '') + '}';
  }
  return typeof value;
}

async function main() {
  const what = process.argv[2];
  const parametric = Object.hasOwn(PARAMETRIC, what);
  if (!Object.hasOwn(ALLOWED, what) && !parametric) throw new Error(`Uso: node research/cloud/query.js <${Object.keys(ALLOWED).join('|')}> | <${Object.keys(PARAMETRIC).join('|')}> <pmapId> [version]`);
  const session = JSON.parse(fs.readFileSync(path.join(__dirname, 'session.json'), 'utf8'));
  if (session.credentials.Expiration && Date.parse(session.credentials.Expiration) < Date.now()) throw new Error('La sesión caducó: vuelve a ejecutar login.js.');
  const blid = Object.keys(session.robots)[0];
  let route = parametric ? PARAMETRIC[what][0] : ALLOWED[what];
  if (parametric) {
    const args = process.argv.slice(3);
    if (args.length < PARAMETRIC[what].length - 1 || !args.every((a) => SAFE.test(a))) throw new Error('Parámetros no válidos o ausentes.');
    route = route.replace('%p', args[0]).replace('%v', args[1] || '');
  }
  const url = session.deployment.httpBaseAuth + route.replace('%s', blid);
  const response = await fetch(url, { method: 'GET', headers: signedHeaders('GET', url, session.credentials) });
  const text = await response.text();
  console.log(`GET ${what} -> HTTP ${response.status} (${text.length} bytes)`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `${what}.json`), text);
  try { console.log('estructura:', shape(JSON.parse(text))); } catch (_) { console.log('respuesta no JSON (primeros 160):', text.slice(0, 160).replace(/[0-9A-F]{32}/g, '<id>')); }
}

main().catch((error) => { console.error('Error:', error.message); process.exit(1); });
