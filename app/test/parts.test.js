const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeParts } = require('../core/parts');

const raw = { parts: [
  { part_id: '35', minutes_remaining: 420, count_used: 2711 },
  { part_id: '36', minutes_remaining: 6660, count_used: 2711 },
  { part_id: '37', minutes_remaining: 7200, count_used: 11561 },
  { part_id: '139', minutes_remaining: 0, count_used: 46921 }] };

test('piezas: nombres conocidos, horas y estado', () => {
  const { known, other } = normalizeParts(raw);
  assert.deepEqual(known.map((p) => p.name), ['Filtro de alta eficiencia', 'Cepillo de esquinas y bordes', 'Doble cepillo multisuperficie']);
  assert.equal(known[0].remainingHours, 7);
  assert.equal(known[0].status, 'pronto');
  assert.equal(known[1].remainingHours, 111);
  assert.equal(known[1].status, 'bien');
  assert.equal(known[2].remainingHours, 120);
  assert.deepEqual(other.map((p) => [p.id, p.status]), [['139', 'agotada']]);
});

test('piezas: respuestas raras no rompen', () => {
  assert.deepEqual(normalizeParts(null), { known: [], other: [] });
  assert.deepEqual(normalizeParts({ parts: 'x' }), { known: [], other: [] });
  assert.equal(normalizeParts({ parts: [{ part_id: '35' }] }).known[0].status, 'desconocido');
});
