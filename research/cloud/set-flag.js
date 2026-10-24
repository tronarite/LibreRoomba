// ESCRIBE UN SOLO CAMPO de los datos de tu cuenta de iRobot (Gigya): PMAP_CL_FSW (aprendizaje de mapas). Aprobado por el usuario el 2026-10-24.
// Uso: node research/cloud/set-flag.js set       -> guarda el estado previo, escribe la hora actual (texto) y comprueba
//      node research/cloud/set-flag.js restore   -> devuelve el campo a como estaba (lo borra si no existía)
//      node research/cloud/set-flag.js status    -> solo lee
// Solo acepta ese campo; no toca ningún otro dato de la cuenta ni el robot.
const fs = require('fs');
const path = require('path');
const { call, SESSION } = require('./account');

const KEY = 'PMAP_CL_FSW';
const BACKUP = path.join(__dirname, 'out', 'pmap-fsw-backup.json');

async function read(g) {
  const info = await call(g, 'accounts.getAccountInfo', { include: 'data' });
  if (info.errorCode) throw new Error(`getAccountInfo: código ${info.errorCode} (${info.errorMessage || ''})`);
  return Object.hasOwn(info.data || {}, KEY) ? { present: true, value: info.data[KEY] } : { present: false };
}

async function write(g, value) {
  const result = await call(g, 'accounts.setAccountInfo', { data: JSON.stringify({ [KEY]: value }) });
  if (result.errorCode) throw new Error(`setAccountInfo: código ${result.errorCode} (${result.errorMessage || ''} ${result.errorDetails || ''})`);
}

async function main() {
  const action = process.argv[2];
  if (!['set', 'restore', 'status'].includes(action)) throw new Error('Uso: node research/cloud/set-flag.js <set|restore|status>');
  const g = JSON.parse(fs.readFileSync(SESSION, 'utf8')).gigya;
  if (!g) throw new Error('Sin sesión de Gigya: ejecuta login.js.');
  const before = await read(g);
  console.log(`${KEY} ahora:`, before.present ? JSON.stringify(before.value) : '(no existe)');
  if (action === 'status') return;
  if (action === 'set') {
    fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
    if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify({ savedAt: new Date().toISOString(), before }, null, 1));   // solo la primera vez: es el estado original
    await write(g, String(Math.floor(Date.now() / 1000)));
  } else {
    const original = JSON.parse(fs.readFileSync(BACKUP, 'utf8')).before;
    await write(g, original.present ? original.value : null);
  }
  const after = await read(g);
  console.log(`${KEY} después:`, after.present ? JSON.stringify(after.value) : '(no existe)');
}

main().catch((error) => { console.error('Error:', error.message); process.exit(1); });
