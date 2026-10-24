// Ejecuta una orden real y registra fases, claves nuevas y mensajes. Uso: node robot-run.js <evac|mission> [segundos]
// Volcado crudo en %TEMP%/robot-run-<modo>.jsonl (puede contener identificadores: no subir a git).
const mqtt = require('mqtt'), fs = require('fs'), os = require('os'), path = require('path'), { SSL_OP_LEGACY_SERVER_CONNECT: L } = require('constants');
const mode = process.argv[2], secs = Number(process.argv[3] || 60);
const b = process.env.ROBOT_BLID;
const c = mqtt.connect(`mqtts://${process.env.ROBOT_IP}:8883`, { clientId: b, username: b, password: fs.readFileSync(__dirname + '/robot-password.txt', 'utf8').trim(), protocolVersion: 4, rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: L, minVersion: 'TLSv1' });
const dump = fs.createWriteStream(path.join(os.tmpdir(), `robot-run-${mode}.jsonl`));
const st = {}; const topics = {}; let lastPhase;
const merge = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = t[k] || {}; merge(t[k], v); } else t[k] = v; } };
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(3) + 's';
c.on('message', (topic, m) => {
  topics[topic] = (topics[topic] || 0) + 1; dump.write(JSON.stringify({ t: Date.now() - t0, topic, msg: String(m) }) + '\n');
  try { const r = JSON.parse(m).state?.reported; if (r) { const before = new Set(Object.keys(st)); merge(st, r);
    for (const k of Object.keys(st)) if (!before.has(k) && before.size > 20) console.log(ts(), 'clave nueva:', k, JSON.stringify(st[k]).slice(0, 120));
    const cm = st.cleanMissionStatus; const ph = cm && `${cm.phase}/${cm.cycle}/err${cm.error}`; if (ph && ph !== lastPhase) { lastPhase = ph; console.log(ts(), 'fase', ph, 'bat', st.batPct); } } } catch {}
});
c.on('error', (e) => { console.log('error', e.message); process.exit(1); });
const cmd = (command) => { c.publish('cmd', JSON.stringify({ command, time: Math.floor(Date.now() / 1000), initiator: 'localApp' })); console.log(ts(), 'orden enviada:', command); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => c.on('connect', r)); c.subscribe('#');
  while (st.pmaps === undefined) await wait(500);
  console.log(ts(), 'inicio: fase', lastPhase, 'bat', st.batPct, 'bin', JSON.stringify(st.bin));
  if (mode === 'evac') { cmd('evac'); await wait(secs * 1000); }
  else if (mode === 'mission') { cmd('start'); await wait(secs * 1000); cmd('dock'); await wait(45000); }
  console.log(ts(), 'final: fase', lastPhase, 'bat', st.batPct, 'bin', JSON.stringify(st.bin), 'mssnM', st.mssnM);
  console.log('mensajes por topic:', JSON.stringify(topics));
  const cm = st.cleanMissionStatus; console.log('cleanMissionStatus:', JSON.stringify(cm)); console.log('pose:', JSON.stringify(st.pose), '| bbmssn:', JSON.stringify(st.bbmssn));
  c.end(); dump.end(); setTimeout(() => process.exit(0), 500);
})();
setTimeout(() => { console.log('timeout global'); process.exit(1); }, (secs + 120) * 1000);
