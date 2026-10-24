// Avisos del robot: lista de los últimos eventos (GET /api/events + WebSocket) y, solo si el usuario lo activa, avisos del navegador.
(function () {
  const list = document.querySelector('#events-list');
  const empty = document.querySelector('#events-empty');
  const button = document.querySelector('#events-browser');
  const note = document.querySelector('#events-browser-msg');
  if (!list) return;
  const MAX = 50;
  const LABEL = { error: 'Error', warning: 'Aviso', info: 'Info' };
  const KEY = 'lr-browser-notifications';
  const seen = new Set();

  const stored = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } };
  const store = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* sin almacenamiento: vale para esta sesión */ } };

  function item(event) {
    const li = document.createElement('li');
    li.className = `event event-${event.severity}`;
    const head = document.createElement('strong');
    head.textContent = `${LABEL[event.severity] || 'Info'}: ${event.title}`;   // el texto lleva la gravedad: no depende solo del color
    const time = document.createElement('time');
    time.dateTime = event.at;
    time.textContent = new Date(event.at).toLocaleTimeString('es-ES');
    const text = document.createElement('span');
    text.textContent = event.message;
    li.append(head, ' ', time, document.createElement('br'), text);
    return li;
  }

  function add(event, { live }) {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    empty.classList.add('hidden');
    list.prepend(item(event));
    while (list.children.length > MAX) list.lastChild.remove();
    if (live && stored() && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(event.title, { body: event.message, tag: `lr-${event.id}`, silent: true }); } catch (_) { /* algunos navegadores no permiten constructor */ }
    }
  }

  async function load() {
    try {
      const response = await fetch('/api/events');
      if (!response.ok) return;
      for (const event of (await response.json()).reverse()) add(event, { live: false });   // la API devuelve el más reciente primero
    } catch (_) { /* sin servidor: el WebSocket reintenta */ }
  }

  function refreshButton() {
    if (!('Notification' in window)) return;
    button.hidden = false;
    const on = stored() && Notification.permission === 'granted';
    button.textContent = on ? 'Desactivar avisos del navegador' : 'Activar avisos del navegador';
    button.setAttribute('aria-pressed', String(on));
    note.textContent = Notification.permission === 'denied' ? 'El navegador tiene los avisos bloqueados para esta página.' : '';
  }

  button.addEventListener('click', async () => {
    if (stored() && Notification.permission === 'granted') { store(false); return refreshButton(); }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    store(permission === 'granted');
    refreshButton();
  });

  window.addEventListener('lr-notification', (e) => add(e.detail, { live: true }));
  refreshButton();
  load();
})();
