const phases = { charge: 'Cargando', run: 'Limpiando', hmUsrDock: 'Volviendo a la base', stop: 'Detenida', pause: 'En pausa', evac: 'Vaciando depósito', stuck: 'Atascada' };
const buttons = [...document.querySelectorAll('[data-command]')];
const PREF_KEYS = ['twoPass', 'binPause', 'openOnly', 'childLock', 'rankOverlap', 'ecoCharge', 'schedHold', 'binTypeDetect', 'name'];
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
  for (const key of PREF_KEYS) {
    const input = document.querySelector(`#pref-${key}`); const value = data.prefs?.[key];
    input.disabled = !data.connected || value === undefined;
    if (document.activeElement !== input && value !== undefined) { if (input.type === 'checkbox') input.checked = !!value; else input.value = String(value); }
  }
  const enabled = { start: ['charge', 'stop'].includes(phase), pause: phase === 'run', resume: ['stop', 'pause'].includes(phase), stop: ['run', 'pause'].includes(phase), dock: ['run', 'stop', 'pause'].includes(phase), find: true };
  buttons.forEach((button) => button.disabled = !data.connected || !enabled[button.dataset.command]);
  renderInfo(data); renderExperimental(data);
}

let toastTimer;
function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message; toast.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), 6000);
}
// POST JSON; si falla, avisa con el motivo que da el servidor (p. ej. "Robot desconectado")
async function post(url, body, fallback) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error || fallback); }
  } catch (error) { notify(error instanceof TypeError ? 'No hay conexión con el servidor de LibreRoomba.' : error.message || fallback); }
}
const command = (command) => post('/api/cmd', { command }, 'No se pudo enviar el comando.');
const setPref = (key, value) => post('/api/pref', { key, value }, 'No se pudo cambiar el ajuste.');

function renderInfo(data) {
  const info = data.info || {};
  const rows = [['Versión del software', data.softwareVer], ['SKU', info.sku], ['País', info.country], ['Zona horaria', info.timezone], ['Idioma de voz', info.language],
    ['Idiomas instalados', info.languagesAvailable?.join(', ')], ['Firmware de la base', info.dockFirmware], ['Entorno de nube', info.cloudEnv], ['Vaciado automático', info.evacAllowed === undefined ? undefined : info.evacAllowed ? 'Permitido' : 'No permitido'],
    ['Señal Wi‑Fi', Number.isFinite(data.rssi) ? `${data.rssi} dBm` : undefined]];
  const list = document.querySelector('#info-body'); list.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value === undefined || value === '' ? '—' : String(value);
    list.append(dt, dd);
  }
}
const expKeys = [...document.querySelectorAll('[data-exp-key]')];
const expButtons = [...document.querySelectorAll('[data-exp-command]')];
function renderExperimental(data) {
  document.querySelector('#experimental').classList.toggle('hidden', !data.experimental);
  for (const input of expKeys) {
    const value = data.experimentalPrefs?.[input.dataset.expKey];
    input.disabled = !data.connected;
    if (document.activeElement !== input && value !== undefined) { if (input.type === 'checkbox') input.checked = !!value; else input.value = String(value); }
  }
  expButtons.forEach((button) => button.disabled = !data.connected);
}
expKeys.forEach((input) => input.addEventListener('change', () => post('/api/experimental/pref', { key: input.dataset.expKey, value: input.type === 'checkbox' ? input.checked : Number(input.value) }, 'No se pudo cambiar el ajuste experimental.')));
expButtons.forEach((button) => button.addEventListener('click', () => post('/api/experimental/cmd', { command: button.dataset.expCommand }, 'No se pudo enviar el comando experimental.')));
for (const key of PREF_KEYS) {
  const input = document.querySelector(`#pref-${key}`);
  input.addEventListener('change', () => setPref(key, input.type === 'checkbox' ? input.checked : input.type === 'text' ? input.value : Number(input.value)));
}
buttons.forEach((button) => button.addEventListener('click', () => command(button.dataset.command)));
function connect() { const protocol = location.protocol === 'https:' ? 'wss' : 'ws'; const ws = new WebSocket(`${protocol}://${location.host}/ws`); ws.onmessage = (event) => render(JSON.parse(event.data)); ws.onclose = () => setTimeout(connect, 1500); }
connect();
