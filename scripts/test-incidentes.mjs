import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, console, require: (name) => {
    assert.ok(name in dependencies, `Dependencia inesperada: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const monitor = load('src/utils/incidentes.ts');
assert.equal(monitor.contextoRutaIncidente('/compras/123456/editar?token=secret#abc').ruta, '/compras/:id/editar');
assert.equal(monitor.contextoRutaIncidente('/compras/nueva').modulo, 'compras');
assert.equal(monitor.contextoRutaIncidente('/admin/incidentes'), null);
assert.equal(monitor.contextoRutaIncidente('/login'), null);
const sensible = 'password=secret token:abc email=cliente@example.com Bearer private ' +
  'https://example.com?key=private "producto privado" 12345678901 ' +
  'Key (comercio_id, cod_producto)=(privado, privado) 12345678-1234-1234-1234-123456789abc';
const limpio = monitor.sanitizarMensajeIncidente(sensible);
for (const secreto of ['secret', 'abc', 'cliente@example.com', 'private', 'producto privado', '12345678901', 'privado', '12345678-1234']) {
  assert.equal(limpio.includes(secreto), false, `Se filtró ${secreto}`);
}
assert.ok(monitor.sanitizarMensajeIncidente('duplicate key value violates unique constraint "ind_productos_comercio_cod_producto"')
  .includes('ind_productos_comercio_cod_producto'));
assert.equal(monitor.sanitizarMensajeIncidente('a'.repeat(3000)).length, 1600);

const registros = [];
const enviar = async (registro) => { registros.push(registro); };
const contexto = { userId: 'usuario-1', comercioId: 'comercio-1', pathname: '/compras/nueva' };
monitor.registrarIncidente(new Error('sin sesión'), 'guardado');
assert.equal(registros.length, 0);
monitor.configurarIncidentes(contexto, enviar);
monitor.registrarIncidente({ code: '23505', message: 'duplicado' }, 'guardado');
assert.equal(registros.length, 1);
assert.equal(registros[0].p_modulo, 'compras');
assert.equal(registros[0].p_codigo, '23505');
monitor.registrarIncidente({ code: '23505', message: 'duplicado' }, 'guardado');
monitor.registrarIncidente('Error: duplicado', 'aviso');
assert.equal(registros.length, 1, 'Una falla no debe repetirse por su aviso');
const captura = monitor.capturarContextoIncidente();
monitor.configurarIncidentes({ ...contexto, comercioId: 'comercio-2' }, enviar);
monitor.registrarIncidente('error del comercio anterior', 'consulta', captura);
monitor.registrarIncidente('Aviso del comercio anterior', 'aviso');
assert.equal(registros.length, 1, 'No debe atribuir errores tardíos al nuevo comercio');
monitor.registrarIncidente('falla nueva', 'consulta');
assert.equal(registros.at(-1).p_comercio_id, 'comercio-2');
monitor.configurarIncidentes({ ...contexto, pathname: '/admin/incidentes' }, enviar);
monitor.registrarIncidente('el monitor falló', 'consulta');
assert.equal(registros.length, 2, 'El monitor no debe reportarse a sí mismo');
monitor.configurarIncidentes(contexto, async () => { throw new Error('Sin conexión'); });
assert.doesNotThrow(() => monitor.registrarIncidente('error de transporte', 'navegador'));
await new Promise((resolve) => setTimeout(resolve, 0));
monitor.configurarIncidentes({ ...contexto, userId: 'usuario-2' }, enviar);
const antesLimite = registros.length;
for (let index = 0; index < 40; index++) monitor.registrarIncidente(`error ${index}`, 'navegador');
assert.equal(registros.length - antesLimite, 30, 'Debe limitar tormentas de errores');

// Usa QueryClient real con transporte simulado: verifica callbacks globales y capturas al iniciar.
const reactQuery = require('@tanstack/react-query');
const { crearCachesIncidentes } = load('src/utils/incidentesQuery.ts', {
  '@tanstack/react-query': reactQuery,
  '@/utils/incidentes': monitor,
});
monitor.configurarIncidentes({ ...contexto, userId: 'usuario-3' }, enviar);
const client = new reactQuery.QueryClient({ ...crearCachesIncidentes(), defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
await assert.rejects(client.fetchQuery({ queryKey: ['prueba'], queryFn: async () => { throw new Error('falló consulta'); } }));
assert.equal(registros.at(-1).p_origen, 'consulta');
const mutation = client.getMutationCache().build(client, { mutationFn: async () => { throw new Error('falló alta'); } });
await assert.rejects(mutation.execute({}));
assert.equal(registros.at(-1).p_origen, 'guardado');
let rechazar;
const tardia = client.fetchQuery({ queryKey: ['tardia'], queryFn: () => new Promise((_resolve, reject) => { rechazar = reject; }) });
monitor.configurarIncidentes({ ...contexto, comercioId: 'comercio-3' }, enviar);
const antesTardia = registros.length;
rechazar(new Error('consulta del tenant anterior'));
await assert.rejects(tardia);
assert.equal(registros.length, antesTardia);
client.clear();
monitor.configurarIncidentes(null, null);

// Filtros y paginación con el hook real y Supabase simulado.
const queries = [];
const mutations = [];
const filters = [];
let adminRpcCalls = 0;
const builder = new Proxy({}, { get: (_target, name) => {
  if (name === 'then') return (resolve) => resolve({ data: [], error: null, count: 0 });
  return (...args) => { filters.push([name, ...args]); return builder; };
} });
const hook = load('src/hooks/useIncidentes.ts', {
  '@tanstack/react-query': {
    useQuery: (options) => { queries.push(options); return {}; },
    useMutation: (options) => { mutations.push(options); return {}; },
    useQueryClient: () => ({ invalidateQueries() {} }),
  },
  '@/integrations/supabase/client': { supabase: { from: () => builder, rpc: async () => { adminRpcCalls++; return { error: null }; } } },
  '@/utils/fetchMasterRecords': {},
});
const rango = hook.rangoFechasIncidentes('2026-10-01', '2026-10-15');
assert.equal(rango.inicio, '2026-10-01T00:00:00-03:00');
assert.equal(rango.fin, '2026-10-16T03:00:00.000Z');
const filtros = { comercioId: 'comercio-1', modulo: 'compras', estado: 'pendiente', desde: '2026-10-01', hasta: '2026-10-15', pagina: 2 };
hook.useIncidentes(filtros, true);
await queries[1].queryFn();
assert.ok(filters.some(([name, field, value]) => name === 'eq' && field === 'comercio_id' && value === 'comercio-1'));
assert.ok(filters.some(([name, field, value]) => name === 'eq' && field === 'modulo' && value === 'compras'));
assert.ok(filters.some(([name, field, value]) => name === 'eq' && field === 'estado' && value === 'pendiente'));
assert.ok(filters.some(([name, field, value]) => name === 'lt' && field === 'creado_en' && value === rango.fin));
assert.ok(filters.some(([name, from, to]) => name === 'range' && from === 100 && to === 149));
hook.useIncidentes(filtros, false);
assert.equal(queries[3].enabled, false);
await assert.rejects(queries[3].queryFn());
await assert.rejects(mutations[1].mutationFn({ id: 'incidente', estado: 'resuelto', notas: '' }));
assert.equal(adminRpcCalls, 0);
hook.useIncidentes({ ...filtros, desde: '2026-10-20' }, true);
assert.equal(queries[5].enabled, false);
console.log('OK Incidentes: privacidad, límites, duplicados, captura automática real de React Query, cambio de comercio, filtros, fechas y paginación. Supabase simulado; RLS se verifica por separado en test-incidentes-sql.mjs.');
