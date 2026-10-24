(function () {
  const body = document.querySelector('#history-body');
  if (!body) return;
  const cell = (text) => { const td = document.createElement('td'); td.textContent = text; return td; };
  const m2 = (sqft) => (Number.isFinite(sqft) ? `${(sqft * 0.0929).toFixed(1)} m²` : '—');

  async function load() {
    try {
      const response = await fetch('/api/history');
      if (!response.ok) return;
      const missions = await response.json();
      body.replaceChildren();
      if (!missions.length) {
        const row = document.createElement('tr'); const td = cell('Aún no hay misiones registradas.'); td.colSpan = 5; row.append(td); body.append(row);
        return;
      }
      for (const mission of missions) {
        const row = document.createElement('tr');
        if (mission.unobserved) {   // misiones ocurridas con el servidor apagado: solo se sabe cuántas
          const td = cell(`${new Date(mission.detectedAt).toLocaleString('es-ES')}: ${mission.count} misión(es) sin registrar (el servidor estaba apagado)`); td.colSpan = 5; row.append(td); body.append(row); continue;
        }
        const bat = `${mission.batStart ?? '—'}% → ${mission.batEnd ?? '—'}%`;
        const cycle = mission.errorFinal ? `${mission.cycle || '—'} (Error ${mission.errorFinal})` : mission.cycle || '—';
        row.append(cell(new Date(mission.startedAt).toLocaleString('es-ES')), cell(`${mission.durationMin ?? '—'} min`), cell(cycle), cell(bat), cell(m2(mission.sqftDelta)));
        body.append(row);
      }
    } catch (_) {
      // Sin conexión con el servidor: se reintenta en el siguiente ciclo.
    }
  }
  load();
  setInterval(load, 30000);
})();
