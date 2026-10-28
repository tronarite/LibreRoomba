// Detector de eventos a partir de los cambios del estado del robot (RobotCore emite 'state', 'connected', 'auth-failed', 'auth-recovered').
// Solo notifica TRANSICIONES entre valores ya vistos: el estado inicial (o el que llega al reconectar sin cambios) no genera avisos.
// Cada tipo lleva su antirrebote (cooldown) para no repetir el mismo aviso. Los eventos se guardan en memoria (los últimos `max`).
const EventEmitter = require('events');
const { describe, describeNotReady, describeDock } = require('./errors');

const ACTIVE = new Set(['run', 'hmMidMsn', 'hmPostMsn', 'hmUsrDock']);   // fases en las que hay una misión en curso
// Antirrebote por tipo (ms); lo no listado usa cooldownMs. Misión terminada/detenida no se repite nunca porque ya depende de una transición.
const COOLDOWNS = { 'mission-finished': 0, 'mission-stopped': 0, 'robot-reconnected': 0, 'auth-recovered': 0, 'dnd-started': 0, 'dnd-ended': 0 };

class Notifier extends EventEmitter {
  // notReadyGraceMs: el motivo de «no puede empezar» debe durar esto para avisar (al parar, el robot pasa ~2 s en 39 «guardando el mapa»,
  // y al levantarlo para limpiarlo cambia varias veces seguidas: probado con el robot real el 2026-10-28)
  constructor(core, { lowBattery = 15, rearmBattery = 20, cooldownMs = 60000, disconnectGraceMs = 5000, notReadyGraceMs = 5000, missionStopGraceMs = 15000, max = 50, now = Date.now, lang = 'es', authHelp = '' } = {}) {
    super();
    Object.assign(this, { core, lowBattery, rearmBattery, cooldownMs, disconnectGraceMs, notReadyGraceMs, missionStopGraceMs, max, now, lang, authHelp });
    this._notReadyTimer = null;
    this._stopTimer = null;
    this._events = [];
    this._seq = 0;
    this._last = new Map();          // tipo[:clave] -> instante del último aviso
    this._prev = {};                 // últimos valores vistos
    this._missionSeen = false;
    this._missionStart = null;
    this._batArmed = null;           // null = aún no sabemos
    this._everConnected = false;
    this._disconnectTimer = null;
    this._disconnectNotified = false;
    core.on('state', () => this._onState());
    core.on('connected', (value) => this._onConnected(value));
    core.on('auth-failed', () => this._emit('auth-failed', 'error', 'Contraseña rechazada', this.authHelp || 'El robot no acepta la contraseña guardada.', {}));
    core.on('auth-recovered', () => this._emit('auth-recovered', 'info', 'Contraseña aceptada', 'El robot vuelve a aceptar la contraseña.', {}));
  }

  list() { return this._events.slice().reverse(); }   // más reciente primero

  // Avisos de otros módulos (p. ej. No molestar), con el mismo antirrebote por tipo
  notify(type, severity, title, message, data = {}) { return this._emit(type, severity, title, message, data); }

  stop() { clearTimeout(this._disconnectTimer); this._disconnectTimer = null; clearTimeout(this._notReadyTimer); this._notReadyTimer = null; clearTimeout(this._stopTimer); this._stopTimer = null; }

  _robotName() { return (this.core.state && this.core.state.name) || (this.lang === 'en' ? 'The robot' : 'El robot'); }

  _emit(type, severity, title, message, data = {}, key = '') {
    const cooldown = Object.hasOwn(COOLDOWNS, type) ? COOLDOWNS[type] : this.cooldownMs;
    const id = key ? `${type}:${key}` : type;
    const t = this.now();
    if (cooldown > 0 && this._last.has(id) && t - this._last.get(id) < cooldown) return null;
    this._last.set(id, t);
    const event = { id: ++this._seq, type, severity, title, message, at: new Date(t).toISOString(), data };
    this._events.push(event);
    if (this._events.length > this.max) this._events.shift();
    this.emit('event', event);
    return event;
  }

