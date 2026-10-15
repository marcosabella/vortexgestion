import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in dependencies, `Dependencia inesperada: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const errors = load('src/utils/productoErrors.ts');
const constraints = [
  'ind_productos_comercio_cod_producto',
  'idx_productos_comercio_cod_producto',
  'productos_cod_producto_key',
];
for (const constraint of constraints) {
  assert.equal(errors.esCodigoProductoDuplicado({ code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` }), true);
}
for (const error of [null, {}, { code: '23505', message: 'productos_pkey' }, { code: '42501', message: constraints[0] }]) {
  assert.equal(errors.esCodigoProductoDuplicado(error), false);
}

const mutations = [];
const calls = [];
let response;
const query = {
  insert(payload) { calls.push(['insert', payload]); return this; },
  update(payload) { calls.push(['update', payload]); return this; },
  eq(field, value) { calls.push(['eq', field, value]); return this; },
  select() { return this; },
  single: async () => response,
};
const { useProductos } = load('src/hooks/useProductos.ts', {
  '@tanstack/react-query': {
    useQuery: () => ({ data: [] }),
    useQueryClient: () => ({}),
    useMutation: (options) => { mutations.push(options); return {}; },
  },
  '@/integrations/supabase/client': { supabase: { from: (table) => { assert.equal(table, 'productos'); return query; } } },
  '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
  '@/hooks/useComercio': { useComercio: () => ({ comercio: { id: 'comercio-autorizado' } }) },
  '@/utils/fetchMasterRecords': {},
  '@/utils/productoErrors': errors,
});
useProductos();
for (const [index, operation] of ['insert', 'update'].entries()) {
  const payload = { id: 'producto-1', cod_producto: 'ABC', comercio_id: 'otro-comercio' };
  for (const constraint of constraints) {
    response = { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` } };
    await assert.rejects(mutations[index].mutationFn(payload), (error) => error.message === errors.mensajeCodigoProductoDuplicado('ABC'));
  }
  const otherError = { code: '42501', message: 'Sin permiso' };
  response = { data: null, error: otherError };
  await assert.rejects(mutations[index].mutationFn(payload), (error) => error === otherError);
  response = { data: { id: 'nuevo-producto', cod_producto: 'ABC' }, error: null };
  assert.equal((await mutations[index].mutationFn(payload)).id, 'nuevo-producto');
  assert.ok(calls.some(([method]) => method === operation));
}
assert.ok(calls.filter(([method]) => method === 'insert').every(([, payload]) => payload[0].comercio_id === 'comercio-autorizado'));
assert.ok(calls.some(([method, field, value]) => method === 'eq' && field === 'comercio_id' && value === 'comercio-autorizado'));
console.log('OK: duplicados de código en alta/edición, otros errores, guardado exitoso y alcance del comercio (Supabase simulado).');
