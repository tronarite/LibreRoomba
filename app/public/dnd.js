(function () {
  'use strict';

  const DAY_MAP = [
    { label: 'L', val: 1 },
    { label: 'M', val: 2 },
    { label: 'X', val: 3 },
    { label: 'J', val: 4 },
    { label: 'V', val: 5 },
    { label: 'S', val: 6 },
    { label: 'D', val: 0 }
  ];

  const LABELS = {
    quiet: 'Momento de tranquilidad',
    nap: 'Hora de la siesta',
    movie: 'Noche de películas',
    meeting: 'Reunión semanal',
    custom: 'Personalizada'
  };

  let dndItems = [];

  // UI shortcuts
  const container = document.getElementById('dnd-body');
  const msgEl = document.getElementById('dnd-msg');
  const statusEl = document.getElementById('dnd-status');
  const conflictsEl = document.getElementById('dnd-conflicts');

  function setMessage(text, isError) {
    if (msgEl) {
      msgEl.textContent = text;
      msgEl.style.color = isError ? 'red' : 'green';
    }
  }

  function setStatus(active) {
    if (!statusEl) return;
    if (active) {
      const labelTxt = LABELS[active.label] || active.label;
      statusEl.textContent = `No molestar activo: ${labelTxt} hasta las ${active.until}. Sólo funciona mientras el servidor de LibreRoomba está en marcha y conectado al robot.`;
    } else {
      statusEl.textContent = `No molestar no está activo ahora. Sólo funciona mientras el servidor de LibreRoomba está en marcha y conectado al robot.`;
    }
  }

  function renderConflicts(conflicts) {
    if (!conflictsEl) return;
    const msgs = [];
    if (conflicts.overlaps && conflicts.overlaps.length) {
      conflicts.overlaps.forEach(pair => {
        const [i, j] = pair.map(n => n + 1); // base 1
        msgs.push(`Las franjas ${i} y ${j} se solapan.`);
      });
    }
    if (conflicts.schedule && conflicts.schedule.length) {
      const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      conflicts.schedule.forEach(item => {
        const schedIdx = item.schedule + 1;
        const dndIdx = item.dnd + 1;
        const dayName = days[item.day] || '';
        msgs.push(`La programación de limpieza ${schedIdx} empieza durante la franja ${dndIdx} (${dayName}): el robot empezará y LibreRoomba lo mandará a la base.`);
      });
    }
    if (msgs.length) {
      conflictsEl.classList.remove('hidden');
      conflictsEl.textContent = msgs.join(' ');
    } else {
      conflictsEl.classList.add('hidden');
      conflictsEl.textContent = '';
    }
  }

  function render() {
    if (!container) return;
    // clear
    while (container.firstChild) container.removeChild(container.firstChild);

    dndItems.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'schedule-row';

      // 1. Checkbox enabled
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!item.enabled;
      chk.setAttribute('aria-label', `Franja ${index + 1} activa`);
      chk.addEventListener('change', () => { item.enabled = chk.checked; });
      row.appendChild(chk);

      // 2. Select label
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Etiqueta');
      Object.keys(LABELS).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = LABELS[key];
        if (item.label === key) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => {
        item.label = sel.value;
        // toggle name input visibility
        if (nameInput) nameInput.style.display = (item.label === 'custom') ? '' : 'none';
      });
      row.appendChild(sel);

      // 3. Name input (only for custom)
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 30;
      nameInput.placeholder = 'Nombre';
      nameInput.setAttribute('aria-label', 'Nombre de la franja');
      nameInput.style.display = (item.label === 'custom') ? '' : 'none';
      nameInput.value = item.name || '';
      nameInput.addEventListener('input', () => { item.name = nameInput.value; });
      row.appendChild(nameInput);

      // 4. Day toggle buttons
      const daysContainer = document.createElement('span');
      daysContainer.className = 'schedule-days';
      DAY_MAP.forEach(d => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = d.label;
        btn.className = 'schedule-day-btn dnd-day';
        btn.setAttribute('aria-pressed', item.days && item.days.includes(d.val) ? 'true' : 'false');
        btn.addEventListener('click', () => {
          if (!Array.isArray(item.days)) item.days = [];
          const idx = item.days.indexOf(d.val);
          if (idx === -1) {
            item.days.push(d.val);
            btn.setAttribute('aria-pressed', 'true');
          } else {
            item.days.splice(idx, 1);
            btn.setAttribute('aria-pressed', 'false');
          }
          item.days.sort((a, b) => a - b);
        });
        daysContainer.appendChild(btn);
      });
      row.appendChild(daysContainer);

      // 5. Start time input
      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.setAttribute('aria-label', 'Hora de inicio');
      const sHour = item.start && typeof item.start.hour === 'number' ? item.start.hour : 0;
      const sMin = item.start && typeof item.start.min === 'number' ? item.start.min : 0;
      startInput.value = String(sHour).padStart(2, '0') + ':' + String(sMin).padStart(2, '0');
      startInput.addEventListener('change', () => {
        const parts = startInput.value.split(':');
        if (!item.start) item.start = { hour: 0, min: 0 };
        item.start.hour = parseInt(parts[0], 10) || 0;
        item.start.min = parseInt(parts[1], 10) || 0;
      });
      row.appendChild(startInput);

      // 6. End time input
      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.setAttribute('aria-label', 'Hora de fin');
      const eHour = item.end && typeof item.end.hour === 'number' ? item.end.hour : 0;
      const eMin = item.end && typeof item.end.min === 'number' ? item.end.min : 0;
      endInput.value = String(eHour).padStart(2, '0') + ':' + String(eMin).padStart(2, '0');
      endInput.addEventListener('change', () => {
        const parts = endInput.value.split(':');
        if (!item.end) item.end = { hour: 0, min: 0 };
        item.end.hour = parseInt(parts[0], 10) || 0;
        item.end.min = parseInt(parts[1], 10) || 0;
      });
      row.appendChild(endInput);

      // 7. Delete button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = 'Eliminar';
      delBtn.addEventListener('click', () => {
        dndItems.splice(index, 1);
        render();
      });
      row.appendChild(delBtn);

      container.appendChild(row);
    });
  }

  function onAddItem() {
    if (dndItems.length >= 10) {
      setMessage('Máximo 10 franjas de "No molestar" permitidas.', true);
      return;
    }
    dndItems.push({
      enabled: true,
      label: 'quiet',
      days: [1, 2, 3, 4, 5],
      start: { hour: 22, min: 0 },
      end: { hour: 7, min: 0 }
    });
    render();
  }

  function load() {
    fetch('/api/dnd')
      .then(res => {
        if (!res.ok) throw new Error('Error al cargar la configuración No molestar');
        return res.json();
      })
      .then(data => {
        dndItems = data.items || [];
        render();
        setStatus(data.active);
        renderConflicts(data.conflicts || {});
      })
      .catch(err => {
        setMessage(err instanceof TypeError ? 'No hay conexión con el servidor de LibreRoomba.' : err.message, true);
      });
  }

  function onSave() {
    setMessage('Guardando...', false);
    fetch('/api/dnd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: dndItems })
    })
      .then(res => res.json().then(json => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          throw new Error(json.error || 'Error al guardar');
        }
        dndItems = json.items || [];
        render();
        setStatus(json.active);
        renderConflicts(json.conflicts || {});
        setMessage('Guardado.', false);
      })
      .catch(err => {
        setMessage(err instanceof TypeError ? 'No hay conexión con el servidor de LibreRoomba.' : err.message || 'Error al guardar', true);
      });
  }

  // Attach event listeners
  const addBtn = document.getElementById('dnd-add');
  if (addBtn) addBtn.addEventListener('click', onAddItem);
  const saveBtn = document.getElementById('dnd-save');
  if (saveBtn) saveBtn.addEventListener('click', onSave);

  // expose refresh
  window.lrDndRefresh = function () { load(); };
  window.addEventListener('lr-notification', function (e) {
    if (e.detail && String(e.detail.type).startsWith('dnd')) {
      window.lrDndRefresh();
    }
  });

  // initial load
  load();
})();
