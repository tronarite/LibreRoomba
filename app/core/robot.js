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

// Eventos: 'state' (delta reportado), 'connected' (booleano), 'error' (Error MQTT, informativo).
class RobotCore extends EventEmitter {
  // connect(url, options) => cliente tipo mqtt.js; se inyecta en pruebas y en el modo simulado.
  constructor({ ip, blid, password, connect = defaultConnect, experimental = false, reconnect = { min: 1000, max: 30000 } } = {}) {
    super();
    Object.assign(this, { ip, blid, password, experimental });
    this._connectFn = connect;
    this._backoff = { ...reconnect, delay: reconnect.min };
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
      this._setConnected(true);
      client.subscribe('#');
    });
    client.on('message', (_topic, payload) => {
      try {
        const message = JSON.parse(payload.toString());
        if (message && message.state && message.state.reported) this._apply(message.state.reported);
      } catch (_) { /* topics sin JSON de estado */ }
    });
    client.on('close', () => { this._setConnected(false); this._scheduleReconnect(); });
    client.on('error', (error) => { this._setConnected(false); this.emit('error', error); });
  }

  _scheduleReconnect() {
    if (this._stopped || this._timer) return;
    const delay = this._backoff.delay;
    this._backoff.delay = Math.min(delay * 2, this._backoff.max);
    this._timer = setTimeout(() => { if (!this._stopped) this._open(); }, delay);
    if (this._timer.unref) this._timer.unref();
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
    this._publish('cmd', { command: name, time: Math.floor(Date.now() / 1000), initiator: 'localApp' });
  }

  setPref(key, value) {
    if (policy.BLOCKED_KEYS.has(key) || !Object.hasOwn(policy.PREFS, key) || !policy.PREFS[key](value)) throw new RobotError('Ajuste no válido', 'invalid');
    const transform = policy.PREF_TRANSFORM[key];
    this._publish('delta', { state: { [key]: transform ? transform(value) : value } });
  }

  _requireExperimental() {
    if (!this.experimental) throw new RobotError('Funciones experimentales desactivadas (LIBREROOMBA_EXPERIMENTAL=1)', 'forbidden');
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
