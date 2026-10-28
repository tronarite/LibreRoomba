// Descripción de los códigos de error del robot (cleanMissionStatus.error), con los textos de la app oficial (error-table.json,
// generada por research/tools/extract-errors.js desde el APK). Sin código conocido devuelve un texto claro en vez de inventar.
const { errors: table, dock: dockTable } = require('./error-table.json');

const LANGS = new Set(['es', 'en']);
const DEFAULT_ROBOT = { es: 'El robot', en: 'The robot' };

// Parte el mensaje de la app en causa (primera frase) y acción (el resto). Es una división de texto, no un dato nuevo.
function splitMessage(message) {
  if (!message) return { cause: null, action: null };
  const match = /^(.+?[.!?])\s+(.+)$/.exec(message);
  return match ? { cause: match[1], action: match[2] } : { cause: message, action: null };
}

function fill(text, robot) {
  return text == null ? null : text.replace(/\{robot\}/g, robot).replace(/\{code\}/g, '');
}

function describe(code, lang = 'es', { robot } = {}) {
  const language = LANGS.has(lang) ? lang : 'es';
  const number = Number(code);
  if (code === null || code === undefined || code === '' || !Number.isInteger(number) || number < 0) {
    return { code: code ?? null, known: false, title: 'Código de error no válido', message: null, cause: null, action: null, push: null, name: null };
  }
  if (number === 0) return { code: 0, known: true, title: language === 'es' ? 'Sin error' : 'No error', message: null, cause: null, action: null, push: null, name: 'NO_ERROR' };
  const entry = table[number];
  if (!entry) {
    const title = language === 'es' ? `Error ${number}: sin descripción` : `Error ${number}: no description`;
    return { code: number, known: false, title, message: null, cause: null, action: null, push: null, name: null };
  }
  const name = robot || DEFAULT_ROBOT[language];
  const text = entry[language];
  const message = fill(text.message, name);
  return { code: number, known: true, name: entry.name, title: fill(text.title, name) || `Error ${number}`, message, ...splitMessage(message), push: fill(text.push, name) };
}

// cleanMissionStatus.notReady: motivo por el que el robot no empieza. N corresponde al código 200 + N de la app
// (RobotStatusResolver: STARTING_ERROR_* -> "Start-Refuse N"; MissionStatus.java traduce notReady al mismo enum). 0 = listo.
function describeNotReady(value, lang = 'es', options = {}) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isInteger(number) || number < 0) return null;
  if (number === 0) return { notReady: 0, ready: true, known: true, title: null, message: null, push: null, name: null };
  const d = describe(200 + number, lang, options);
  if (!d.known) d.title = (LANGS.has(lang) && lang === 'en') ? `The robot can't start (code ${number})` : `El robot no puede empezar (código ${number})`;
  return { ...d, notReady: number, ready: false };
}

// dock.state (com.irobot.core.DockState): 301 = base lista (visto en el robot real), 302-305 vaciado, 350-365 errores de la base.
// Solo 350-355 y 360 tienen texto en la app; el resto lleva una etiqueta propia de LibreRoomba (source: 'libreroomba').
const DOCK_LABELS = {
  es: { 300: 'Estado de la base desconocido', 301: 'Base lista', 302: 'Vaciando el depósito', 303: 'Vaciado completado', 304: 'Deteniendo el vaciado', 305: 'Actualizando la base' },
  en: { 300: 'Dock state unknown', 301: 'Dock ready', 302: 'Emptying the bin', 303: 'Emptying complete', 304: 'Stopping evacuation', 305: 'Updating the dock' }
};
function describeDock(value, lang = 'es') {
  const language = LANGS.has(lang) ? lang : 'es';
  const number = Number(value);
  if (value === null || value === undefined || !Number.isInteger(number)) return null;
  const entry = dockTable[number];
  const error = number >= 350;
  if (entry && entry[language].title) return { code: number, name: entry.name, error, known: true, source: 'app', title: entry[language].title, message: entry[language].message };
  const label = DOCK_LABELS[language][number];
  if (label) return { code: number, name: entry ? entry.name : null, error: false, known: true, source: 'libreroomba', title: label, message: null };
  const title = language === 'es' ? `Problema de la base (código ${number})` : `Dock problem (code ${number})`;
  return { code: number, name: entry ? entry.name : null, error, known: !!entry, source: 'libreroomba', title: error ? title : (language === 'es' ? `Estado de la base ${number}` : `Dock state ${number}`), message: null };
}

module.exports = { describe, describeNotReady, describeDock, count: Object.keys(table).length };
