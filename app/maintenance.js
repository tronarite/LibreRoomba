const num = (v) => (Number.isFinite(v) ? v : null);
const get = (o, key) => (o && typeof o === 'object' ? o[key] : undefined);

function summarize(state) {
  const s = state || {};
  const run = s.bbrun;
  const mssn = s.bbmssn;
  const rssi = num(get(s.signal, 'rssi'));
  const sqft = num(get(run, 'sqft'));
  return {
    battery: {
      pct: num(s.batPct),
      cycles: num(get(s.batInfo, 'cCount')),
      manufactureDate: get(s.batInfo, 'mDate') ?? null,
      onDockHours: num(get(s.bbchg3, 'hOnDock'))
    },
    totals: {
      runHours: num(get(run, 'hr')),
      areaM2: sqft === null ? null : Math.round(sqft * 0.0929 * 10) / 10,
      missions: num(get(mssn, 'nMssn')),
      missionsOk: num(get(mssn, 'nMssnOk')),
      missionsCanceled: num(get(mssn, 'nMssnC')),
      missionsFailed: num(get(mssn, 'nMssnF')),
      avgMissionMin: num(get(mssn, 'aMssnM')),
      evacs: num(get(run, 'nEvacs')),
      stuckEvents: num(get(run, 'nStuck')),
      panics: num(get(run, 'nPanics')),
      cliffEvents: num(get(run, 'nCliffsF')),
      overtemps: num(get(run, 'nOvertemps'))
    },
    bin: { present: get(s.bin, 'present') ?? null, full: get(s.bin, 'full') ?? null },
    wifi: {
      rssi,
      quality: rssi === null ? null : rssi >= -60 ? 'buena' : rssi >= -75 ? 'media' : 'débil'
    },
    firmware: { software: s.softwareVer ?? null, dock: get(s.dock, 'fwVer') ?? null }
  };
}

module.exports = { summarize };

if (require.main === module) {
  const assert = require('assert');
  const m = summarize({
    batPct: 80, batInfo: { cCount: 504, mDate: '2023-9-24' }, bbchg3: { hOnDock: 900 },
    bbrun: { sqft: 1875, hr: 836, nEvacs: 1122, nStuck: 167, nPanics: 1320, nCliffsF: 7734, nOvertemps: 0 },
    bbmssn: { nMssn: 556, nMssnOk: 400, nMssnC: 100, nMssnF: 56, aMssnM: 33 },
    signal: { rssi: -65 }, bin: { present: true, full: false }, softwareVer: 'x', dock: { fwVer: 'd1' }
  });
  assert.strictEqual(m.totals.areaM2, 174.2);
  assert.strictEqual(m.wifi.quality, 'media');
  assert.strictEqual(m.battery.cycles, 504);
  assert.strictEqual(m.firmware.dock, 'd1');
  const empty = summarize({});
  assert.strictEqual(empty.battery.pct, null);
  assert.strictEqual(empty.wifi.quality, null);
  assert.strictEqual(summarize(null).totals.runHours, null);
  console.log('OK');
}
