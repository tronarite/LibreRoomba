// Piezas de consumo del robot: ids de la nube -> nombre de la app (identificados por el usuario comparando con "Salud del robot", 2026-10-24).
const NAMES = { 35: 'Filtro de alta eficiencia', 36: 'Cepillo de esquinas y bordes', 37: 'Doble cepillo multisuperficie' };
const SOON_HOURS = 10;   // aviso "cambiar pronto"

// Respuesta de GET /v1/robots/<blid>/parts -> filas para el panel. Las piezas sin nombre conocido (p. ej. la 139, que la app no muestra) van aparte.
function normalizeParts(raw) {
  const parts = Array.isArray(raw && raw.parts) ? raw.parts : [];
  const rows = parts.map((p) => {
    const remainingMin = Number.isFinite(p.minutes_remaining) ? p.minutes_remaining : (Number.isFinite(p.count_remaining) ? p.count_remaining : null);
    const usedMin = Number.isFinite(p.count_used) ? p.count_used : null;
    const id = String(p.part_id);
    const hours = (m) => (m === null ? null : Math.round((m / 60) * 10) / 10);
    const remainingHours = hours(remainingMin);
    const status = remainingMin === null ? 'desconocido' : remainingMin <= 0 ? 'agotada' : remainingHours <= SOON_HOURS ? 'pronto' : 'bien';
    return { id, name: NAMES[id] || null, remainingHours, usedHours: hours(usedMin), status };
  });
  return { known: rows.filter((r) => r.name), other: rows.filter((r) => !r.name) };
}

module.exports = { normalizeParts, NAMES, SOON_HOURS };
