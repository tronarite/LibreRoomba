// Genera app/core/error-table.json a partir del APK ya decompilado (jadx-out + jadx-res). Uso: node research/tools/extract-errors.js
// Fuentes: RobotErrorCode.java (código numérico -> nombre), RobotStatusResolver.java (código -> recurso history_error_*) y strings.xml (en y es).
// Para cada código guarda los textos de la app (título, mensaje, aviso push) y qué recursos se encontraron (evidencia). No inventa texto.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'jadx-out/sources/com/irobot/home/model');
const RES = path.join(ROOT, 'jadx-res/resources/res');
const OUT = path.resolve(ROOT, '../app/core/error-table.json');

function readStrings(dirs) {   // dirs de menor a mayor prioridad
  const out = {};
  for (const dir of dirs) {
    const file = path.join(RES, dir, 'strings.xml');
    if (!fs.existsSync(file)) continue;
    const xml = fs.readFileSync(file, 'utf8');
    for (const m of xml.matchAll(/<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)) out[m[1]] = clean(m[2]);
  }
  return out;
}
function clean(s) {
  return s.replace(/<xliff:g[^>]*>([\s\S]*?)<\/xliff:g>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&')
    .replace(/%1\$s|%s/g, '{robot}').replace(/%2\$s/g, '{code}').replace(/\s+/g, ' ').trim();
}

const en = readStrings(['values']);
const es = readStrings(['values', 'values-es', 'values-es-rES']);   // es-ES manda sobre es; lo que falte cae a inglés
const enumSrc = fs.readFileSync(path.join(SRC, 'RobotErrorCode.java'), 'utf8');
const resolverSrc = fs.readFileSync(path.join(SRC, 'RobotStatusResolver.java'), 'utf8');

const codeOf = {};   // NOMBRE -> número
for (const m of enumSrc.matchAll(/^\s*([A-Z0-9_]+)\((\d+)\)/gm)) codeOf[m[1]] = Number(m[2]);

const table = {};
for (const m of resolverSrc.matchAll(/map\.put\(RobotErrorCode\.([A-Z0-9_]+),\s*new RobotError\("[^"]*",\s*R\.string\.([a-z0-9_]+)\)\)/g)) {
  const code = codeOf[m[1]];
  if (code === undefined || code === 0) continue;
  const historyKey = m[2];
  const suffix = historyKey.replace(/^history_error_/, '');
  const keys = { history: historyKey, notification: `notification_error_${suffix}`, push: `push_notification_error_${suffix}` };
  // El sufijo del recurso history_* puede llevar texto extra (2_extractor): se prueba primero ese y luego el número a secas
  const find = (prefix) => [`${prefix}${suffix}`, `${prefix}${code}`].find((k) => en[k] !== undefined);
  keys.notification = find('notification_error_') || keys.notification;
  keys.push = find('push_notification_error_') || keys.push;
  const pick = (dict, key) => dict[key];
  const entry = { code, name: m[1], evidence: { resolver: historyKey } };
  for (const [lang, dict] of [['en', en], ['es', es]]) {
    const title = pick(dict, keys.history) ?? en[keys.history];
    const message = pick(dict, keys.notification) ?? en[keys.notification];
    const push = pick(dict, keys.push) ?? en[keys.push];
    entry[lang] = { title: title || null, message: message || null, push: push || null };
  }
  entry.evidence.notification = en[keys.notification] !== undefined ? keys.notification : null;
  entry.evidence.push = en[keys.push] !== undefined ? keys.push : null;
  table[code] = entry;
}

const unmappedEnum = Object.entries(codeOf).filter(([, c]) => c !== 0 && !table[c]).map(([n, c]) => `${c}:${n}`);
fs.writeFileSync(OUT, JSON.stringify({ generatedFrom: 'iRobot Home 7.18.0 (RobotErrorCode, RobotStatusResolver, strings.xml en/es-ES)', count: Object.keys(table).length, errors: table }, null, 1));
const noMsg = Object.values(table).filter((e) => !e.en.message).map((e) => e.code);
console.log(`códigos mapeados: ${Object.keys(table).length} | sin mensaje completo: ${noMsg.length} (${noMsg.join(',')}) | en el enum pero sin resolver: ${unmappedEnum.length} (${unmappedEnum.join(' ')})`);
