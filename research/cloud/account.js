// Lectura (SOLO LECTURA) de los datos de tu cuenta de iRobot en Gigya, con la sesión que guarda login.js (sin pedir la contraseña otra vez).
// Uso: node research/cloud/account.js            -> lista los interruptores *_FSW y campos de mapas de la cuenta (valores y permisos de escritura)
//      node research/cloud/account.js --keys     -> además, los nombres (no los valores) de todos los campos de data
// No imprime correo, nombre, tokens ni identificadores. No escribe nada en la cuenta.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION = path.join(__dirname, 'session.json');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Firma de peticiones de sesión de Gigya (estilo OAuth1): sig = base64(HMAC-SHA1(secreto, "POST&url&parámetros ordenados"))
function signedParams(method, url, g, params) {
  const all = { ...params, apiKey: g.apiKey, oauth_token: g.sessionToken, nonce: `${Date.now()}_${crypto.randomInt(1e9)}`, timestamp: String(Math.floor(Date.now() / 1000)), format: 'json', httpStatusCodes: 'false' };
  const query = Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join('&');
  const base = `${method}&${enc(url)}&${enc(query)}`;
  all.sig = crypto.createHmac('sha1', Buffer.from(g.sessionSecret, 'base64')).update(base).digest('base64');
  return all;
}

async function call(g, apiMethod, params) {
  const url = `https://accounts.${g.domain}/${apiMethod}`;
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(signedParams('POST', url, g, params)) });
  const text = await response.text();
  try { return JSON.parse(text); } catch (_) { throw new Error(`Respuesta no JSON de ${apiMethod}: ${text.slice(0, 120)}`); }
}

async function main() {
  const session = JSON.parse(fs.readFileSync(SESSION, 'utf8'));
  if (!session.gigya) throw new Error('La sesión no trae datos de Gigya: vuelve a ejecutar login.js (versión nueva) en tu terminal.');
  const g = session.gigya;

  const info = await call(g, 'accounts.getAccountInfo', { include: 'data,profile', extraProfileFields: '' });
  if (info.errorCode) throw new Error(`getAccountInfo: código ${info.errorCode} (${info.errorMessage || info.errorDetails || 'sin mensaje'})`);
  const data = info.data || {};
  const names = Object.keys(data);
  console.log(`Campos en data: ${names.length}`);
  if (process.argv.includes('--keys')) console.log('nombres:', names.join(', '));
  const interesting = names.filter((k) => /FSW|OPTIN|OPT_IN|PMAP|MAP|LEARN|FEATURE/i.test(k));
  console.log('\nCampos de interés (interruptores y mapas):');
  for (const k of interesting) console.log(`  ${k} = ${JSON.stringify(data[k]).slice(0, 80)}`);
  if (!interesting.length) console.log('  (ninguno: los interruptores pueden no estar definidos en tu cuenta y usarse el valor por defecto)');

  const schema = await call(g, 'accounts.getSchema', { filter: 'explicitOnly' });
  if (schema.errorCode) { console.log(`\ngetSchema: código ${schema.errorCode} (${schema.errorMessage || 'sin mensaje'})`); return; }
  const fields = (schema.dataSchema && schema.dataSchema.fields) || {};
  console.log('\nPermisos de escritura en el esquema (para los campos de interés y los *_FSW):');
  const wanted = Object.keys(fields).filter((k) => /FSW|OPTIN|OPT_IN|PMAP|LEARN/i.test(k));
  for (const k of wanted) console.log(`  ${k}: writeAccess=${fields[k].writeAccess || '(por defecto)'} · type=${fields[k].type || '?'}`);
  if (!wanted.length) console.log('  (el esquema no declara campos con esos nombres)');
}

main().catch((error) => { console.error('Error:', error.message); process.exit(1); });
