// Aplica las franjas de No molestar sobre el robot, con la semántica de la app oficial:
// - al EMPEZAR una franja (por la hora), la misión en curso termina (el robot vuelve a la base); si en ese momento el robot
//   no está conectado o la orden falla, se reintenta al recibir estado mientras siga la misma franja;
// - una misión de la programación (initiator 'schedule') que arranca desde la base durante la franja se manda a la base
//   (la programación vive en el robot y no se puede impedir que empiece, solo terminarla en cuanto se ve);
// - una misión iniciada por el usuario (botón 'manual', 'localApp', 'rmtApp') durante la franja se respeta;
// - los sonidos del robot no se pueden silenciar (no hay orden local conocida).
// Una misión que ya estaba en curso al arrancar el servidor, o al guardar una franja que cubre la hora actual (reset), se respeta;
// en cambio, un arranque de la programación visto por primera vez tras una reconexión sí se termina (es un arranque durante la franja).
// Evento 'change' (franja activa o null) al entrar, salir o pasar a otra franja.
const EventEmitter = require('events');
const { activeAt } = require('./dnd');

const RUNNING = (m) => m.phase === 'run' || (m.phase === 'stop' && !!m.cycle && m.cycle !== 'none');   // limpiando o en pausa

class DndGuard extends EventEmitter {
  // items(): franjas validadas; notify(type, severity, title, message, data): avisos (Notifier.notify)
  constructor(core, { items = () => [], now = Date.now, intervalMs = 30000, cooldownMs = 120000, notify = () => {} } = {}) {
    super();
    Object.assign(this, { core, items, now, intervalMs, cooldownMs, notify });
    this._initialized = false;
    this._active = null;
    this._pendingEnd = null;         // índice de la franja cuya misión aún hay que terminar (robot desconectado o orden fallida)
    this._lastDock = -Infinity;
    this._prevPhase = undefined;
    this._timer = null;
    this._onState = this._onState.bind(this);
  }

  start() {
    this.core.on('state', this._onState);
    this.tick();
    this._timer = setInterval(() => this.tick(), this.intervalMs);
    if (this._timer.unref) this._timer.unref();
    return this;
  }

  stop() {
    clearInterval(this._timer);
    this._timer = null;
    this.core.removeListener('state', this._onState);
  }

  active() { return activeAt(this.items(), new Date(this.now())); }

  // Tras guardar las franjas: toma la situación actual como punto de partida sin actuar (guardar no manda el robot a la base)
  reset() {
    const hit = this.active();
    this._active = hit;
    this._pendingEnd = null;
    this._initialized = true;
    this.emit('change', hit);
  }

  tick() {
    const hit = this.active();
    const was = this._active;
    this._active = hit;
    if (!this._initialized) { this._initialized = true; return; }
    if (!!hit !== !!was || (hit && was && hit.index !== was.index)) this.emit('change', hit);   // el servidor reenvía el resumen (banner)
    if (hit && !was) {
      this.notify('dnd-started', 'info', `${hit.label} está activo`, `No molestar hasta las ${hit.until}: la programación no limpiará y las misiones en curso terminan.`, { label: hit.label, until: hit.until });
      const mission = (this.core.state && this.core.state.cleanMissionStatus) || {};
      // Sin conexión el estado puede estar desfasado: se decide al llegar estado nuevo
      if (!this.core.connected) this._pendingEnd = hit.index;
      else if (RUNNING(mission)) this._endMission(hit);
    } else if (!hit) {
      this._pendingEnd = null;
      if (was) this.notify('dnd-ended', 'info', 'No molestar terminado', `«${was.label}» ha terminado.`, { label: was.label });
    }
  }

  _endMission(hit) {
    if (this._dock('dnd-ended-mission', 'Misión terminada por No molestar', `Empieza «${hit.label}»: el robot vuelve a la base.`, hit)) this._pendingEnd = null;
    else this._pendingEnd = hit.index;
  }

  _onState() {
    const mission = (this.core.state && this.core.state.cleanMissionStatus) || {};
    const prev = this._prevPhase;
    if (mission.phase !== undefined) this._prevPhase = mission.phase;
    if (this._pendingEnd !== null && this.core.connected) {
      const hit = this.active();
      if (!hit || hit.index !== this._pendingEnd) this._pendingEnd = null;
      else if (!RUNNING(mission)) { if (mission.phase !== undefined) this._pendingEnd = null; }   // ya no hay misión que terminar
      else return this._endMission(hit);
    }
    if (prev !== 'charge' || mission.phase !== 'run' || mission.initiator !== 'schedule') return;
    const hit = this.active();
    if (hit) this._dock('dnd-blocked-schedule', 'Programación bloqueada por No molestar', `La programación ha empezado durante «${hit.label}» (hasta las ${hit.until}): el robot vuelve a la base.`, hit);
  }

  // true si la orden salió. El antirrebote (solo tras una orden enviada) evita un bucle limpiar -> base si algo vuelve a arrancar el robot enseguida
  _dock(type, title, message, hit) {
    const t = this.now();
    if (t - this._lastDock < this.cooldownMs) return false;
    try {
      this.core.command('dock');
    } catch (error) {
      this.notify('dnd-dock-failed', 'error', 'No molestar: no se pudo mandar el robot a la base', `${error.message}. Se reintentará al reconectar mientras dure «${hit.label}».`, { label: hit.label });
      return false;
    }
    this._lastDock = t;
    this.notify(type, 'warning', title, message, { label: hit.label, until: hit.until });
    return true;
  }
}

module.exports = { DndGuard };
