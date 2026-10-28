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

const run = (n, extra = {}, status = {}) => ({ batPct: 90, bbrun: { sqft: 100 }, dock: { state: 301 }, cleanMissionStatus: { phase: 'run', missionId: 'M' + n, nMssn: n, cycle: 'clean', initiator: 'schedule', error: 0, mssnM: 0, ...status }, ...extra });

test('misión completa: iniciador, ciclo, fin, duración, vaciado y motivo', () => {
  const h = createHistory(file());
  h.observe(run(10), 1000);
  h.observe(run(10, {}, { phase: 'hmUsrDock', cycle: 'dock', initiator: 'none' }), 60000);
  h.observe(run(10, { dock: { state: 302 } }, { phase: 'evac', cycle: 'dock' }), 90000);
  h._finish(run(10, { batPct: 88, dock: { state: 303 } }, { phase: 'charge', cycle: 'none', mssnM: 7 }), 1000 + 7 * 60000);
  const [m] = h.list();
  assert.equal(m.initiator, 'schedule');
  assert.equal(m.cycle, 'clean');
  assert.equal(m.durationMin, 7);
  assert.equal(m.endPhase, 'charge');
  assert.equal(m.endReason, 'completed');
  assert.equal(m.evacuated, true);
  assert.equal(m.stuck, false);
  assert.equal(m.errorSeen, null);
  assert.ok(m.startedAt && m.endedAt);
});

test('atasco con error: se recuerda aunque al final el error vuelva a 0, con su texto', () => {
  const h = createHistory(file());
  h.observe(run(11, {}, { initiator: 'localApp' }), 1000);
  h.observe(run(11, {}, { phase: 'stuck', error: 2 }), 5000);
  h._finish(run(11, {}, { phase: 'charge', cycle: 'none', error: 0, mssnM: 1 }), 70000);
  const [m] = h.list();
  assert.equal(m.initiator, 'localApp');
  assert.equal(m.endReason, 'error');
  assert.equal(m.errorSeen, 2);
  assert.equal(m.errorFinal, 0);
  assert.equal(m.stuck, true);
  assert.ok(m.errorTitle && !/^Error 2:/.test(m.errorTitle));
});

test('parada manual sin volver a la base: motivo stopped; recarga a mitad: lowBattery', () => {
  const h = createHistory(file());
  h.observe(run(12), 1000);
  h._finish(run(12, { dock: { state: 301 } }, { phase: 'stop', cycle: 'none', mssnM: 3 }), 190000);
  assert.equal(h.list()[0].endReason, 'stopped');
  assert.equal(h.list()[0].evacuated, false);
  h.observe(run(13), 200000);
  h.observe(run(13, {}, { phase: 'recharge' }), 210000);
  h._finish(run(13, {}, { phase: 'charge', cycle: 'none', mssnM: 5 }), 500000);
  assert.equal(h.list()[0].endReason, 'lowBattery');
});

test('registros antiguos (sin campos nuevos) se cargan con null y los huecos no se tocan', () => {
  const f = file();
  const old = [
    { missionId: 'A', nMssn: 5, startedAt: '2026-10-01T10:00:00.000Z', cycle: 'clean', batStart: 100, sqftStart: 1, endedAt: '2026-10-01T10:30:00.000Z', durationMin: 30, errorFinal: 0, batEnd: 70, sqftDelta: 4 },
    { unobserved: true, count: 2, detectedAt: '2026-10-02T00:00:00.000Z', fromCount: 5, toCount: 7 }
  ];
  fs.writeFileSync(f, JSON.stringify(old));
  const rows = createHistory(f).list();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].durationMin, 30);
  assert.equal(rows[0].initiator, null);
  assert.equal(rows[0].evacuated, null);
  assert.equal(rows[0].endReason, null);
  assert.equal('initiator' in rows[1], false);
});
