import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

const source = readFileSync(new URL('../src/utils/uuid.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { generarUuid } = module.exports;
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const cryptoDePrueba = value => Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
try {
  const native = '12345678-1234-4123-8123-123456789abc';
  cryptoDePrueba({ randomUUID: () => native });
  assert.equal(generarUuid(), native);
  console.log('OK usa randomUUID cuando está disponible');

  cryptoDePrueba({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  const ids = Array.from({ length: 100 }, () => generarUuid());
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(ids).size, ids.length);
  console.log('OK sin randomUUID genera identificadores UUID v4 válidos y distintos');

  cryptoDePrueba({ getRandomValues: bytes => { bytes.fill(255); return bytes; } });
  assert.equal(generarUuid(), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  cryptoDePrueba(undefined);
  assert.throws(generarUuid, /El navegador no permite generar/);
  console.log('OK versión, variante y error explicativo si no hay criptografía');
} finally {
  if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  else delete globalThis.crypto;
}
