const fs = require('fs');
const path = require('path');

// Habitaciones propias de LibreRoomba: rectángulos con nombre en el sistema del mapa fusionado (metros, base en 0,0, x hacia la derecha).
// El robot no las conoce (la i1+ no tiene pmaps): solo sirven para etiquetar el mapa y medir.
const MAX = 30;
const MAX_NAME = 30;
const LIMIT_M = 100;
const round = (v) => Math.round(v * 100) / 100;

function normalize(room) {
  if (!room || typeof room !== 'object') return null;
  const name = typeof room.name === 'string' ? room.name.trim() : '';
  if (!name || name.length > MAX_NAME || /[\x00-\x1f]/.test(name)) return null;
  const v = [room.x0, room.y0, room.x1, room.y1];
  if (!v.every((n) => Number.isFinite(n) && Math.abs(n) <= LIMIT_M)) return null;
  const x0 = Math.min(v[0], v[2]), x1 = Math.max(v[0], v[2]), y0 = Math.min(v[1], v[3]), y1 = Math.max(v[1], v[3]);
  if (x1 - x0 < 0.2 || y1 - y0 < 0.2) return null;
  return { name, x0: round(x0), y0: round(y0), x1: round(x1), y1: round(y1) };
}

function createRooms(filePath) {
  let rooms = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) rooms = parsed.map(normalize).filter(Boolean).slice(0, MAX);
  } catch (_) { rooms = []; }

  function save() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(rooms));
      fs.renameSync(tmp, filePath);
    } catch (_) { /* sin disco no persisten, pero siguen en memoria */ }
  }

  // Sustituye la lista entera; lanza si alguna es inválida
  function set(list) {
    if (!Array.isArray(list) || list.length > MAX) throw Object.assign(new Error(`Como mucho ${MAX} habitaciones`), { code: 'bad_request' });
    const next = list.map(normalize);
    const bad = next.findIndex((r) => !r);
    if (bad >= 0) throw Object.assign(new Error(`Habitación ${bad + 1} no válida (nombre de 1-${MAX_NAME} caracteres y al menos 0,2 m por lado)`), { code: 'bad_request' });
    rooms = next; save();
    return rooms;
  }

  return { list: () => rooms.map((r) => ({ ...r })), set };
}

// Cobertura de cada habitación sobre el mapa fusionado ({origin,width,height,resolution,grid base64}): área del rectángulo y área recorrida
function measure(rooms, map) {
  const cells = map && map.grid ? Buffer.from(map.grid, 'base64') : null;
  return rooms.map((r) => {
    const areaM2 = round((r.x1 - r.x0) * (r.y1 - r.y0));
    if (!cells) return { ...r, areaM2, coveredM2: null, coveragePct: null };
    let covered = 0, total = 0;
    for (let cy = 0; cy < map.height; cy++) for (let cx = 0; cx < map.width; cx++) {
      const x = map.origin.x + (cx + 0.5) * map.resolution, y = map.origin.y + (cy + 0.5) * map.resolution;
      if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
      total++; if (cells[cy * map.width + cx]) covered++;
    }
    const coveredM2 = round(covered * map.resolution * map.resolution);
    return { ...r, areaM2, coveredM2, coveragePct: total ? Math.round((covered / total) * 100) : 0 };
  });
}

module.exports = { createRooms, measure, normalize };
