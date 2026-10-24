// Dibuja un PNG con la cobertura acumulada de todas las misiones descargadas (research/cloud/out/umf/), alineadas por la base.
// Uso: node research/cloud/render-map.js [--all]   (por defecto solo misiones que arrancan en la base: comparten origen)
// Salida: research/cloud/out/home-map.png (ignorado por git). Sin dependencias: PNG con zlib de Node.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, 'out');
const SCALE = 5;          // píxeles por celda de cobertura
const MARGIN = 20;
const onlyDocked = !process.argv.includes('--all');

const history = JSON.parse(fs.readFileSync(path.join(DIR, 'missionhistory.json'), 'utf8'));
const points = [];       // [x, y] en metros, sistema de la base
const docks = [];
let used = 0;
for (const mission of history) {
  if (onlyDocked && mission.dockedAtStart !== true) continue;
  const file = path.join(DIR, 'umf', `${mission.startTime}.json`);
  if (!fs.existsSync(file)) continue;
  const map = JSON.parse(fs.readFileSync(file, 'utf8')).maps[0];
  const cov = map.layers.find((l) => l.layer_type === 'coverage');
  const dockPose = (map.poses2d || []).find((p) => p.id === (((map.typed_poses || {}).dock_poses || {}).geometry || {}).ids?.[0]);
  const ox = dockPose ? dockPose.coordinates[0] : 0, oy = dockPose ? dockPose.coordinates[1] : 0;   // alinear por la base
  for (const p of (cov && cov.geometry.coordinates) || []) points.push([p[0] - ox, p[1] - oy]);
  docks.push([0, 0]);
  used++;
}
if (!points.length) { console.error('Sin puntos de cobertura. ¿Ejecutaste fetch-maps.js?'); process.exit(1); }

const cell = 0.1049;
let lx = 0, hx = 0, ly = 0, hy = 0;   // (Math.min(...array) revienta la pila con muchos puntos)
for (const [x, y] of points) { if (x < lx) lx = x; if (x > hx) hx = x; if (y < ly) ly = y; if (y > hy) hy = y; }
const minX = lx - cell, maxX = hx + cell, minY = ly - cell, maxY = hy + cell;
const W = Math.ceil((maxX - minX) / cell) * SCALE + MARGIN * 2, H = Math.ceil((maxY - minY) / cell) * SCALE + MARGIN * 2;
const counts = new Map();
for (const [x, y] of points) {
  const cx = Math.floor((x - minX) / cell), cy = Math.floor((maxY - y) / cell);   // y hacia arriba
  const key = cy * 100000 + cx;
  counts.set(key, (counts.get(key) || 0) + 1);
}
let peak = 1;
for (const n of counts.values()) if (n > peak) peak = n;

const rgb = Buffer.alloc(W * H * 3, 250);
const put = (px, py, r, g, b) => { if (px < 0 || py < 0 || px >= W || py >= H) return; const i = (py * W + px) * 3; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; };
for (const [key, n] of counts) {
  const cy = Math.floor(key / 100000), cx = key % 100000;
  const t = Math.sqrt(n / peak);                                   // más pasadas = más oscuro
  const r = Math.round(200 - 170 * t), g = Math.round(225 - 120 * t), b = Math.round(255 - 40 * t);
  for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) put(MARGIN + cx * SCALE + dx, MARGIN + cy * SCALE + dy, r, g, b);
}
const dx0 = MARGIN + Math.floor((0 - minX) / cell) * SCALE, dy0 = MARGIN + Math.floor((maxY - 0) / cell) * SCALE;   // base
for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) if (a * a + b * b <= 36) put(dx0 + a, dy0 + b, 220, 40, 40);

// Codificador PNG mínimo
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const outFile = path.join(DIR, 'home-map.png');
fs.writeFileSync(outFile, png);
console.log(`misiones usadas: ${used} | puntos: ${points.length} | celdas distintas: ${counts.size} | extensión: ${(maxX - minX).toFixed(1)} x ${(maxY - minY).toFixed(1)} m | ${W}x${H}px -> ${outFile}`);
