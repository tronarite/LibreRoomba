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
  const state = { map: null, cells: null, rooms: [], draft: null, drawing: false };
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
    ctx.font = '13px sans-serif'; ctx.lineWidth = 2;
    for (const r of state.rooms) {
      ctx.strokeStyle = '#4ade80'; ctx.setLineDash([]); ctx.strokeRect(px(r.x0), py(r.y1), px(r.x1) - px(r.x0), py(r.y0) - py(r.y1));
      ctx.fillStyle = '#052e16'; ctx.fillText(r.name, px(r.x0) + 5, py(r.y1) + 16);     // sombra para leer sobre el azul claro
      ctx.fillStyle = '#bbf7d0'; ctx.fillText(r.name, px(r.x0) + 4, py(r.y1) + 15);
    }
    if (state.draft) { const d = state.draft; ctx.strokeStyle = '#fde047'; ctx.setLineDash([5, 4]); ctx.strokeRect(px(d.x0), py(d.y1), px(d.x1) - px(d.x0), py(d.y0) - py(d.y1)); ctx.setLineDash([]); }
    ctx.beginPath(); ctx.arc(px(map.dock.x), py(map.dock.y), 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3; ctx.stroke();
  }

  async function loadMap() {
    mapMsg.textContent = 'Cargando el mapa (la primera vez descarga cada misión y puede tardar unos segundos)…';
    mapBox.classList.add('hidden');
    try {
      // Primero el mapa propio (sin nube); si todavía no hay, el de la nube de iRobot
      let map;
      try { map = await getJson('/api/localmap'); } catch (error) { if (error.code !== 'empty') throw error; map = await getJson('/api/cloud/map'); }
      state.map = map;
      state.cells = Uint8Array.from(atob(map.grid), (c) => c.charCodeAt(0));
      document.querySelector('#map-peak').textContent = `${map.peak} misiones`;
      const summary = (map.source === 'local' ? 'Mapa propio (sin nube): ' : '') + `${map.missions} misiones alineadas por la base, ${map.areaM2.toFixed(1)} m² recorridos` + (map.skipped ? `; ${map.skipped} omitidas por no tener la base reconocida` : '') + `. La base mira hacia la derecha.`;
      document.querySelector('#cloud-map-summary').textContent = summary;
      const totals = Object.entries(map.stallTotals || {}).sort((a, b) => b[1] - a[1]).map(([event, n]) => `${n.toLocaleString('es-ES')} × ${STALL_LABELS[event] || event}`);
      document.querySelector('#cloud-map-stalls').textContent = totals.length ? `Eventos registrados en esas misiones: ${totals.join('; ')}. En el mapa solo se marcan las zonas con atascos repetidos.` : '';
      canvas.dataset.label = `Mapa de cobertura. ${summary} ${map.stalls.length} zonas con atascos repetidos.`;
      mapMsg.textContent = '';
      mapBox.classList.remove('hidden');
      renderRooms();
    } catch (error) {
      mapMsg.textContent = explain(error);
    }
  }

  // --- Habitaciones propias (se guardan en el servidor, app/data/rooms.json) ---
  const roomsList = document.querySelector('#rooms-list'), roomsMsg = document.querySelector('#rooms-msg');
  const nameInput = document.querySelector('#room-name'), drawButton = document.querySelector('#room-draw');
  function renderRooms() {
    roomsList.replaceChildren();
    for (const [i, r] of state.rooms.entries()) {
      const li = document.createElement('li');
      const cover = r.coveragePct == null ? '' : `, ${r.coveragePct} % recorrido`;
      const text = document.createElement('span'); text.textContent = `${r.name}: ${r.areaM2.toFixed(1)} m²${cover}`;
      const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Borrar'; del.setAttribute('aria-label', `Borrar ${r.name}`);
      del.addEventListener('click', () => saveRooms(state.rooms.filter((_, k) => k !== i)));
      li.append(text, del); roomsList.append(li);
    }
    canvas.setAttribute('aria-label', `${canvas.dataset.label || 'Mapa de cobertura.'}${state.rooms.length ? ` Habitaciones: ${state.rooms.map((r) => r.name).join(', ')}.` : ''}`);
    draw();
  }
  async function saveRooms(list) {
    try {
      const response = await fetch('/api/rooms', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rooms: list.map(({ name, x0, y0, x1, y1 }) => ({ name, x0, y0, x1, y1 })) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      state.rooms = body.rooms; roomsMsg.textContent = ''; renderRooms();
    } catch (error) { roomsMsg.textContent = error.message; }
  }
  async function loadRooms() {
    try { const response = await fetch('/api/rooms'); state.rooms = (await response.json()).rooms || []; renderRooms(); } catch (_) { /* sin habitaciones */ }
  }
  document.querySelector('#room-add').addEventListener('click', () => {
    const v = ['x0', 'y0', 'x1', 'y1'].map((k) => document.querySelector(`#room-${k}`).value);
    if (!nameInput.value.trim()) { roomsMsg.textContent = 'Escribe primero el nombre de la habitación.'; nameInput.focus(); return; }
    if (v.some((x) => x === '' || !Number.isFinite(Number(x)))) { roomsMsg.textContent = 'Rellena las cuatro coordenadas con números.'; return; }
    const [x0, y0, x1, y1] = v.map(Number);
    saveRooms([...state.rooms, { name: nameInput.value.trim(), x0, y0, x1, y1 }]); nameInput.value = '';
  });
  const toMeters = (event) => {
    const box = canvas.getBoundingClientRect(), map = state.map;
    const fx = (event.clientX - box.left) / box.width, fy = (event.clientY - box.top) / box.height;
    return { x: map.origin.x + fx * map.width * map.resolution, y: map.origin.y + (1 - fy) * map.height * map.resolution };
  };
  drawButton.addEventListener('click', () => {
    if (!nameInput.value.trim()) { roomsMsg.textContent = 'Escribe primero el nombre de la habitación.'; nameInput.focus(); return; }
    state.drawing = true; canvas.classList.add('drawing'); roomsMsg.textContent = 'Arrastra sobre el mapa para marcar la habitación.';
  });
  let anchor = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (!state.drawing || !state.map) return;
    anchor = toMeters(event); canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!anchor) return;
    const p = toMeters(event); state.draft = { x0: Math.min(anchor.x, p.x), y0: Math.min(anchor.y, p.y), x1: Math.max(anchor.x, p.x), y1: Math.max(anchor.y, p.y) }; draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!anchor) return;
    const rect = state.draft; anchor = null; state.draft = null; state.drawing = false; canvas.classList.remove('drawing');
    if (!rect) { roomsMsg.textContent = ''; draw(); return; }
    saveRooms([...state.rooms, { name: nameInput.value.trim(), ...rect }]); nameInput.value = '';
  });

  document.querySelector('#layer-borders').addEventListener('change', draw);
  document.querySelector('#layer-stalls').addEventListener('change', draw);
  document.querySelector('#cloud-map-reload').addEventListener('click', loadMap);
  loadHistory();
  loadMap();
  loadRooms();
})();
