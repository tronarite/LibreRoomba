// Dibuja un PNG con la cobertura acumulada de las misiones descargadas (research/cloud/out/umf/), alineadas por la pose y la ORIENTACIÓN de la base
// con app/core/mapmerge.js (la misma fusión que usa el panel). Uso: node research/cloud/render-map.js [--borders]
// Salida: research/cloud/out/home-map-aligned.png (ignorado por git). Sin dependencias: PNG con zlib de Node. No hace peticiones de red.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { mergeMissions } = require('../../app/core/mapmerge');

const DIR = path.join(__dirname, 'out');
const SCALE = 5;          // píxeles por celda
const MARGIN = 20;

const history = JSON.parse(fs.readFileSync(path.join(DIR, 'missionhistory.json'), 'utf8'));
const umfs = [];
for (const mission of history) {
  const file = path.join(DIR, 'umf', `${mission.startTime}.json`);
  if (fs.existsSync(file)) umfs.push(JSON.parse(fs.readFileSync(file, 'utf8')));
}
const merged = mergeMissions(umfs);
if (!merged) { console.error('Sin cobertura. ¿Ejecutaste query.js missionhistory y fetch-maps.js?'); process.exit(1); }

const { width, height, resolution, origin, peak } = merged;
const counts = Buffer.from(merged.grid, 'base64');
const W = width * SCALE + MARGIN * 2, H = height * SCALE + MARGIN * 2;
const rgb = Buffer.alloc(W * H * 3, 16);                                                // fondo oscuro como el panel
const put = (px, py, r, g, b) => { if (px < 0 || py < 0 || px >= W || py >= H) return; const i = (py * W + px) * 3; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; };
const toPx = (x, y) => [MARGIN + Math.round(((x - origin.x) / resolution) * SCALE), MARGIN + height * SCALE - Math.round(((y - origin.y) / resolution) * SCALE)];

for (let cy = 0; cy < height; cy++) for (let cx = 0; cx < width; cx++) {
  const n = counts[cy * width + cx];
  if (!n) continue;
  const t = Math.sqrt(n / peak);                                                          // misma rampa que el panel: más misiones = más claro
  const r = Math.round(70 + 116 * t), g = Math.round(120 + 110 * t), b = Math.round(190 + 63 * t);
  for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) put(MARGIN + cx * SCALE + dx, MARGIN + (height - 1 - cy) * SCALE + dy, r, g, b);
}
const line = (a, b, color) => {                                                           // segmento simple
  const [x0, y0] = a, [x1, y1] = b, steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) put(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), ...color);
};
if (process.argv.includes('--borders')) for (const ring of merged.borders) ring.forEach((p, i) => line(toPx(...p), toPx(...ring[(i + 1) % ring.length]), [253, 230, 138]));
const disc = (cx, cy, r, color) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r) put(cx + a, cy + b, ...color); };
for (const s of merged.stalls) { const [x, y] = toPx(s.x, s.y); disc(x, y, Math.round(Math.min(10, 3 + Math.sqrt(s.n) / 2)), [251, 146, 60]); }   // más grande = más eventos
{ const [x, y] = toPx(merged.dock.x, merged.dock.y); disc(x, y, 8, [220, 38, 38]); disc(x, y, 5, [255, 255, 255]); }

// Codificador PNG mínimo
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const outFile = path.join(DIR, 'home-map-aligned.png');
fs.writeFileSync(outFile, png);
console.log(`misiones: ${merged.missions} (omitidas sin base: ${merged.skipped}) | alineadas por base: ${merged.alignedBy.dock} | área cubierta: ${merged.areaM2} m² | celdas: ${merged.coveredCells} | pico: ${peak} | atascos: ${merged.stalls.length} | contorno: ${merged.borders.length} anillo(s) | ${W}x${H}px`);
