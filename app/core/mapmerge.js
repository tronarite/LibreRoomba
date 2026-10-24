// Fusión de mapas UMF de varias misiones en un único mapa de cobertura, alineando cada misión por la pose de la BASE (posición y orientación).
// Cada misión usa su propio sistema de coordenadas anclado a donde arrancó el robot, con una orientación de arranque algo distinta cada vez
// (en datos reales varía ~0,1 rad): solo trasladar desenfoca varios metros; hay que rotar por la orientación de la base.
const DEFAULT_RESOLUTION = 0.1049;   // m por celda (map_header.resolution de la i1+)

const OFFSET = 1 << 15;
const cellKey = (k, l) => (k + OFFSET) * 65536 + (l + OFFSET);

function layer(map, type) { return (map.layers || []).find((l) => l.layer_type === type); }

function findPose(map, kind) {
  const ids = (((map.typed_poses || {})[kind] || {}).geometry || {}).ids || [];
  return (map.poses2d || []).find((p) => p.id === ids[0]) || null;
}

// Pose usada como ancla: la base si existe; si no, la pose de arranque; si no, identidad (sin alinear)
function anchor(map) {
  const dock = findPose(map, 'dock_poses');
  if (dock) return { x: dock.coordinates[0], y: dock.coordinates[1], theta: dock.ori_rad || 0, by: 'dock' };
  const start = findPose(map, 'start_pose');
  if (start) return { x: start.coordinates[0], y: start.coordinates[1], theta: start.ori_rad || 0, by: 'start' };
  return { x: 0, y: 0, theta: 0, by: 'none' };
}

function toCommon(x, y, a) {
  const dx = x - a.x, dy = y - a.y, c = Math.cos(-a.theta), s = Math.sin(-a.theta);
  return [dx * c - dy * s, dx * s + dy * c];
}

// Extrae de un UMF (el objeto completo con `maps`) lo necesario, ya en el sistema común de la base
function extract(umf) {
  const map = (umf && umf.maps && umf.maps[0]) || null;
  if (!map) return null;
  const a = anchor(map);
  const cov = layer(map, 'coverage');
  const resolution = Number((map.map_header || {}).resolution) || DEFAULT_RESOLUTION;
  const raw = (cov && cov.geometry && cov.geometry.coordinates) || [];
  const points = raw.map((p) => toCommon(p[0], p[1], a));
  // celdas de la misión en su propia rejilla (centros en (k+0.5)*res): sirven para remuestrear sin huecos
  const cells = new Set(raw.map((p) => cellKey(Math.floor(p[0] / resolution), Math.floor(p[1] / resolution))));
  const esc = layer(map, 'escape_events');
  const stalls = (((esc && esc.geometry && esc.geometry.list) || [])).filter((e) => e && Array.isArray(e.pose))
    .map((e) => { const [x, y] = toCommon(e.pose[0], e.pose[1], a); return { x, y, event: String(e.event || 'evento') }; });
  const byId = new Map((map.points2d || []).map((p) => [p.id, p.coordinates]));
  const border = (map.borders || [])[0];
  const rings = (((border || {}).geometry || {}).ids || []).map((ring) => ring.map((id) => byId.get(id)).filter(Boolean).map((p) => toCommon(p[0], p[1], a)));
  return { points, cells, anchor: a, stalls, rings, area: Number((map.map_header || {}).area) || 0, by: a.by, resolution };
}

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

