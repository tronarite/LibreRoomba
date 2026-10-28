// Inicio de sesión LECTURA-SOLO en la nube de iRobot con TU cuenta. Lo ejecutas tú: la contraseña se pide aquí, oculta, y nunca sale de tu equipo
// salvo hacia los servidores de iRobot (los mismos que usa la app oficial). Uso:  node research/cloud/login.js [correo]
// Hace: (1) descubrimiento público, (2) login en Gigya, (3) login en iRobot, (4) lista tus robots. NO envía órdenes ni cambia nada.
// Guarda la sesión en research/cloud/session.json (ignorado por git). No imprime tokens ni contraseñas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const COUNTRY = process.env.ROBOT_COUNTRY || 'ES';
const SESSION = path.join(__dirname, 'session.json');
const LOCAL_PASSWORD = path.resolve(__dirname, '../robot-password.txt');

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); else process.stdout.write('*'); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

async function json(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch (_) { throw new Error(`Respuesta no JSON (${response.status}): ${text.slice(0, 120)}`); }
}

async function main() {
  const email = process.argv[2] || await ask('Correo de tu cuenta iRobot: ');
  const password = await ask('Contraseña (no se muestra): ', true);
  if (!email || !password) throw new Error('Faltan correo o contraseña.');

  // 1) Descubrimiento público (clave de Gigya y servidores)
  const disc = await json(await fetch(`https://disc-prod.iot.irobotapi.com/v1/discover/endpoints?country_code=${COUNTRY}`));
  const dep = disc.deployments && disc.deployments[disc.current_deployment];
  if (!dep || !disc.gigya) throw new Error('El descubrimiento no devolvió el formato esperado.');

  // 2) Login en Gigya
  const form = new URLSearchParams({ apiKey: disc.gigya.api_key, targetenv: 'mobile', loginID: email, password, format: 'json', httpStatusCodes: 'false' });
  const gigya = await json(await fetch(`https://accounts.${disc.gigya.datacenter_domain}/accounts.login`, { method: 'POST', body: form }));
  if (gigya.errorCode) throw new Error(`Gigya rechazó el login (código ${gigya.errorCode}: ${gigya.errorMessage || 'sin mensaje'}). No reintentes muchas veces: la cuenta puede bloquearse.`);

  // 3) Login en iRobot con la firma de Gigya
  const body = { app_id: `ANDROID-${crypto.randomUUID().toUpperCase()}`, assume_robot_ownership: '0', gigya: { signature: gigya.UIDSignature, timestamp: gigya.signatureTimestamp, uid: gigya.UID } };
  const login = await json(await fetch(`${dep.httpBase}/v2/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  if (!login.credentials || !login.robots) throw new Error(`iRobot no devolvió credenciales (${JSON.stringify(Object.keys(login))}).`);

  // sessionInfo de Gigya (token y secreto de sesión): permite a account.js leer los datos de la cuenta sin volver a pedir la contraseña
  const gigyaSession = gigya.sessionInfo ? { apiKey: disc.gigya.api_key, domain: disc.gigya.datacenter_domain, uid: gigya.UID, sessionToken: gigya.sessionInfo.sessionToken, sessionSecret: gigya.sessionInfo.sessionSecret } : null;
  fs.writeFileSync(SESSION, JSON.stringify({ savedAt: new Date().toISOString(), appId: body.app_id, deployment: dep, credentials: login.credentials, robots: login.robots, gigya: gigyaSession }, null, 1), { mode: 0o600 });

  // 4) Resumen sin secretos
  let local = null;
  try { local = fs.readFileSync(LOCAL_PASSWORD, 'utf8').trim(); } catch (_) { /* sin contraseña local guardada */ }
  const robots = Object.entries(login.robots);
  console.log(`\nSesión iniciada. Robots en tu cuenta: ${robots.length}`);
  for (const [blid, r] of robots) {
    const same = local && r.password ? (r.password === local ? 'coincide con la local guardada' : 'DIFERENTE de la local guardada') : 'sin comparar';
    console.log(`- ${r.name || '(sin nombre)'} · sku ${r.sku || '?'} · blid …${blid.slice(-4)} · contraseña local: ${r.password ? 'disponible' : 'no'} (${same})`);
  }
  console.log(`\nSesión guardada en research/cloud/session.json (ignorado por git; caduca en poco tiempo). No he cambiado nada en tu cuenta ni en el robot.`);
}

main().catch((error) => { console.error('Error:', error.message); process.exit(1); });
