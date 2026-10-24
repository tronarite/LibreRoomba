// Nube de iRobot simulada (modo --mock y pruebas): misma interfaz que createCloud, con misiones y mapas UMF sintéticos. No hace ninguna petición.
const { CloudError } = require('./cloud');

const R = 0.1049;
const DAY = 86400;

// Planta sintética: salón rectangular y pasillo; la base está en (0,0)
function floor() {
  const pts = [];
  for (let i = 0; i < 50; i++) for (let j = -18; j < 18; j++) pts.push([i * R, j * R]);
  for (let i = 50; i < 95; i++) for (let j = 4; j < 9; j++) pts.push([i * R, j * R]);
  return pts;
}

function umf(i) {
  const theta = (i % 5) * 0.05 - 0.1;          // cada misión arranca con una orientación algo distinta, como en el robot real
  const c = Math.cos(theta), s = Math.sin(theta);
  const tf = ([x, y]) => [x * c - y * s, x * s + y * c];
  const keep = floor().filter((_, k) => (k + i) % 9 !== 0);   // pequeñas diferencias entre misiones
  return {
    maps: [{
      map_header: { resolution: R, area: keep.length * R * R },
      poses2d: [{ id: '100002', coordinates: [0, 0], ori_rad: theta }],
      typed_poses: { dock_poses: { geometry: { type: 'multipose', ids: ['100002'] } } },
      points2d: [[0, -1.9], [5.2, -1.9], [5.2, 1.9], [0, 1.9]].map((p, n) => ({ id: `p${n}`, coordinates: tf(p) })),
      borders: [{ id: '0', geometry: { type: 'polygon', ids: [['p0', 'p1', 'p2', 'p3']] } }],
      layers: [
        { layer_type: 'coverage', geometry: { type: 'multipoint2d', coordinates: keep.map(tf) } },
        { layer_type: 'escape_events', geometry: { type: 'pose2dconcise_event', list: i % 3 === 0 ? [{ pose: [...tf([2.1, 0.8]), 0], event: 'side_brush_stall_detected' }] : [] } }
      ]
    }]
  };
}

function createFakeCloud({ missions = 8, now = () => Date.now() } = {}) {
  const base = Math.floor(now() / 1000);
  const history = Array.from({ length: missions }, (_, i) => ({
    startTime: base - (i + 1) * DAY, durationM: 20 + i * 7, sqft: 180 + i * 12, evacs: i % 3, nMssn: 100 - i,
    done: ['ok', 'cncl', 'ok', 'stuck', 'inc'][i % 5], dockedAtStart: i !== 6,
    pmaps_robot: [{ [`mock${i}`]: `2610${i}T000000` }]
  }));
  return {
    mock: true,
    status: () => ({ hasSession: true, mock: true, expiresAt: null, robots: [{ name: 'Roomba simulada', sku: 'mock' }] }),
    missionHistory: async () => history,
    robotParts: async () => ({ robot_id: 'mock', num_parts: 4, parts: [
      { part_id: '35', minutes_remaining: 420, count_used: 2711, count_remaining: 420 },
      { part_id: '36', minutes_remaining: 6660, count_used: 2711, count_remaining: 6660 },
      { part_id: '37', minutes_remaining: 7200, count_used: 11561, count_remaining: 7200 },
      { part_id: '139', minutes_remaining: 0, count_used: 46921, count_remaining: 0 }] }),
    umf: async (pmapId, version) => {
      const m = /^mock(\d+)$/.exec(pmapId);
      if (!m || !version) throw new CloudError('Mapa no encontrado', 'http', 404);
      return umf(Number(m[1]));
    }
  };
}

module.exports = { createFakeCloud };