// umfs: lista de UMF. opciones: resolution (m), bordersFrom: 'largest' | 'none'
// requireDock (por defecto sí): solo entran misiones con pose de base en su mapa; sin ella no hay ancla fiable y la misión desenfocaría el conjunto
// stallMin/stallMax: solo se devuelven las zonas con al menos stallMin eventos y, como mucho, las stallMax más frecuentes (en datos reales hay miles de eventos)
function mergeMissions(umfs, { resolution = DEFAULT_RESOLUTION, bordersFrom = 'largest', requireDock = true, stallMin = 3, stallMax = 150 } = {}) {
  const all = umfs.map(extract).filter((m) => m && m.points.length);
  const missions = requireDock ? all.filter((m) => m.by === 'dock') : all;
  const skipped = all.length - missions.length;
  if (!missions.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of missions) for (const [x, y] of m.points) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  minX = Math.min(minX, 0) - resolution; minY = Math.min(minY, 0) - resolution; maxX = Math.max(maxX, 0) + resolution; maxY = Math.max(maxY, 0) + resolution;
  const width = Math.ceil((maxX - minX) / resolution), height = Math.ceil((maxY - minY) / resolution);
  const counts = new Uint16Array(width * height);
  // Para cada misión se recorren las celdas del mapa común, se llevan al sistema de la misión (rotación inversa + base) y se mira si la misión
  // cubrió esa celda. Empujar puntos sueltos dejaba huecos al rotar (un punto por celda de origen no cubre la rejilla girada).
  for (const m of missions) {
    let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
    for (const [x, y] of m.points) { if (x < lx) lx = x; if (x > hx) hx = x; if (y < ly) ly = y; if (y > hy) hy = y; }
    const x0 = Math.max(0, Math.floor((lx - minX) / resolution) - 1), x1 = Math.min(width - 1, Math.ceil((hx - minX) / resolution) + 1);
    const y0 = Math.max(0, Math.floor((ly - minY) / resolution) - 1), y1 = Math.min(height - 1, Math.ceil((hy - minY) / resolution) + 1);
    const c = Math.cos(m.anchor.theta), s = Math.sin(m.anchor.theta);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const x = minX + (cx + 0.5) * resolution, y = minY + (cy + 0.5) * resolution;
      const mx = x * c - y * s + m.anchor.x, my = x * s + y * c + m.anchor.y;     // de la base común al sistema de la misión
      if (m.cells.has(cellKey(Math.floor(mx / m.resolution), Math.floor(my / m.resolution)))) counts[cy * width + cx]++;
    }
  }
  let peak = 0, covered = 0;
  for (const n of counts) { if (n > peak) peak = n; if (n) covered++; }
  const bytes = Buffer.alloc(counts.length);
  for (let i = 0; i < counts.length; i++) bytes[i] = Math.min(255, counts[i]);

  // Atascos: totales por tipo y zonas de 0,5 m (agrupadas por tipo) con suficientes eventos
  const stallTotals = {};
  const stallCells = new Map();
  for (const m of missions) for (const st of m.stalls) {
    stallTotals[st.event] = (stallTotals[st.event] || 0) + 1;
    const key = `${Math.round(st.x / 0.5)}|${Math.round(st.y / 0.5)}|${st.event}`;
    const e = stallCells.get(key);
    if (e) { e.n++; e.sx += st.x; e.sy += st.y; } else stallCells.set(key, { event: st.event, n: 1, sx: st.x, sy: st.y });
  }
  const stalls = [...stallCells.values()].filter((e) => e.n >= stallMin).sort((p, q) => q.n - p.n).slice(0, stallMax)
    .map((e) => ({ x: round(e.sx / e.n), y: round(e.sy / e.n), event: e.event, n: e.n }));   // posición media de los eventos de la zona
  const largest = missions.reduce((best, m) => (m.area > best.area ? m : best), missions[0]);
  const borders = bordersFrom === 'none' ? [] : largest.rings.filter((r) => r.length > 2).map((r) => r.map(([x, y]) => [round(x), round(y)]));
  const alignedBy = { dock: 0, start: 0, none: 0 };
  for (const m of missions) alignedBy[m.by]++;

  return {
    resolution, skipped, origin: { x: round(minX), y: round(minY) }, width, height, missions: missions.length, peak, coveredCells: covered,
    areaM2: round(covered * resolution * resolution, 1), alignedBy, dock: { x: 0, y: 0 },
    grid: bytes.toString('base64'),                           // Uint8 por celda (filas de abajo arriba), número de misiones que pasaron
    stalls, stallTotals, borders
  };
}

module.exports = { mergeMissions, extract, anchor, toCommon, DEFAULT_RESOLUTION };
