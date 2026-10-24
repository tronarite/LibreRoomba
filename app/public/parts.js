(function () {
  const body = document.querySelector('#parts-body');
  if (!body) return;
  const LABEL = { bien: 'Bien', pronto: 'Cambiar pronto', agotada: 'Agotada', desconocido: 'Sin datos' };
  function row(part) {
    const li = document.createElement('li');
    li.className = `part part-${part.status}`;
    const name = document.createElement('strong'); name.textContent = part.name || `Pieza ${part.id}`;
    const info = document.createElement('span');
    info.textContent = ` — ${LABEL[part.status] || part.status}` + (part.remainingHours !== null ? `: quedan ${part.remainingHours} h` : '') + (part.usedHours !== null ? ` (usadas ${part.usedHours} h)` : '');
    li.append(name, info);
    return li;
  }
  async function load() {
    try {
      const response = await fetch('/api/cloud/parts');
      const data = await response.json();
      body.replaceChildren();
      if (!response.ok) { const p = document.createElement('p'); p.textContent = data.error || 'No se pudieron leer las piezas.'; body.append(p); return; }
      const list = document.createElement('ul'); list.className = 'parts';
      for (const part of data.known) list.append(row(part));
      body.append(list);
      if (data.other.length) { const small = document.createElement('p'); small.className = 'hint'; small.textContent = `Otros contadores sin nombre en la app: ${data.other.map((p) => p.id).join(', ')}.`; body.append(small); }
    } catch (_) { /* sin servidor: se reintenta en el siguiente ciclo */ }
  }
  load();
  setInterval(load, 10 * 60 * 1000);
})();
