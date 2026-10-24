// Descarga (solo lectura) el mapa UMF de cada misión del historial a research/cloud/out/umf/ (ignorado por git).
// Requiere research/cloud/out/missionhistory.json (node research/cloud/query.js missionhistory). Uso: node research/cloud/fetch-maps.js
const fs = require('fs');
const path = require('path');
const { signedHeaders, SAFE } = require('./query');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const session = JSON.parse(fs.readFileSync(path.join(__dirname, 'session.json'), 'utf8'));
  if (session.credentials.Expiration && Date.parse(session.credentials.Expiration) < Date.now()) throw new Error('La sesión caducó: vuelve a ejecutar login.js.');
  const history = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'missionhistory.json'), 'utf8'));
  const blid = Object.keys(session.robots)[0];
  const dir = path.join(__dirname, 'out', 'umf');
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0, skipped = 0, failed = 0;
  for (const mission of history) {
    const entry = Array.isArray(mission.pmaps_robot) && mission.pmaps_robot[0] ? Object.entries(mission.pmaps_robot[0])[0] : null;
    if (!entry || !SAFE.test(entry[0]) || !SAFE.test(entry[1])) { skipped++; continue; }
    const file = path.join(dir, `${mission.startTime}.json`);
    if (fs.existsSync(file)) { ok++; continue; }
    const url = `${session.deployment.httpBaseAuth}/v1/${blid}/pmaps/${entry[0]}/versions/${entry[1]}/umf`;
    const response = await fetch(url, { headers: signedHeaders('GET', url, session.credentials) });
    if (response.status === 200) { fs.writeFileSync(file, await response.text()); ok++; } else { failed++; console.log(`misión ${mission.startTime}: HTTP ${response.status}`); }
    await wait(400);
  }
  console.log(`mapas descargados/ya presentes: ${ok} | sin mapa: ${skipped} | fallos: ${failed}`);
}

main().catch((error) => { console.error('Error:', error.message); process.exit(1); });
