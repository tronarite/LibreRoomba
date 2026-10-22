(function () {
  const box = document.querySelector('#maintenance-body');
  if (!box) return;
  const show = (v, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);

  async function load() {
    try {
      const response = await fetch('/api/maintenance');
      if (!response.ok) return;
      const d = await response.json();
      const rows = [
        ['Batería', show(d.battery.pct, '%')],
        ['Ciclos de carga', show(d.battery.cycles)],
        ['Batería fabricada', show(d.battery.manufactureDate)],
        ['Horas en la base', show(d.battery.onDockHours, ' h')],
        ['Horas de uso', show(d.totals.runHours, ' h')],
        ['Área limpiada', show(d.totals.areaM2, ' m²')],
        ['Misiones (ok / canceladas / fallidas)', `${show(d.totals.missionsOk)} / ${show(d.totals.missionsCanceled)} / ${show(d.totals.missionsFailed)}`],
        ['Atascos', show(d.totals.stuckEvents)],
        ['Detecciones de borde', show(d.totals.cliffEvents)],
        ['Sobrecalentamientos', show(d.totals.overtemps)],
        ['Wi-Fi', d.wifi.rssi === null ? '—' : `${d.wifi.rssi} dBm (${d.wifi.quality})`],
        ['Firmware', show(d.firmware.software)]
      ];
      box.replaceChildren();
      for (const [label, value] of rows) {
        const row = document.createElement('div'); row.className = 'row';
        const a = document.createElement('span'); a.textContent = label;
        const b = document.createElement('strong'); b.textContent = value;
        row.append(a, b); box.append(row);
      }
    } catch (_) {
      // Se reintenta en el siguiente ciclo.
    }
  }
  load();
  setInterval(load, 60000);
})();
