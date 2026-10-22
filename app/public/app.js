const phases = { charge: 'Cargando', run: 'Limpiando', hmUsrDock: 'Volviendo a la base', stop: 'Detenida', pause: 'En pausa', evac: 'Vaciando depósito', stuck: 'Atascada' };
const buttons = [...document.querySelectorAll('[data-command]')];
let current = {};

function render(data) {
  current = data;
  document.querySelector('#name').textContent = data.name || 'Roomba i1+';
  const phase = data.phase || 'desconocida';
  document.querySelector('#phase').textContent = phases[phase] || phase;
  const battery = Number.isFinite(data.batPct) ? data.batPct : 0;
  document.querySelector('#battery-value').textContent = Number.isFinite(data.batPct) ? `${battery}%` : '—';
  document.querySelector('#battery-bar').style.width = `${Math.max(0, Math.min(100, battery))}%`;
  const connection = document.querySelector('#connection');
  connection.textContent = data.connected ? 'Conectada' : 'Desconectada'; connection.classList.toggle('online', !!data.connected);
  const error = document.querySelector('#error'); const hasError = data.error && data.error !== 0;
  error.textContent = hasError ? `Error del robot: ${data.error}` : ''; error.classList.toggle('hidden', !hasError);
  document.querySelector('#bin').classList.toggle('hidden', !data.bin?.full);
  for (const key of ['twoPass', 'binPause', 'openOnly', 'childLock', 'rankOverlap']) {
    const input = document.querySelector(`#pref-${key}`); const value = data.prefs?.[key];
    input.disabled = !data.connected || value === undefined;
    if (document.activeElement !== input && value !== undefined) { if (input.type === 'checkbox') input.checked = !!value; else input.value = String(value); }
  }
  const enabled = { start: ['charge', 'stop'].includes(phase), pause: phase === 'run', resume: ['stop', 'pause'].includes(phase), stop: ['run', 'pause'].includes(phase), dock: ['run', 'stop', 'pause'].includes(phase), find: true };
  buttons.forEach((button) => button.disabled = !data.connected || !enabled[button.dataset.command]);
}

async function command(command) {
  try { const response = await fetch('/api/cmd', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ command }) }); if (!response.ok) throw new Error(); }
  catch (_) { alert('No se pudo enviar el comando.'); }
}
async function setPref(key, value) {
  try { const response = await fetch('/api/pref', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ key, value }) }); if (!response.ok) throw new Error(); }
  catch (_) { alert('No se pudo cambiar el ajuste.'); }
}
for (const key of ['twoPass', 'binPause', 'openOnly', 'childLock', 'rankOverlap']) {
  const input = document.querySelector(`#pref-${key}`);
  input.addEventListener('change', () => setPref(key, input.type === 'checkbox' ? input.checked : Number(input.value)));
}
buttons.forEach((button) => button.addEventListener('click', () => command(button.dataset.command)));
function connect() { const protocol = location.protocol === 'https:' ? 'wss' : 'ws'; const ws = new WebSocket(`${protocol}://${location.host}/ws`); ws.onmessage = (event) => render(JSON.parse(event.data)); ws.onclose = () => setTimeout(connect, 1500); }
connect();
