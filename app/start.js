// Arranque con los datos del robot: npm run robot   (o: node start.js [--mock])
// Lee ROBOT_IP y ROBOT_BLID del entorno o, si faltan, de LOCAL-NOTES.md (líneas CLAVE=valor; archivo ignorado por git).
// Nunca imprime los valores: solo de dónde salió cada uno.
const fs = require('fs');
const path = require('path');

// LIBREROOMBA_NOTES permite apuntar a otro archivo (las pruebas lo usan para no tocar nunca los datos reales).
const NOTES = process.env.LIBREROOMBA_NOTES || path.resolve(__dirname, '..', 'LOCAL-NOTES.md');
const KEYS = ['ROBOT_IP', 'ROBOT_BLID'];

// Texto -> { CLAVE: valor } solo para las claves permitidas. Acepta comillas y comentarios (#) al final.
function parseNotes(text) {
  const found = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !KEYS.includes(match[1])) continue;
    let value = match[2].replace(/\s+#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2');
    if (value && !(match[1] in found)) found[match[1]] = value;
  }
  return found;
}

// Devuelve { env, sources, missing }: env con los valores resueltos (entorno > LOCAL-NOTES.md), sources dice de dónde salió cada clave.
function resolveConfig(env = process.env, notesPath = NOTES) {
  let notes = {};
  try { notes = parseNotes(fs.readFileSync(notesPath, 'utf8')); } catch (_) { /* sin LOCAL-NOTES.md */ }
  const resolved = {};
  const sources = {};
  const missing = [];
  for (const key of KEYS) {
    if (env[key]) { resolved[key] = env[key]; sources[key] = 'entorno'; }
    else if (notes[key]) { resolved[key] = notes[key]; sources[key] = 'LOCAL-NOTES.md'; }
    else missing.push(key);
  }
  return { env: resolved, sources, missing };
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--mock')) { require('./server.js'); return; }
  const { env, sources, missing } = resolveConfig();
  if (missing.length) {
    console.error(`Faltan datos del robot: ${missing.join(', ')}.`);
    console.error('Defínelos como variables de entorno o como líneas CLAVE=valor en LOCAL-NOTES.md (en la raíz del repo; no se sube a git).');
    console.error('Para probar sin robot: npm run mock');
    process.exit(1);
  }
  const hasPassword = process.env.ROBOT_PASSWORD || fs.existsSync(path.resolve(__dirname, '..', 'research', 'robot-password.txt'));
  if (!hasPassword) {
    console.error('Falta la contraseña local del robot: ROBOT_PASSWORD o research/robot-password.txt.');
    console.error('Con el robot en la base, mantén HOME 2-3 s hasta que parpadee el icono Wi-Fi y ejecuta: node research/get-password.js <ip>');
    process.exit(1);
  }
  Object.assign(process.env, env);
  console.log(`Datos del robot: ROBOT_IP (${sources.ROBOT_IP}), ROBOT_BLID (${sources.ROBOT_BLID}).`);
  console.log('Recuerda: solo cabe 1 conexión local; la app oficial usará la nube mientras LibreRoomba esté conectado.');
  require('./server.js');
}

module.exports = { parseNotes, resolveConfig };
if (require.main === module) main();