  _onState() {
    const s = this.core.state || {};
    const mission = s.cleanMissionStatus || {};
    const cur = { binFull: s.bin && s.bin.full, phase: mission.phase, cycle: mission.cycle, error: mission.error, bat: s.batPct, notReady: mission.notReady, dock: s.dock && s.dock.state };
    const prev = this._prev;
    const name = this._robotName();

    // Misión: se da por observada si vemos la fase 'run' (aunque ya estuviera en curso al arrancar)
    if (cur.phase === 'run' && !this._missionSeen) { this._missionSeen = true; this._missionStart = prev.phase === undefined ? null : this.now(); }
    if (this._missionSeen && prev.phase !== undefined && cur.phase !== prev.phase) {
      if (cur.phase === 'charge') {
        const minutes = this._missionStart === null ? null : Math.max(0, Math.round((this.now() - this._missionStart) / 60000));
        this._emit('mission-finished', 'info', 'Misión terminada', `${name} ha terminado de limpiar y está en la base.` + (minutes === null ? '' : ` Duración aproximada: ${minutes} min.`), { minutes });
        this._missionSeen = false; this._missionStart = null;
      } else if (cur.phase === 'stop' && cur.cycle === 'none' && ACTIVE.has(prev.phase)) {
        // «Base» durante una limpieza pasa por stop (la i1+ ignora dock en run): solo es «detenida» si sigue parado pasado el margen
        clearTimeout(this._stopTimer);
        this._stopTimer = setTimeout(() => {
          this._stopTimer = null;
          const m = (this.core.state || {}).cleanMissionStatus || {};
          if (!this._missionSeen || m.phase !== 'stop') return;
          this._emit('mission-stopped', 'info', 'Misión detenida', `${this._robotName()} se ha detenido y no está en la base.`, {});
          this._missionSeen = false; this._missionStart = null;
        }, this.missionStopGraceMs);
        if (this._stopTimer.unref) this._stopTimer.unref();
      }
    }

    // Error del robot (solo si cambia a un código distinto de 0 desde un valor ya visto)
    let reportedError = false;
    if (Number.isInteger(cur.error) && cur.error !== 0 && prev.error !== undefined && cur.error !== prev.error) {
      const d = describe(cur.error, this.lang, { robot: name });
      this._emit('robot-error', 'error', d.title, d.message || d.title, { code: cur.error, name: d.name, known: d.known }, String(cur.error));
      reportedError = true;
    }
    // Atasco: fase 'stuck' que antes no estaba (si ya hubo un error en el mismo cambio, el aviso de error basta)
    if (cur.phase === 'stuck' && prev.phase !== undefined && prev.phase !== 'stuck' && !reportedError) {
      this._emit('robot-stuck', 'warning', 'Robot atascado', `${name} está atascado y necesita ayuda.`, {});
    }

    // El robot no puede empezar (notReady pasa a un código distinto de 0): texto del rechazo de la app ("Start-Refuse N")
    // Solo si el motivo sigue igual pasados notReadyGraceMs
    if (prev.notReady !== undefined && cur.notReady !== prev.notReady) {
      clearTimeout(this._notReadyTimer);
      this._notReadyTimer = null;
      if (Number.isInteger(cur.notReady) && cur.notReady !== 0) {
        const code = cur.notReady;
        this._notReadyTimer = setTimeout(() => {
          this._notReadyTimer = null;
          const now = ((this.core.state || {}).cleanMissionStatus || {}).notReady;
          if (now !== code) return;
          const d = describeNotReady(code, this.lang, { robot: this._robotName() });
          this._emit('not-ready', 'warning', d.title, d.message || d.title, { notReady: code, code: d.code, name: d.name, known: d.known }, String(code));
        }, this.notReadyGraceMs);
        if (this._notReadyTimer.unref) this._notReadyTimer.unref();
      }
    }
    // Error de la base (dock.state 350-365, p. ej. bolsa llena u obstrucción)
    if (Number.isInteger(cur.dock) && cur.dock >= 350 && prev.dock !== undefined && cur.dock !== prev.dock) {
      const d = describeDock(cur.dock, this.lang);
      this._emit('dock-error', 'warning', `Clean Base: ${d.title}`, d.message || d.title, { code: cur.dock, name: d.name, known: d.known }, String(cur.dock));
    }

    // Depósito lleno: false -> true
    if (cur.binFull === true && prev.binFull === false) {
      this._emit('bin-full', 'warning', 'Depósito lleno', `El depósito de ${name} está lleno: vacíalo para seguir limpiando.`, {});
    }

    // Batería baja con rearme (histéresis): avisa al cruzar el umbral y no vuelve a avisar hasta cargar o subir de `rearmBattery`
    if (Number.isFinite(cur.bat)) {
      if (this._batArmed === null) this._batArmed = cur.bat >= this.lowBattery;   // si ya arrancamos por debajo, no avisamos hasta que se recupere
      if (cur.phase === 'charge' || cur.bat >= this.rearmBattery) this._batArmed = true;
      else if (this._batArmed && cur.bat < this.lowBattery) {
        this._emit('battery-low', 'warning', 'Batería baja', `${name} tiene ${cur.bat} % de batería y no está cargando.`, { batPct: cur.bat });
        this._batArmed = false;
      }
    }

    for (const key of Object.keys(cur)) if (cur[key] !== undefined) prev[key] = cur[key];
  }

  _onConnected(value) {
    if (value) {
      clearTimeout(this._disconnectTimer);
      this._disconnectTimer = null;
      if (this._disconnectNotified) {
        this._disconnectNotified = false;
        this._emit('robot-reconnected', 'info', 'Robot reconectado', `${this._robotName()} vuelve a estar conectado.`, {});
      }
      this._everConnected = true;
      return;
    }
    if (!this._everConnected || this._disconnectTimer) return;   // sin conexión previa no hay nada que avisar
    this._disconnectTimer = setTimeout(() => {
      this._disconnectTimer = null;
      this._disconnectNotified = true;
      this._emit('robot-disconnected', 'warning', 'Robot desconectado', `Se ha perdido la conexión con ${this._robotName()}.`, {});
    }, this.disconnectGraceMs);
    if (this._disconnectTimer.unref) this._disconnectTimer.unref();
  }
}

module.exports = { Notifier };
