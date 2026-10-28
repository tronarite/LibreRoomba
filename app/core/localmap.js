// Mapa de cobertura propio, SIN nube: acumula las posiciones del robot (petición RRTP `req`) durante cada misión.
// Devuelve el mismo formato que mapmerge.mergeMissions para que el panel pinte uno u otro igual.
// Supuesto sin confirmar con el robot real: las posiciones llegan en un sistema de coordenadas fijo anclado a la base (como los UMF alineados).
const fs = require('fs');
const path = require('path');

const DEFAULT_RESOLUTION = 0.1049;   // m por celda, igual que el mapa de la nube
const MAX_JUMP_M = 3;                // entre dos lecturas consecutivas: más que esto se trata como salto (no se une con trazo)
const BRUSH_RADIUS_M = 0.15;         // la anchura de limpieza del robot ronda 30 cm

const key = (cx, cy) => `${cx}|${cy}`;

function createLocalMap(filePath, { resolution = DEFAULT_RESOLUTION } = {}) {
  let counts = new Map();   // celda -> nº de misiones que pasaron
  let missions = 0;
  try {
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (saved && saved.resolution === resolution && Array.isArray(saved.cells)) {
      counts = new Map(saved.cells.filter((c) => Array.isArray(c) && c.length === 3 && c.every(Number.isInteger)).map(([x, y, n]) => [key(x, y), { x, y, n }]));
      missions = Number.isInteger(saved.missions) ? saved.missions : 0;
    }
  } catch (_) { /* sin mapa previo */ }

  let current = null;       // Set de celdas de la misión en curso
  let last = null;          // última posición de la misión en curso

  function save() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ resolution, missions, cells: [...counts.values()].map((c) => [c.x, c.y, c.n]) }));
      fs.renameSync(tmp, filePath);
    } catch (_) { /* sin disco: solo en memoria */ }
  }

  function stamp(x, y) {
    const r = Math.ceil(BRUSH_RADIUS_M / resolution);
    const cx = Math.floor(x / resolution), cy = Math.floor(y / resolution);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) current.add(key(cx + dx, cy + dy));
    }
  }

  // Añade una posición (metros) a la misión en curso; une con la anterior si no hubo salto
  function add(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 500 || Math.abs(y) > 500) return false;
    if (!current) current = new Set();
    if (last && Math.hypot(x - last.x, y - last.y) <= MAX_JUMP_M) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x - last.x, y - last.y) / (resolution / 2)));
      for (let i = 1; i <= steps; i++) stamp(last.x + ((x - last.x) * i) / steps, last.y + ((y - last.y) * i) / steps);
    } else stamp(x, y);
    last = { x, y };
    return true;
  }

  // Cierra la misión en curso: cada celda recorrida suma una misión
  function endMission() {
    if (!current || !current.size) { current = null; last = null; return false; }
    for (const k of current) {
      const e = counts.get(k);
      if (e) e.n++;
      else { const [x, y] = k.split('|').map(Number); counts.set(k, { x, y, n: 1 }); }
    }
    missions++;
    current = null; last = null;
    save();
    return true;
  }

  function snapshot() {
    if (!counts.size) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, peak = 0;
    for (const c of counts.values()) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y; if (c.n > peak) peak = c.n; }
    minX = Math.min(minX, 0) - 1; minY = Math.min(minY, 0) - 1; maxX = Math.max(maxX, 0) + 1; maxY = Math.max(maxY, 0) + 1;
    const width = maxX - minX + 1, height = maxY - minY + 1;
    const bytes = Buffer.alloc(width * height);
    for (const c of counts.values()) bytes[(c.y - minY) * width + (c.x - minX)] = Math.min(255, c.n);
    return {
      resolution, skipped: 0, origin: { x: Math.round(minX * resolution * 1000) / 1000, y: Math.round(minY * resolution * 1000) / 1000 },
      width, height, missions, peak, coveredCells: counts.size, areaM2: Math.round(counts.size * resolution * resolution * 10) / 10,
      alignedBy: { dock: missions, start: 0, none: 0 }, dock: { x: 0, y: 0 }, grid: bytes.toString('base64'),
      stalls: [], stallTotals: {}, borders: [], source: 'local'
    };
  }

  function reset() { counts = new Map(); missions = 0; current = null; last = null; save(); }

  return { add, endMission, snapshot, reset, get missions() { return missions; } };
}

module.exports = { createLocalMap, DEFAULT_RESOLUTION };
