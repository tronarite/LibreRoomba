// Núcleo de LibreRoomba: habla MQTT local con la Roomba y mantiene su estado. No sabe nada de HTTP.
// Errores con `code`: 'offline' (sin conexión), 'invalid' (valor/clave no permitidos), 'forbidden' (función cerrada).
const EventEmitter = require('events');
const constants = require('constants');
const policy = require('./policy');
const schedule = require('../schedule');

class RobotError extends Error {
  constructor(message, code) { super(message); this.name = 'RobotError'; this.code = code; }
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function defaultConnect(url, options) { return require('mqtt').connect(url, options); }

const AUTH_ERROR = /bad user ?name or password|not authori[sz]ed|identifier rejected/i;

// Eventos: 'state' (delta reportado), 'connected' (booleano), 'error' (Error MQTT, informativo),
// 'auth-failed' / 'auth-recovered' (el robot rechaza / vuelve a aceptar la contraseña), 'ip-changed' (descubrimiento).
class RobotCore extends EventEmitter {
  // connect(url, options) => cliente tipo mqtt.js; se inyecta en pruebas y en el modo simulado.
  // discover(): opcional, async () => ({ ip }) | null. Se usa tras `discoverAfter` conexiones fallidas seguidas para buscar la IP nueva.
  // reconnect.authMin/authMax: espera (ms) entre reintentos cuando el robot rechaza la contraseña (no tiene sentido insistir cada segundo).
  // dockWaitMs: tope de espera entre `stop` y `dock` cuando se manda a la base un robot que está limpiando;
  // dockSettleMs: tiempo que debe seguir parado y con notReady 0 antes del `dock`.
  constructor({ ip, blid, password, connect = defaultConnect, experimental = false, positionPolling = false, reconnect = {}, discover = null, discoverAfter = 3, dockWaitMs = 30000, dockSettleMs = 3000 } = {}) {
    super();
    Object.assign(this, { ip, blid, password, experimental, positionPolling });
    this._dockWaitMs = dockWaitMs;
    this._dockSettleMs = dockSettleMs;
    this._dockAfterStop = null;
    this._connectFn = connect;
    this._backoff = { min: 1000, max: 30000, authMin: 30000, authMax: 300000, ...reconnect };
    this._backoff.delay = this._backoff.min;
    this._discover = discover;
    this._discoverAfter = discoverAfter;
    this._failures = 0;
    this.authFailed = false;
    this.state = {};
    this.connected = false;
    this.lastUpdate = null;
    this._client = null;
    this._timer = null;
    this._stopped = true;
  }

  start() {
    this._stopped = false;
    this._open();
    return this;
  }

  stop() {
    this._stopped = true;
    clearTimeout(this._timer);
    this._timer = null;
    const client = this._client;
    this._client = null;
    if (client) { client.removeAllListeners('close'); client.end(true); }
    this._setConnected(false);
  }

  _open() {
    this._timer = null;
    const client = this._connectFn(`mqtts://${this.ip}:8883`, {
      clientId: this.blid, username: this.blid, password: this.password, protocolVersion: 4,
      rejectUnauthorized: false, ciphers: 'AES128-SHA256', secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
      minVersion: 'TLSv1', reconnectPeriod: 0
    });
    this._client = client;
    client.on('connect', () => {
      this._backoff.delay = this._backoff.min;
      this._failures = 0;
      this._setAuthFailed(false);
      this._setConnected(true);
      client.subscribe('#');
    });
    client.on('message', (topic, payload) => {
      this.emit('raw', { topic, text: payload.toString() });
      try {
        const message = JSON.parse(payload.toString());
        if (message && message.state && message.state.reported) this._apply(message.state.reported);
        else this._maybePosition(message);
      } catch (_) { /* topics sin JSON de estado */ }
    });
    client.on('close', () => { this._setConnected(false); this._scheduleReconnect(); });
    client.on('error', (error) => {
      if (AUTH_ERROR.test(String(error && error.message))) this._setAuthFailed(true);
      this._setConnected(false);
      this.emit('error', error);
    });
  }

  _scheduleReconnect() {
    if (this._stopped || this._timer) return;
    this._failures += 1;
    const b = this._backoff;
    // Con la contraseña rechazada el robot sí es alcanzable: espera larga (30 s, doblando hasta 5 min).
    const delay = this.authFailed ? Math.min(Math.max(b.delay, b.authMin), b.authMax) : b.delay;
    b.delay = Math.min(delay * 2, this.authFailed ? b.authMax : b.max);
    this._timer = setTimeout(async () => {
      if (this._stopped) return;
      if (this._shouldDiscover()) await this._rediscover();
      if (!this._stopped) this._open();
    }, delay);
    if (this._timer.unref) this._timer.unref();
  }

  _shouldDiscover() {
    return !!this._discover && !this.authFailed && this._failures >= this._discoverAfter;
  }

  async _rediscover() {
    this._failures = 0;
    try {
      const found = await this._discover();
      if (found && found.ip && found.ip !== this.ip) {
        const previous = this.ip;
        this.ip = found.ip;
        this.emit('ip-changed', { from: previous, to: found.ip });
      }
    } catch (_) { /* sin descubrimiento se sigue con la IP actual */ }
  }

  _setAuthFailed(value) {
    if (this.authFailed === value) return;
    this.authFailed = value;
    this.emit(value ? 'auth-failed' : 'auth-recovered');
  }

  // Tras renovar la contraseña (get-password): se prueba ya, sin esperar al reintento largo.
  setPassword(password) {
    this.password = password;
    if (this._stopped) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._backoff.delay = this._backoff.min;
    if (this._client) { this._client.removeAllListeners('close'); this._client.end(true); this._client = null; }
    this._open();
  }

