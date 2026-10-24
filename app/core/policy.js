// Qué se le puede enviar al robot. Lista blanca única: cualquier capa (web, scripts, tests) pasa por aquí.
// Solo entra lo verificado en el robot real (research/protocol-notes.md); lo demás va en EXPERIMENTAL_*.
const bool = (v) => typeof v === 'boolean';

const COMMANDS = new Set(['start', 'stop', 'pause', 'resume', 'dock', 'find', 'evac']);

// Ajustes aceptados por el topic `delta` (probados y restaurados).
const PREFS = {
  twoPass: bool, binPause: bool, openOnly: bool, childLock: bool, ecoCharge: bool, schedHold: bool, binTypeDetect: bool,
  rankOverlap: (v) => [15, 25, 67, 85].includes(v),
  name: (v) => typeof v === 'string' && /^[^\x00-\x1f]{1,20}$/.test(v.trim())
};
// El robot guarda binTypeDetect como 0/1 y el nombre sin espacios sobrantes.
const PREF_TRANSFORM = { binTypeDetect: (v) => Number(v), name: (v) => v.trim() };

// Sin probar (research/inventory/pending-robot-tests.md): solo con experimental activado.
const EXPERIMENTAL_PREFS = {
  odoaMode: bool,
  suctionLevel: (v) => Number.isInteger(v) && v >= 0 && v <= 3,
  chrgLrPtrn: (v) => Number.isInteger(v) && v >= 0 && v <= 3
};
const EXPERIMENTAL_COMMANDS = new Set();

// Nunca se envían desde LibreRoomba mientras el robot siga con la nube oficial (decisión del usuario).
const BLOCKED_KEYS = new Set(['cloudEnv', 'sdiscUrl', 'svcEndpoints', 'wlcfg', 'uap', 'wactivate', 'ntphosts']);

module.exports = { COMMANDS, PREFS, PREF_TRANSFORM, EXPERIMENTAL_PREFS, EXPERIMENTAL_COMMANDS, BLOCKED_KEYS };
