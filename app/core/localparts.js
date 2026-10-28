// Salud de piezas SIN nube: la nube de iRobot lleva los contadores de las piezas, pero el robot ya cuenta sus horas de funcionamiento (bbrun.hr).
// Guardamos, por pieza, las horas de funcionamiento del robot en el momento de instalarla y su vida útil; lo usado es la diferencia.
const fs = require('fs');
const path = require('path');
const { NAMES, SOON_HOURS } = require('./parts');

// Vidas útiles orientativas en horas de funcionamiento (editables: iRobot recomienda cambiarlas por tiempo de uso, no por horas exactas)
const DEFAULT_LIFE_HOURS = { 35: 60, 36: 200, 37: 300 };

function createLocalParts(filePath) {
  let data = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch (_) { data = {}; }

  function save() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, filePath);
    } catch (_) { /* sin disco: solo en memoria */ }
  }

  const known = (id) => Object.hasOwn(NAMES, id);
  const bad = (message) => Object.assign(new Error(message), { code: 'bad_request' });

  // runHours: horas de funcionamiento actuales del robot (bbrun.hr) o null si no se conocen
  function list(runHours) {
    const hours = Number.isFinite(runHours) ? runHours : null;
    return Object.keys(NAMES).map((id) => {
      const entry = data[id] || {};
      const lifeHours = Number.isFinite(entry.lifeHours) ? entry.lifeHours : DEFAULT_LIFE_HOURS[id];
      const hasBase = Number.isFinite(entry.baselineHours) && hours !== null;
      const usedHours = hasBase ? Math.max(0, Math.round((hours - entry.baselineHours) * 10) / 10) : null;
      const remainingHours = usedHours === null ? null : Math.max(0, Math.round((lifeHours - usedHours) * 10) / 10);
      const status = usedHours === null ? 'sin configurar' : remainingHours <= 0 ? 'agotada' : remainingHours <= SOON_HOURS ? 'pronto' : 'bien';
      return { id, name: NAMES[id], lifeHours, usedHours, remainingHours, status, replacedAt: entry.replacedAt || null };
    });
  }

  // change: { action: 'replace' } | { usedHours: n } | { lifeHours: n }; runHours imprescindible salvo para lifeHours
  function update(id, change, runHours, now = new Date()) {
    id = String(id);
    if (!known(id)) throw bad('Pieza desconocida');
    if (!change || typeof change !== 'object') throw bad('Cambio no válido');
    const entry = data[id] = data[id] || {};
    if (change.lifeHours !== undefined) {
      if (!Number.isFinite(change.lifeHours) || change.lifeHours < 1 || change.lifeHours > 5000) throw bad('Vida útil no válida (1-5000 h)');
      entry.lifeHours = change.lifeHours;
    }
    if (change.action === 'replace' || change.usedHours !== undefined) {
      if (!Number.isFinite(runHours)) throw bad('El robot no ha informado de sus horas de funcionamiento');
      const used = change.action === 'replace' ? 0 : change.usedHours;
      if (!Number.isFinite(used) || used < 0 || used > 5000) throw bad('Horas usadas no válidas');
      entry.baselineHours = Math.max(0, runHours - used);
      entry.replacedAt = now.toISOString();
    }
    save();
    return list(runHours);
  }

  return { list, update };
}

module.exports = { createLocalParts, DEFAULT_LIFE_HOURS };
