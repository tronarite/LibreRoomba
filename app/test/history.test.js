const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHistory } = require('../history');

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hist-')), 'h.json');
const st = (n, phase = 'charge', extra = {}) => ({ batPct: 80, bbmssn: { nMssn: n }, cleanMissionStatus: { phase, missionId: 'M' + n, nMssn: n, cycle: 'clean', error: 0 }, ...extra });

test('primera ejecución: guarda el contador sin inventar misiones', () => {
  const f = file();
  const h = createHistory(f);
  h.observe(st(558), 1000);
  assert.equal(h.list().length, 0);
  assert.equal(JSON.parse(fs.readFileSync(`${f}.meta`, 'utf8')).lastCount, 558);
});

test('misiones con el servidor apagado: se registra cuántas fueron al volver', () => {
  const f = file();
  createHistory(f).observe(st(558), 1000);
  const h = createHistory(f);                // el servidor se reinicia y el robot hizo 2 misiones mientras tanto
  h.observe(st(560), 5000);
  const [gap] = h.list();
  assert.equal(gap.unobserved, true);
  assert.equal(gap.count, 2);
  assert.deepEqual([gap.fromCount, gap.toCount], [558, 560]);
  h.observe(st(560), 6000);                  // otra lectura igual: no duplica
  assert.equal(h.list().length, 1);
  assert.equal(createHistory(f).list().length, 1);
});

test('misiones vistas en directo no cuentan como huecos', () => {
  const f = file();
  const h = createHistory(f);
  h.observe(st(558), 1000);
  h.observe(st(559, 'run'), 2000);           // el contador sube durante la misión que sí estamos viendo
  h._finish(st(559, 'charge', { bbrun: {} }), 2000 + 5 * 60000);
  const rows = createHistory(f).list();
  assert.equal(rows.filter((m) => m.unobserved).length, 0);
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(`${f}.meta`, 'utf8')).lastCount, 559);
});

test('estado sin contador o con contador raro: no rompe nada', () => {
  const h = createHistory(file());
  assert.doesNotThrow(() => { h.observe({}, 1); h.observe({ bbmssn: { nMssn: 'x' } }, 2); h.observe(null, 3); });
  assert.equal(h.list().length, 0);
});
