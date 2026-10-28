// Salud de piezas. Fuente principal: contadores locales (/api/parts, horas del robot, sin nube). La nube de iRobot (/api/cloud/parts) es solo un dato extra.
(function () {
  const body = document.querySelector('#parts-body');
  if (!body) return;
  const LABEL = { bien: 'Bien', pronto: 'Cambiar pronto', agotada: 'Agotada', desconocido: 'Sin datos', 'sin configurar': 'Sin configurar' };
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };

  async function send(id, change) {
    const response = await fetch(`/api/parts/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { note.textContent = data.error || 'No se pudo guardar.'; return; }
    note.textContent = '';
    load();
  }

  function localRow(part) {
    const li = el('li', '', `part part-${part.status === 'sin configurar' ? 'desconocido' : part.status}`);
    const detail = part.usedHours === null ? ' — indica cuántas horas lleva usada o márcala como recién cambiada' : `: quedan ${part.remainingHours} h de ${part.lifeHours} h (usadas ${part.usedHours} h)`;
    li.append(el('strong', part.name), el('span', ` — ${LABEL[part.status] || part.status}${detail} `));
    const replaced = el('button', 'Cambiada', 'secondary'); replaced.type = 'button';
    replaced.setAttribute('aria-label', `Marcar ${part.name} como recién cambiada`);
    replaced.addEventListener('click', () => send(part.id, { action: 'replace' }));
    const used = el('button', 'Fijar horas usadas', 'secondary'); used.type = 'button';
    used.addEventListener('click', () => {
      const value = window.prompt(`Horas que lleva usada: ${part.name}`, part.usedHours === null ? '0' : String(part.usedHours));
      if (value !== null && value.trim() !== '') send(part.id, { usedHours: Number(value.replace(',', '.')) });
    });
    li.append(replaced, used);
    return li;
  }

  let note;
  async function load() {
    try {
      const response = await fetch('/api/parts');
      const data = await response.json();
      body.replaceChildren();
      const list = el('ul', '', 'parts');
      for (const part of data.parts) list.append(localRow(part));
      note = el('p', '', 'hint'); note.setAttribute('role', 'status');
      body.append(list, note);
      body.append(el('p', data.runHours === null ? 'El robot todavía no ha informado de sus horas de funcionamiento.' : `Horas de funcionamiento del robot: ${data.runHours} h. Contadores calculados en local; no dependen de la nube de iRobot.`, 'hint'));
      loadCloud();
    } catch (_) { /* sin servidor: se reintenta en el siguiente ciclo */ }
  }

  // Dato extra, solo si hay sesión de nube
  async function loadCloud() {
    try {
      const response = await fetch('/api/cloud/parts');
      if (!response.ok) return;
      const data = await response.json();
      if (!data.known.length) return;
      const box = el('details'); box.append(el('summary', 'Contadores de la nube de iRobot (opcional)'));
      const list = el('ul', '', 'parts');
      for (const part of data.known) {
        const li = el('li', '', `part part-${part.status}`);
        li.append(el('strong', part.name), el('span', ` — ${LABEL[part.status] || part.status}` + (part.remainingHours !== null ? `: quedan ${part.remainingHours} h` : '')));
        list.append(li);
      }
      box.append(list); body.append(box);
    } catch (_) { /* nube no disponible: no pasa nada */ }
  }
  load();
  setInterval(load, 10 * 60 * 1000);
})();
