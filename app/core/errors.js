// Descripción de los códigos de error del robot (cleanMissionStatus.error), con los textos de la app oficial (error-table.json,
// generada por research/tools/extract-errors.js desde el APK). Sin código conocido devuelve un texto claro en vez de inventar.
const table = require('./error-table.json').errors;

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

module.exports = { describe, count: Object.keys(table).length };
