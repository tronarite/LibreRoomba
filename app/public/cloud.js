// Historial y mapa que vienen de la nube de iRobot (solo lectura). Sin librerías: tabla DOM y <canvas>.
(function () {
  const historyMsg = document.querySelector('#cloud-history-msg');
  const historyTable = document.querySelector('#cloud-history-table');
  const historyBody = document.querySelector('#cloud-history-body');
  const mapMsg = document.querySelector('#cloud-map-msg');
  const mapBox = document.querySelector('#cloud-map-box');
  const canvas = document.querySelector('#cloud-map');
  if (!historyBody || !canvas) return;

  const cell = (text) => { const td = document.createElement('td'); td.textContent = text; return td; };
  async function getJson(url) {
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || `Error ${response.status}`); error.code = body.code; throw error; }
    return body;
  }
  // el servidor ya devuelve el motivo y, si falta sesión, el comando para crearla (node research/cloud/login.js)
  const explain = (error) => error.message || 'No se pudo cargar.';

  async function loadHistory() {
    try {
      const { missions } = await getJson('/api/cloud/history');
      historyBody.replaceChildren();
      for (const m of missions) {
        const row = document.createElement('tr');
        const when = m.startedAt ? new Date(m.startedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
        const result = cell(m.label); result.dataset.result = m.result;
        row.append(cell(when), cell(m.durationMin == null ? '—' : `${m.durationMin} min`), result, cell(m.areaM2 == null ? '—' : `${m.areaM2.toFixed(1)} m²`), cell(String(m.evacs)));
        historyBody.append(row);
      }
      historyTable.classList.toggle('hidden', !missions.length);
      historyMsg.textContent = missions.length ? `${missions.length} misiones en la nube.` : 'La nube no tiene misiones registradas.';
    } catch (error) {
      historyTable.classList.add('hidden');
      historyMsg.textContent = explain(error);
    }
  }

  // --- Mapa ---
  const state = { map: null, cells: null };
  const STALL_LABELS = { side_brush_stall_detected: 'cepillo lateral atascado', brush_stall_detected: 'cepillo principal atascado', wheel_dropped: 'rueda caída o levantada', start_evade: 'maniobra de evasión al arrancar', stasis_detected: 'robot inmovilizado' };
  const color = (t) => `rgb(${Math.round(70 + 116 * t)},${Math.round(120 + 110 * t)},${Math.round(190 + 63 * t)})`;   // de azul medio a azul claro: más misiones = más claro, buen contraste sobre el fondo oscuro

  function draw() {
    const map = state.map;
    if (!map) return;
    const scale = Math.max(2, Math.min(6, Math.floor(560 / map.width)));
    canvas.width = map.width * scale; canvas.height = map.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = (x) => ((x - map.origin.x) / map.resolution) * scale;
    const py = (y) => canvas.height - ((y - map.origin.y) / map.resolution) * scale;   // y hacia arriba
    for (let cy = 0; cy < map.height; cy++) for (let cx = 0; cx < map.width; cx++) {
      const n = state.cells[cy * map.width + cx];
      if (!n) continue;
      ctx.fillStyle = color(Math.sqrt(n / map.peak));
      ctx.fillRect(cx * scale, canvas.height - (cy + 1) * scale, scale, scale);
    }
    if (document.querySelector('#layer-borders').checked) {
      ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      for (const ring of map.borders) { ctx.beginPath(); ring.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)))); ctx.closePath(); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    if (document.querySelector('#layer-stalls').checked) {
      for (const s of map.stalls) {
        const x = px(s.x), y = py(s.y), r = Math.min(14, 5 + Math.sqrt(s.n));      // el tamaño crece con el número de eventos en esa zona
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath();
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#fb923c'; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.arc(px(map.dock.x), py(map.dock.y), 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3; ctx.stroke();
  }

  async function loadMap() {
    mapMsg.textContent = 'Cargando el mapa (la primera vez descarga cada misión y puede tardar unos segundos)…';
    mapBox.classList.add('hidden');
    try {
      const map = await getJson('/api/cloud/map');
      state.map = map;
      state.cells = Uint8Array.from(atob(map.grid), (c) => c.charCodeAt(0));
      document.querySelector('#map-peak').textContent = `${map.peak} misiones`;
      const summary = `${map.missions} misiones alineadas por la base, ${map.areaM2.toFixed(1)} m² recorridos` + (map.skipped ? `; ${map.skipped} omitidas por no tener la base reconocida` : '') + `. La base mira hacia la derecha.`;
      document.querySelector('#cloud-map-summary').textContent = summary;
      const totals = Object.entries(map.stallTotals || {}).sort((a, b) => b[1] - a[1]).map(([event, n]) => `${n.toLocaleString('es-ES')} × ${STALL_LABELS[event] || event}`);
      document.querySelector('#cloud-map-stalls').textContent = totals.length ? `Eventos registrados en esas misiones: ${totals.join('; ')}. En el mapa solo se marcan las zonas con atascos repetidos.` : '';
      canvas.setAttribute('aria-label', `Mapa de cobertura. ${summary} ${map.stalls.length} zonas con atascos repetidos.`);
      mapMsg.textContent = '';
      mapBox.classList.remove('hidden');
      draw();
    } catch (error) {
      mapMsg.textContent = explain(error);
    }
  }

  document.querySelector('#layer-borders').addEventListener('change', draw);
  document.querySelector('#layer-stalls').addEventListener('change', draw);
  document.querySelector('#cloud-map-reload').addEventListener('click', loadMap);
  loadHistory();
  loadMap();
})();
