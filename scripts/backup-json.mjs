// JSON de PostgreSQL puede contener numeric/bigint que Number redondearía.
// Sólo el parser crea esta clase: un objeto del archivo no puede suplantarla.
class ExactNumber {
  constructor(raw) { this.raw = raw; }
}
const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

export function parseBackupJson(text) {
  let offset = 0;
  const whitespace = () => { while (/[\x20\x09\x0a\x0d]/.test(text[offset] || '') && offset < text.length) offset++; };
  const fail = () => { throw new Error('JSON de respaldo inválido'); };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === '\\') { offset += 2; continue; }
      if (text[offset++] === '"') return JSON.parse(text.slice(start, offset));
    }
    return fail();
  };
  const value = (depth) => {
    if (depth > 128) throw new Error('JSON de respaldo demasiado profundo');
    whitespace();
    const char = text[offset];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      const array = char === '[';
      const result = array ? [] : Object.create(null);
      const end = array ? ']' : '}';
      offset++; whitespace();
      if (text[offset] === end) { offset++; return result; }
      while (offset < text.length) {
        if (array) result.push(value(depth + 1));
        else {
          whitespace(); if (text[offset] !== '"') return fail();
          const key = string(); whitespace(); if (text[offset++] !== ':' || Object.hasOwn(result, key)) return fail();
          result[key] = value(depth + 1);
        }
        whitespace(); const separator = text[offset++];
        if (separator === end) return result;
        if (separator !== ',') return fail();
      }
      return fail();
    }
    for (const [literal, parsed] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(literal, offset)) { offset += literal.length; return parsed; }
    const raw = text.slice(offset).match(numberPattern)?.[0];
    if (!raw) return fail();
    offset += raw.length;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && String(numeric) === raw && (!Number.isInteger(numeric) || Number.isSafeInteger(numeric)) ? numeric : new ExactNumber(raw);
  };
  const result = value(0); whitespace(); if (offset !== text.length) return fail();
  return result;
}

export function stringifyBackupJson(value, depth = 0) {
  if (depth > 128) throw new Error('JSON de respaldo demasiado profundo');
  if (value instanceof ExactNumber) return value.raw;
  if (Array.isArray(value)) return '[' + value.map((v) => stringifyBackupJson(v, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).map((key) => JSON.stringify(key) + ':' + stringifyBackupJson(value[key], depth + 1)).join(',') + '}';
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Número no finito');
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Valor JSON no compatible');
  return serialized;
}

function canonicalNumber(raw) {
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  let digits = (match[2] + (match[3] || '')).replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = BigInt(match[4] || '0') - BigInt((match[3] || '').length);
  const stripped = digits.replace(/0+$/, ''); exponent += BigInt(digits.length - stripped.length); digits = stripped;
  return match[1] + digits + 'e' + exponent.toString();
}

// Claves FK numéricas con distinta escala deben seguir comparando iguales.
export function backupValuesKey(values) {
  const normalized = (value) => {
    if (value instanceof ExactNumber || typeof value === 'number') return ['number', canonicalNumber(value instanceof ExactNumber ? value.raw : String(value))];
    if (value === null) return ['null'];
    if (Array.isArray(value)) return ['array', value.map(normalized)];
    if (typeof value === 'object') return ['object', Object.keys(value).sort().map((key) => [key, normalized(value[key])])];
    return [typeof value, value];
  };
  return JSON.stringify(values.map(normalized));
}
