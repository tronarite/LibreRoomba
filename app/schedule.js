'use strict';

/**
 * Valida y normaliza una lista de programaciones de Roomba.
 * @param {Array} items
 * @returns {Array} Array normalizado
 */
function validate(items) {
  if (!Array.isArray(items)) {
    throw new Error('El horario debe ser una lista de entradas.');
  }

  if (items.length > 10) {
    throw new Error('No se pueden configurar más de 10 programaciones.');
  }

  const normalized = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`La entrada #${i + 1} no es un objeto válido.`);
    }

    if (typeof item.enabled !== 'boolean') {
      throw new Error(`La entrada #${i + 1} debe tener el campo "enabled" como booleano.`);
    }

    if (!item.start || typeof item.start !== 'object' || Array.isArray(item.start)) {
      throw new Error(`La entrada #${i + 1} debe contener la configuración de inicio ("start").`);
    }

    const { day, hour, min } = item.start;

    if (!Array.isArray(day) || day.length === 0) {
      throw new Error(`La entrada #${i + 1} debe incluir al menos un día de ejecución.`);
    }

    const daySet = new Set();
    for (const d of day) {
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) {
        throw new Error(`La entrada #${i + 1} contiene un día inválido (debe ser un entero de 0 a 6).`);
      }
      daySet.add(d);
    }
    const sortedDays = Array.from(daySet).sort((a, b) => a - b);

    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error(`La entrada #${i + 1} tiene una hora inválida (debe ser un entero de 0 a 23).`);
    }

    if (typeof min !== 'number' || !Number.isInteger(min) || min < 0 || min > 59) {
      throw new Error(`La entrada #${i + 1} tiene minutos inválidos (debe ser un entero de 0 a 59).`);
    }

    let cmdTime;
    if (item.cmd && typeof item.cmd === 'object' && typeof item.cmd.time === 'number' && Number.isInteger(item.cmd.time)) {
      cmdTime = item.cmd.time;
    } else {
      cmdTime = Math.floor(Date.now() / 1000);
    }

    // Normalizar descartando claves extra y previniendo prototype pollution
    normalized.push({
      enabled: item.enabled,
      type: 0,
      start: {
        day: sortedDays,
        hour: hour,
        min: min
      },
      cmd: {
        command: 'start',
        time: cmdTime,
        initiator: 'schedule'
      }
    });
  }

  return normalized;
}

/**
 * Detecta conflictos entre entradas activadas que coinciden en día y hora:minuto.
 * @param {Array} items
 * @returns {Array<Array>} Pares de entradas en conflicto
 */
function conflicts(items) {
  if (!Array.isArray(items)) return [];

  const conflictPairs = [];

  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (!a || !a.enabled || !a.start || !Array.isArray(a.start.day)) continue;

    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (!b || !b.enabled || !b.start || !Array.isArray(b.start.day)) continue;

      if (a.start.hour === b.start.hour && a.start.min === b.start.min) {
        const sharedDay = a.start.day.some(d => b.start.day.includes(d));
        if (sharedDay) {
          conflictPairs.push([a, b]);
        }
      }
    }
  }

  return conflictPairs;
}

module.exports = {
  validate,
  conflicts
};

if (require.main === module) {
  const assert = require('assert');

  // 1. Caso válido
  const validSample = [
    {
      enabled: true,
      type: 0,
      start: { day: [5, 1, 2, 3, 4], hour: 10, min: 0 },
      cmd: { command: 'start', time: 1792656000, initiator: 'schedule' }
    }
  ];
  const res = validate(validSample);
  assert.strictEqual(res.length, 1);
  assert.deepStrictEqual(res[0].start.day, [1, 2, 3, 4, 5]);
  assert.strictEqual(res[0].cmd.time, 1792656000);
  assert.strictEqual(res[0].type, 0);

  // 2. Día fuera de rango
  assert.throws(() => {
    validate([{ enabled: true, start: { day: [7], hour: 10, min: 0 } }]);
  }, /día inválido/);

  // 3. Hora 24
  assert.throws(() => {
    validate([{ enabled: true, start: { day: [1], hour: 24, min: 0 } }]);
  }, /hora inválida/);

  // 4. 11 entradas
  const eleven = Array.from({ length: 11 }, () => ({
    enabled: true,
    start: { day: [1], hour: 8, min: 0 }
  }));
  assert.throws(() => {
    validate(eleven);
  }, /No se pueden configurar más de 10/);

  // 5. Claves extra descartadas y __proto__ ignorado
  const dirty = JSON.parse('{"enabled":true,"extraKey":"bad","__proto__":{"polluted":true},"start":{"day":[0],"hour":12,"min":30,"extraStart":123},"cmd":{"command":"start","time":100,"initiator":"schedule","extraCmd":"bad"}}');
  const sanitized = validate([dirty]);
  assert.strictEqual(sanitized[0].extraKey, undefined);
  assert.strictEqual(sanitized[0].start.extraStart, undefined);
  assert.strictEqual(sanitized[0].cmd.extraCmd, undefined);
  assert.strictEqual({}.polluted, undefined);
  assert.deepStrictEqual(Object.keys(sanitized[0]).sort(), ['cmd', 'enabled', 'start', 'type']);
  assert.deepStrictEqual(Object.keys(sanitized[0].start).sort(), ['day', 'hour', 'min']);
  assert.deepStrictEqual(Object.keys(sanitized[0].cmd).sort(), ['command', 'initiator', 'time']);

  // 6. Test de conflicts
  const conflictItems = [
    { enabled: true, start: { day: [1, 2], hour: 10, min: 0 } },
    { enabled: true, start: { day: [2, 3], hour: 10, min: 0 } },
    { enabled: false, start: { day: [1], hour: 10, min: 0 } }
  ];
  const conf = conflicts(conflictItems);
  assert.strictEqual(conf.length, 1);
  assert.strictEqual(conf[0][0], conflictItems[0]);
  assert.strictEqual(conf[0][1], conflictItems[1]);

  console.log('OK');
  process.exit(0);
}
