// Aplica las franjas de No molestar sobre el robot, con la semántica de la app oficial:
// - al EMPEZAR una franja, la misión en curso termina (el robot vuelve a la base);
// - una misión de la programación (initiator 'schedule') que arranca desde la base durante la franja se manda a la base
//   (la programación vive en el robot y no se puede impedir que empiece, solo terminarla en cuanto se ve);
// - una misión iniciada por el usuario (botón 'manual', 'localApp', 'rmtApp') durante la franja se respeta;
// - los sonidos del robot no se pueden silenciar (no hay orden local conocida).
// Evento 'change' (franja activa o null) al entrar, salir o pasar a otra franja.
// Solo actúa en TRANSICIONES: arrancar el servidor o reconectar en mitad de una franja con una misión en curso no hace nada.
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

  tick() {
    const hit = this.active();
    const was = this._active;
    this._active = hit;
    if (!this._initialized) { this._initialized = true; return; }
    if (!!hit !== !!was || (hit && was && hit.index !== was.index)) this.emit('change', hit);   // el servidor reenvía el resumen (banner)
    if (hit && !was) {
      this.notify('dnd-started', 'info', `${hit.label} está activo`, `No molestar hasta las ${hit.until}: la programación no limpiará y las misiones en curso terminan.`, { label: hit.label, until: hit.until });
      const mission = (this.core.state && this.core.state.cleanMissionStatus) || {};
      if (RUNNING(mission)) this._dock('dnd-ended-mission', 'Misión terminada por No molestar', `Empieza «${hit.label}»: el robot vuelve a la base.`, hit);
    } else if (!hit && was) {
      this.notify('dnd-ended', 'info', 'No molestar terminado', `«${was.label}» ha terminado.`, { label: was.label });
    }
  }

  _onState() {
    const mission = (this.core.state && this.core.state.cleanMissionStatus) || {};
    const prev = this._prevPhase;
    if (mission.phase !== undefined) this._prevPhase = mission.phase;
    if (prev !== 'charge' || mission.phase !== 'run' || mission.initiator !== 'schedule') return;
    const hit = this.active();
    if (hit) this._dock('dnd-blocked-schedule', 'Programación bloqueada por No molestar', `La programación ha empezado durante «${hit.label}» (hasta las ${hit.until}): el robot vuelve a la base.`, hit);
  }

  // El antirrebote evita un bucle limpiar -> base si algo vuelve a arrancar el robot enseguida
  _dock(type, title, message, hit) {
    const t = this.now();
    if (t - this._lastDock < this.cooldownMs) return;
    this._lastDock = t;
    try {
      this.core.command('dock');
      this.notify(type, 'warning', title, message, { label: hit.label, until: hit.until });
    } catch (error) {
      this.notify('dnd-dock-failed', 'error', 'No molestar: no se pudo mandar el robot a la base', error.message, { label: hit.label });
    }
  }
}

module.exports = { DndGuard };
