// Ejecuta las consultas con un cliente simulado, sin conectarse a Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const queries = [];
const requests = [];
const supabase = {
  from(table) {
    const request = { table, filters: [] };
    requests.push(request);
    const builder = {
      select() { return builder; },
      eq(column, value) { request.filters.push([column, value]); return builder; },
      order() { return builder; },
      range() { return builder; },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
    };
    return builder;
  },
};
const dependencies = {
  '@tanstack/react-query': {
    useQuery(config) { queries.push(config); return { data: [], isLoading: false }; },
    useMutation: () => ({}),
    useQueryClient: () => ({}),
  },
  '@/integrations/supabase/client': { supabase },
  '@/hooks/useComercio': { useComercio: () => ({ comercio: { id: 'tenant' } }) },
  '@/hooks/use-toast': { useToast: () => ({}) },
  '@/hooks/useAfipConfig': { useAfipConfig: () => ({}) },
  '@/hooks/useEmisoresFiscales': {},
  '@/utils/legacyVisibility': { isLegacyDeletedClient: () => false, isLegacyDeletedClientName: () => false },
};
function load(file) {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in dependencies, `Dependencia no simulada: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const { useVentas } = load('../src/hooks/useVentas.ts');
useVentas({ ventaId: 'sale' });
const saleQuery = queries.at(-1);
await saleQuery.queryFn();
assert.deepEqual(requests.at(-1).filters, [['comercio_id', 'tenant'], ['id', 'sale']]);
useVentas();
assert.notDeepEqual(queries.at(-1).queryKey, saleQuery.queryKey);

const { useCuentaCorriente } = load('../src/hooks/useCuentaCorriente.ts');
const account = useCuentaCorriente({ cargarMovimientos: false });
assert.equal(queries.at(-1).enabled, false, 'El detalle y los cobros no deben descargar todo el comercio');
useCuentaCorriente();
assert.equal(queries.at(-1).enabled, true, 'El listado completo sigue disponible');
account.useResumenCuentaCorriente(true, 'client');
requests.length = 0;
await queries.at(-1).queryFn();
assert.equal(requests.length, 2);
for (const request of requests) {
  assert.ok(request.filters.some(([key, value]) => key === 'comercio_id' && value === 'tenant'));
  assert.ok(request.filters.some(([key, value]) => key === (request.table === 'clientes' ? 'id' : 'cliente_id') && value === 'client'));
}
account.useResumenCuentaCorriente(true);
requests.length = 0;
await queries.at(-1).queryFn();
assert.ok(requests.every(request => request.filters.length === 1), 'El resumen general conserva todos los clientes');
console.log('OK: consultas por venta/cliente acotadas y aisladas por comercio; carga global opcional.');

dependencies.react = {
  createContext: () => ({ Provider: 'provider' }),
  useEffect: () => {},
  useMemo: fn => fn(),
  useRef: value => ({ current: value }),
  useState: value => [value, () => {}],
};
dependencies['react/jsx-runtime'] = { jsx: (_component, props) => props };
let scope;
let authError = null;
supabase.auth = { async signOut(options) { scope = options.scope; return { error: authError }; } };
const { AuthProvider } = load('../src/contexts/AuthContext.tsx');
const provider = AuthProvider({ children: null });
await provider.value.signOut();
assert.equal(scope, 'local', 'Salir no debe revocar las sesiones de las otras computadoras');
authError = new Error('Sin conexion');
await assert.rejects(provider.value.signOut(), error => error === authError);
console.log('OK: cierre de sesion local y propagacion de errores.');
