const fs = require('fs');
const path = require('path');

const MAX = 200;
const END_GRACE_MS = 10000;

function createHistory(filePath) {
  let missions = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) missions = parsed;
  } catch (_) {
    missions = [];
  }

  // Contador de misiones de por vida del robot (bbmssn.nMssn), guardado aparte: detecta las que ocurrieron con el servidor apagado.
  const metaPath = `${filePath}.meta`;
  let lastCount = null;
  try { const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); if (Number.isInteger(meta.lastCount)) lastCount = meta.lastCount; } catch (_) { /* sin contador previo */ }
  let checkedStartup = false;

  let current = null;
  let endTimer = null;

  function save() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(missions));
      fs.renameSync(tmp, filePath);
    } catch (_) {
      // Sin disco no hay historial persistente, pero el servidor sigue funcionando.
    }
  }

  function saveMeta() {
    try {
      fs.mkdirSync(path.dirname(metaPath), { recursive: true });
      fs.writeFileSync(metaPath, JSON.stringify({ lastCount }));
    } catch (_) { /* igual que save() */ }
  }

  // Primera lectura tras arrancar: si el contador subió respecto a lo guardado, hubo misiones que no vimos.
  function trackCount(state, now) {
    const n = state && state.bbmssn && state.bbmssn.nMssn;
    if (!Number.isInteger(n)) return;
    if (!checkedStartup) {
      checkedStartup = true;
      if (lastCount !== null && n > lastCount) {
        missions.unshift({ unobserved: true, count: n - lastCount, detectedAt: new Date(now).toISOString(), fromCount: lastCount, toCount: n });
        missions = missions.slice(0, MAX);
        save();
      }
    }
    if (n !== lastCount) { lastCount = n; saveMeta(); }
  }

  function finish(state, now) {
    if (!current) return;
    const status = (state && state.cleanMissionStatus) || {};
    const bbrun = (state && state.bbrun) || {};
    const startedMs = Date.parse(current.startedAt);
    const durationMin = Number.isFinite(status.mssnM) && status.mssnM > 0
      ? status.mssnM
      : Math.round((now - startedMs) / 60000);
    missions.unshift({
      ...current,
      endedAt: new Date(now).toISOString(),
      durationMin,
      errorFinal: status.error || 0,
      batEnd: state ? state.batPct ?? null : null,
      sqftDelta: Number.isFinite(bbrun.sqft) && Number.isFinite(current.sqftStart) ? bbrun.sqft - current.sqftStart : null
    });
    missions = missions.slice(0, MAX);
    current = null;
    save();
  }

  function observe(state, now = Date.now()) {
    trackCount(state, now);
    const status = (state && state.cleanMissionStatus) || {};
    const bbrun = (state && state.bbrun) || {};
    const running = status.phase === 'run';
    if (running && current && status.missionId && current.missionId !== status.missionId) finish(state, now);
    if (running) {
      clearTimeout(endTimer);
      endTimer = null;
      if (!current) {
        current = {
          missionId: status.missionId || null,
          nMssn: status.nMssn ?? null,
          startedAt: new Date(now).toISOString(),
          cycle: status.cycle || null,
          batStart: state.batPct ?? null,
          sqftStart: Number.isFinite(bbrun.sqft) ? bbrun.sqft : null
        };
      }
      return;
    }
    if (current && ['charge', 'stop'].includes(status.phase) && !endTimer) {
      endTimer = setTimeout(() => { endTimer = null; finish(state, Date.now()); }, END_GRACE_MS);
      if (endTimer.unref) endTimer.unref();
    }
  }

  return { observe, list: () => missions.slice(), _finish: (state, now) => finish(state, now) };
}

module.exports = { createHistory };

if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hist-')), 'sub', 'h.json');
  const h = createHistory(file);
  const base = { batPct: 90, bbrun: { sqft: 100 }, cleanMissionStatus: { phase: 'run', missionId: 'A', nMssn: 1, cycle: 'clean', error: 0, mssnM: 0 } };
  h.observe(base, 1000);
  h._finish({ batPct: 80, bbrun: { sqft: 130 }, cleanMissionStatus: { phase: 'charge', missionId: 'A', mssnM: 12, error: 0 } }, 1000 + 12 * 60000);
  const [m] = h.list();
  assert.strictEqual(h.list().length, 1);
  assert.strictEqual(m.missionId, 'A');
  assert.strictEqual(m.durationMin, 12);
  assert.strictEqual(m.sqftDelta, 30);
  assert.strictEqual(m.batStart, 90);
  assert.strictEqual(m.batEnd, 80);
  assert.strictEqual(createHistory(file).list().length, 1);
  fs.writeFileSync(file, '{corrupto');
  assert.strictEqual(createHistory(file).list().length, 0);
  console.log('OK');
}
