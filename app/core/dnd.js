// No molestar (Do Not Disturb), réplica de la app oficial. En la app es de la nube (acción de automatización `start_dnd`,
// motivo de fin de misión `dndEnd`), no un ajuste del robot: aquí lo aplica el servidor de LibreRoomba y solo mientras está en marcha.
// Una franja: { enabled, label, name?, days:[0-6] (0 = domingo, como cleanSchedule2), start:{hour,min}, end:{hour,min} }.
// Si end <= start la franja termina al día siguiente (22:00-07:00 pertenece al día en que empieza).
// Las horas son de reloj local del equipo que ejecuta el servidor (se comparan minutos de la semana, así el cambio de hora no desplaza franjas).
const fs = require('fs');
const path = require('path');

const MAX = 10;
const WEEK = 7 * 1440;
const LABELS = { quiet: 'Momento de tranquilidad', nap: 'Hora de la siesta', movie: 'Noche de películas', meeting: 'Reunión semanal', custom: 'Personalizada' };
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isPlain = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const pad = (n) => String(n).padStart(2, '0');

function validate(items) {
  if (!Array.isArray(items)) throw new Error('La lista de No molestar debe ser un array.');
  if (items.length > MAX) throw new Error(`No se pueden configurar más de ${MAX} franjas de No molestar.`);
  return items.map((item, i) => {
    const n = i + 1;
    if (!isPlain(item)) throw new Error(`La franja #${n} no es un objeto válido.`);
    if (typeof item.enabled !== 'boolean') throw new Error(`La franja #${n} debe tener "enabled" booleano.`);
    if (!Object.hasOwn(LABELS, item.label)) throw new Error(`La franja #${n} tiene una etiqueta no válida.`);
    if (!Array.isArray(item.days) || !item.days.length || !item.days.every((d) => isInt(d, 0, 6))) throw new Error(`La franja #${n} debe tener al menos un día (enteros de 0 a 6).`);
    for (const key of ['start', 'end']) {
      const t = item[key];
      if (!isPlain(t) || !isInt(t.hour, 0, 23) || !isInt(t.min, 0, 59)) throw new Error(`La franja #${n} tiene una hora de ${key === 'start' ? 'inicio' : 'fin'} no válida.`);
    }
    if (item.start.hour === item.end.hour && item.start.min === item.end.min) throw new Error(`La franja #${n} empieza y termina a la misma hora.`);
    const out = { enabled: item.enabled, label: item.label, days: [...new Set(item.days)].sort((a, b) => a - b), start: { hour: item.start.hour, min: item.start.min }, end: { hour: item.end.hour, min: item.end.min } };
    if (item.label === 'custom') {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (name.length > 30) throw new Error(`El nombre de la franja #${n} admite 30 caracteres como máximo.`);
      if (name) out.name = name;
    }
    return out;
  });
}

const displayName = (item) => (item.label === 'custom' && item.name) || LABELS[item.label] || 'No molestar';
const startMin = (item) => item.start.hour * 60 + item.start.min;
const duration = (item) => ((item.end.hour * 60 + item.end.min) - startMin(item) + 1440) % 1440;   // nunca 0 (validate lo impide)
const weekMinute = (date) => date.getDay() * 1440 + date.getHours() * 60 + date.getMinutes();
const mod = (n) => ((n % WEEK) + WEEK) % WEEK;

// Franja activa en `date` (la primera que encaje) o null: { index, item, label, until:'HH:MM', endsInMin }
function activeAt(items, date = new Date()) {
  const now = weekMinute(date);
  for (let index = 0; index < (items || []).length; index++) {
    const item = items[index];
    if (!item || !item.enabled) continue;
    for (const day of item.days) {
      const elapsed = mod(now - (day * 1440 + startMin(item)));
      if (elapsed < duration(item)) return { index, item, label: displayName(item), until: `${pad(item.end.hour)}:${pad(item.end.min)}`, endsInMin: duration(item) - elapsed };
    }
  }
  return null;
}

// Pares [i, j] de franjas activas que se solapan (la app avisa con "Overlapping Do Not Disturb")
function overlaps(items) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (!a.enabled || !b.enabled) continue;
      const hit = a.days.some((da) => b.days.some((db) => {
        const sa = da * 1440 + startMin(a), sb = db * 1440 + startMin(b);
        return mod(sb - sa) < duration(a) || mod(sa - sb) < duration(b);
      }));
      if (hit) pairs.push([i, j]);
    }
  }
  return pairs;
}

// Programaciones de limpieza (cleanSchedule2) que arrancan dentro de una franja: { schedule, dnd, day }.
// La app oficial las desactiva; aquí solo se avisa (no se escribe la programación del robot sin que el usuario lo haga).
function scheduleConflicts(items, cleanSchedule) {
  const out = [];
  (Array.isArray(cleanSchedule) ? cleanSchedule : []).forEach((entry, s) => {
    if (!entry || !entry.enabled || !entry.start || !Array.isArray(entry.start.day)) return;
    for (const day of entry.start.day) {
      const date = new Date(2026, 0, 4 + day, entry.start.hour, entry.start.min);   // 4-ene-2026 es domingo
      const hit = activeAt(items, date);
      if (hit) out.push({ schedule: s, dnd: hit.index, day });
    }
  });
  return out;
}

// Persistencia en app/data/dnd.json (ignorado por git), con escritura atómica como el historial
function createDndStore(filePath) {
  let items = [];
  try { items = validate(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch (_) { items = []; }
  return {
    list: () => items,
    set(next) {
      const valid = validate(next);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(valid));
      fs.renameSync(tmp, filePath);
      items = valid;
      return items;
    }
  };
}

module.exports = { validate, activeAt, overlaps, scheduleConflicts, createDndStore, displayName, LABELS, DAY_NAMES, MAX };