  _apply(delta) {
    deepMerge(this.state, delta);
    this.lastUpdate = new Date().toISOString();
    this.emit('state', delta);
  }

  _setConnected(value) {
    if (this.connected === value) return;
    this.connected = value;
    this.emit('connected', value);
  }

  _publish(topic, body) {
    if (!this._client || !this.connected) throw new RobotError('Robot desconectado', 'offline');
    this._client.publish(topic, JSON.stringify(body));
  }

  command(name) {
    if (!policy.COMMANDS.has(name)) throw new RobotError('Comando no válido', 'invalid');
    const phase = this.state.cleanMissionStatus && this.state.cleanMissionStatus.phase;
    if (name === 'dock' && phase === 'run') return this._stopThenDock();
    this._publish('cmd', { command: name, time: Math.floor(Date.now() / 1000), initiator: 'localApp' });
  }

  // La i1+ ignora `dock` mientras limpia (probado 2026-10-28; dorita980: "before dock you need to pause() or stop()"):
  // se envía `stop` y, cuando el robot sale de `run` y lleva dockSettleMs con notReady 0, `dock` (como mucho a los dockWaitMs).
  // La espera hace falta: justo tras el stop el robot pasa ~2 s en notReady 39 (guardando el mapa) e ignora el dock (probado 2026-10-28).
  _stopThenDock() {
    this._publish('cmd', { command: 'stop', time: Math.floor(Date.now() / 1000), initiator: 'localApp' });
    if (this._dockAfterStop) return;   // ya hay un dock pendiente
    let settle = null;
    // Si tras el stop ya está cargando (la misión acababa de arrancar en la base), no se manda dock: en la base provoca un vaciado (probado)
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(settle);
      this.removeListener('state', onState);
      this._dockAfterStop = null;
      if ((this.state.cleanMissionStatus || {}).phase === 'charge') return;
      try { this._publish('cmd', { command: 'dock', time: Math.floor(Date.now() / 1000), initiator: 'localApp' }); } catch (error) { this.emit('error', error); }
    };
    const onState = () => {
      const m = this.state.cleanMissionStatus || {};
      clearTimeout(settle);
      settle = null;
      if (m.phase === 'charge') return finish();
      if (!m.phase || m.phase === 'run' || (m.notReady !== undefined && m.notReady !== 0)) return;
      settle = setTimeout(finish, this._dockSettleMs);
      if (settle.unref) settle.unref();
    };
    const timer = setTimeout(finish, this._dockWaitMs);
    if (timer.unref) timer.unref();
    this.on('state', onState);
    this._dockAfterStop = finish;
  }

  setPref(key, value) {
    if (policy.BLOCKED_KEYS.has(key) || !Object.hasOwn(policy.PREFS, key) || !policy.PREFS[key](value)) throw new RobotError('Ajuste no válido', 'invalid');
    const transform = policy.PREF_TRANSFORM[key];
    this._publish('delta', { state: { [key]: transform ? transform(value) : value } });
  }

  _requireExperimental() {
    if (!this.experimental) throw new RobotError('Funciones experimentales desactivadas (LIBREROOMBA_EXPERIMENTAL=1)', 'forbidden');
  }

  // Respuesta de posición (sin importar el topic, aún no se conoce): reqId + data.coords[{xyt:[x,y,theta], ts, pmap_id}]
  _maybePosition(message) {
    const coords = message && typeof message === 'object' && message.reqId !== undefined && message.data && message.data.coords;
    if (!Array.isArray(coords) || !coords.length) return;
    const xyt = coords[0] && coords[0].xyt;
    if (!Array.isArray(xyt) || xyt.length < 3 || !xyt.every(Number.isFinite)) return;
    this.position = { x: xyt[0], y: xyt[1], theta: xyt[2], ts: coords[0].ts, pmapId: coords[0].pmap_id, reqId: String(message.reqId), receivedAt: new Date().toISOString() };
    this.emit('position', this.position);
  }

  // Pide la posición actual al robot (solo lectura). Experimental: formato sin confirmar.
  requestPosition() {
    if (!this.experimental && !this.positionPolling) this._requireExperimental();   // solo lectura: la activa el servidor para el mapa propio
    this._positionSeq = (this._positionSeq || 0) + 1;
    const reqId = String(this._positionSeq);
    this._publish(policy.POSITION_TOPIC, { reqId, ...policy.POSITION_REQUEST });
    return reqId;
  }

  setExperimentalPref(key, value) {
    this._requireExperimental();
    if (policy.BLOCKED_KEYS.has(key) || !Object.hasOwn(policy.EXPERIMENTAL_PREFS, key) || !policy.EXPERIMENTAL_PREFS[key](value)) throw new RobotError('Ajuste no válido', 'invalid');
    this._publish('delta', { state: { [key]: value } });
  }

  experimentalCommand(name) {
    this._requireExperimental();
    if (!policy.EXPERIMENTAL_COMMANDS.has(name)) throw new RobotError('Comando no válido', 'invalid');
    this._publish('cmd', { command: name, time: Math.floor(Date.now() / 1000), initiator: 'localApp' });
  }

  setSchedule(items) {
    let valid;
    try { valid = schedule.validate(items); } catch (error) { throw new RobotError(error.message, 'invalid'); }
    if (schedule.conflicts(valid).length) throw new RobotError('Hay programaciones que coinciden en día y hora.', 'invalid');
    this._publish('delta', { state: { cleanSchedule2: valid } });
  }
}

module.exports = { RobotCore, RobotError, deepMerge };
