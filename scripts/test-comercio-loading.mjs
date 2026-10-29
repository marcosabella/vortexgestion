// Pruebas locales con consultas simuladas; no inicia sesión ni accede a Supabase.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
const fixture = {
  auth: { user: { id: 'usuario-a' }, isLoading: false },
  options: null,
  responses: {},
  calls: [],
  signals: [],
  db: {
    from(table) {
      const call = { table, filters: [] };
      fixture.calls.push(call);
      const query = {
        select() { return query; },
        eq(...filter) { call.filters.push(filter); return query; },
        in(...filter) { call.filters.push(filter); return query; },
        order() { return query; },
        abortSignal(signal) { fixture.signals.push(signal); return query; },
        then(resolve, reject) { return Promise.resolve(fixture.responses[table]).then(resolve, reject); },
      };
      return query;
    },
  },
};
globalThis.__comercioFixture = fixture;
const mocks = {
  react: 'export const useEffect=()=>{}; export const useState=initial=>[typeof initial==="function"?initial():initial,()=>{}];',
  '@tanstack/react-query': 'export const useQuery=options=>{globalThis.__comercioFixture.options=options;return {isLoading:true};}; export const useMutation=()=>({}); export const useQueryClient=()=>({});',
  '@/integrations/supabase/client': 'export const supabase=globalThis.__comercioFixture.db;',
  '@/contexts/AuthContext': 'export const useAuth=()=>globalThis.__comercioFixture.auth;',
  '@/hooks/use-toast': 'export const useToast=()=>({toast:()=>{}});',
};
const result = await build({
  entryPoints: ['src/hooks/useComercio.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const module = { exports: {} };
new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
const { useComercio } = module.exports;
const getQuery = () => { useComercio(); return fixture.options; };
const run = options => options.queryFn({ signal: new AbortController().signal });

fixture.responses = {
  comercio_usuarios: { data: [{ comercio_id: 'comercio-a' }], error: null },
  comercio: { data: [{ id: 'comercio-a', activo: true }], error: null },
};
const first = getQuery();
assert.equal(first.enabled, true);
assert.equal((await run(first)).comercio.id, 'comercio-a');
assert.equal(storage.get('selectedComercioId'), 'comercio-a');
assert.ok(fixture.calls[0].filters.some(([key, value]) => key === 'user_id' && value === 'usuario-a'));
assert.ok(fixture.calls[1].filters.some(([key, value]) => key === 'id' && value.includes('comercio-a')));
fixture.auth = { user: { id: 'usuario-b' }, isLoading: false };
assert.notDeepEqual(getQuery().queryKey, first.queryKey, 'La caché debe separar usuarios');
fixture.auth = { user: null, isLoading: true };
assert.equal(getQuery().enabled, false, 'Esperar la sesión antes de consultar');
fixture.auth = { user: null, isLoading: false };
assert.equal(getQuery().enabled, false, 'No consultar sin sesión');
fixture.auth = { user: { id: 'usuario-a' }, isLoading: false };
fixture.responses.comercio_usuarios = { data: null, error: new Error('Sin conexión') };
await assert.rejects(run(getQuery()), /Sin conexión/);

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let expire;
globalThis.setTimeout = callback => { expire = callback; return 1; };
globalThis.clearTimeout = () => {};
let resolveLate;
fixture.responses.comercio_usuarios = new Promise(resolve => { resolveLate = resolve; });
const storageBefore = new Map(storage);
try {
  const waiting = run(getQuery());
  const rejected = assert.rejects(waiting, /demoró demasiado/);
  expire();
  await rejected;
  assert.equal(fixture.signals.at(-1).aborted, true, 'Abortar la consulta pendiente');
  resolveLate({ data: [], error: null });
  await new Promise(resolve => originalSetTimeout(resolve, 0));
  assert.deepEqual(storage, storageBefore, 'Una respuesta tardía no debe borrar la selección');
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  delete globalThis.__comercioFixture;
}
console.log('OK: carga, separación por usuario, sesión pendiente, error de red, espera limitada y respuesta tardía.');
