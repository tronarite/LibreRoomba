const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, count } = require('../core/errors');
const table = require('../core/error-table.json');

test('la tabla se generó del APK con un número razonable de códigos', () => {
  assert.ok(count >= 100, `códigos: ${count}`);
  assert.equal(table.count, count);
});

test('código conocido: título y mensaje de la app en español, con el nombre del robot', () => {
  const e = describe(1, 'es', { robot: 'Roomba' });
  assert.equal(e.known, true);
  assert.equal(e.code, 1);
  assert.equal(e.title, 'Rueda izquierda separada del suelo');
  assert.match(e.message, /^Roomba está atascado\./);
  assert.match(e.cause, /atascado\.$/);
  assert.match(e.action, /superficie plana/);
  assert.ok(!/\{robot\}/.test(JSON.stringify(e)), 'sin marcadores sin sustituir');
});

test('inglés y robot por defecto', () => {
  const e = describe(14, 'en');
  assert.equal(e.title, 'Bin missing');
  assert.match(e.message, /^Re-install The robot's bin/);
  assert.equal(describe(14, 'es').title, 'Falta depósito');
});

test('el código llega como texto o número (el estado del robot es JSON)', () => {
  assert.equal(describe('36', 'es').code, 36);
  assert.equal(describe(36, 'es').name, 'BIN_FULL');
});

test('sin error (0)', () => {
  assert.equal(describe(0, 'es').title, 'Sin error');
  assert.equal(describe(0, 'en').known, true);
});

test('código desconocido: texto claro y known=false, nunca inventa', () => {
  const e = describe(9999, 'es');
  assert.equal(e.known, false);
  assert.equal(e.title, 'Error 9999: sin descripción');
  assert.equal(e.message, null);
  assert.equal(describe(9999, 'en').title, 'Error 9999: no description');
});

test('entradas no válidas no revientan', () => {
  for (const bad of [undefined, null, '', 'abc', -3, 1.5, {}, NaN]) assert.equal(describe(bad).known, false, String(bad));
  assert.equal(describe(1, 'xx').title, describe(1, 'es').title, 'idioma desconocido cae a español');
});

test('códigos sin mensaje largo conservan al menos el título de la app', () => {
  const sinMensaje = Object.values(table.errors).find((e) => !e.es.message && e.es.title);
  assert.ok(sinMensaje, 'debe existir alguno');
  const e = describe(sinMensaje.code, 'es');
  assert.equal(e.known, true);
  assert.equal(e.message, null);
  assert.ok(e.title.length > 0);
});
