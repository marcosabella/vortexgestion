// Pruebas locales del endpoint real. No usan red ni cuentas productivas.
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const comercio = '10000000-0000-0000-0000-000000000001';
const otro = '10000000-0000-0000-0000-000000000002';
const token = 'a'.repeat(64);
let handler;
let options;
let calls;
globalThis.Deno = { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : 'caller' }, serve: fn => { handler = fn; } };
globalThis.terminalMock = (key, config) => key === 'service' ? {
  rpc: async (name, args) => {
    calls.push({ name, args });
    assert.equal(name, 'restaurante_terminal_info');
    assert.notEqual(args.p_token_hash, token);
    return { data: options.terminalValida ? { comercio_id: comercio, nombre: 'Terminal', usuarios: [{ id: 'empleado', nombre: 'Ana' }] } : null, error: null };
  },
} : {
  auth: { getUser: async () => {
    assert.equal(config.global.headers.Authorization, 'Bearer sesion-local');
    return { data: { user: options.loggedIn ? { id: 'usuario-actual' } : null }, error: null };
  } },
  rpc: async (name, args) => {
    calls.push({ name, args });
    assert.equal(name, 'restaurante_acceso');
    assert.equal(args.p_comercio, comercio);
    return { data: options.permitido, error: options.rpcError ? new Error('No disponible') : null };
  },
};
const bundle = await build({ entryPoints: ['supabase/functions/restaurante-pin/index.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'terminal-fixture', setup(b) {
  b.onResolve({ filter: /^https:\/\/esm\.sh\// }, () => ({ path: 'supabase', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient=(url,key,config)=>globalThis.terminalMock(key,config);', loader: 'js' }));
} }] });
const compiled = new Module(path.resolve('scripts/.terminal-acceso-test.cjs'));
compiled.filename = path.resolve('scripts/.terminal-acceso-test.cjs');
compiled._compile(bundle.outputFiles[0].text, compiled.filename);
async function run(body = {}, config = {}) {
  options = { terminalValida: true, loggedIn: true, permitido: true, ...config };
  calls = [];
  const response = await handler(new Request('https://test.local', { method: 'POST', headers: { Authorization: 'Bearer sesion-local' }, body: JSON.stringify({ action: 'validar_terminal', comercio_id: comercio, token, ...body }) }));
  return { status: response.status, data: await response.json() };
}
let result = await run();
assert.equal(result.status, 200);
assert.deepEqual(result.data, { comercio_id: comercio });
assert.ok(calls.some(c => c.name === 'restaurante_acceso'));
result = await run({ comercio_id: otro });
assert.equal(result.status, 403);
assert.ok(!calls.some(c => c.name === 'restaurante_acceso'));
result = await run({}, { loggedIn: false });
assert.equal(result.status, 401);
assert.ok(!calls.some(c => c.name === 'restaurante_acceso'));
for (const permitido of [false, null, 'true']) {
  result = await run({}, { permitido });
  assert.equal(result.status, 403, 'Solo un permiso confirmado por PostgreSQL concede acceso');
}
result = await run({}, { rpcError: true });
assert.equal(result.status, 403);
result = await run({}, { terminalValida: false });
assert.equal(result.status, 403);
result = await run({ token: 'invalido' });
assert.equal(result.status, 403);
assert.equal(calls.length, 0);
result = await run({ action: 'listar' }, { loggedIn: false });
assert.equal(result.status, 200, 'El acceso publico por PIN de una terminal autorizada se conserva');
assert.deepEqual(result.data, { nombre: 'Terminal', usuarios: [{ id: 'empleado', nombre: 'Ana' }] });
console.log('OK terminal: comercio ajeno, sin sesion, sin permiso, errores y terminal invalida rechazados; validacion autorizada y listado PIN conservados.');

// Renderiza la pantalla real para verificar tambien el ingreso por URL directa.
let ui;
globalThis.terminalUi = () => ui;
globalThis.localStorage = { getItem: () => ui.token };
const fixture = `
import React from 'react';
export const useAuth=()=>globalThis.terminalUi().auth;
export const useComercio=()=>globalThis.terminalUi().comercio;
export const useComercioParametrizacion=()=>globalThis.terminalUi().parametrizacion;
export const useRestauranteTerminalAcceso=()=>globalThis.terminalUi().acceso;
export const useQuery=()=>({data:{nombre:'Terminal autorizada',usuarios:[{id:'empleado',nombre:'Ana'}]},isPending:false});
export const useNavigate=()=>()=>{};
export const restauranteTerminalKey='vortex-restaurante-terminal';
export const restaurantePinRequest=()=>{throw Error('No debe usar red durante el render');};
export const supabase={};
export const Link=({to,children})=>React.createElement('a',{href:to},children);
export const Button=({asChild,children,...props})=>asChild?children:React.createElement('button',props,children);
export const Input=props=>React.createElement('input',props);
export const Label=props=>React.createElement('label',props);
${['ArrowRight','ChevronDown','Loader2','LockKeyhole','Monitor','UserRound','UtensilsCrossed'].map(name => `export const ${name}=()=>null;`).join('\n')}
`;
const screenBundle = await build({ entryPoints: ['src/pages/RestauranteTerminal.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], plugins: [{ name: 'screen-fixture', setup(b) {
  b.onResolve({ filter: /^(@\/|@tanstack\/react-query$|react-router-dom$|lucide-react$)/ }, () => ({ path: 'screen', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'js' }));
} }] });
const screen = new Module(path.resolve('scripts/.terminal-screen-test.cjs'));
screen.filename = path.resolve('scripts/.terminal-screen-test.cjs');
screen.paths = Module._nodeModulePaths(process.cwd());
screen._compile(screenBundle.outputFiles[0].text, screen.filename);
function render(config = {}) {
  ui = {
    token,
    auth: { session: { user: { email: 'comercio@prueba.local' } }, isLoading: false },
    comercio: { comercio: { id: comercio }, isLoading: false },
    parametrizacion: { data: { modulos: { restaurante: false } }, isFetching: false },
    acceso: { data: { comercio_id: comercio }, isError: false, isPending: false },
    ...config,
  };
  return renderToStaticMarkup(React.createElement(screen.exports.default));
}
let html = render();
assert.match(html, /Acceso no permitido/);
assert.doesNotMatch(html, /Volver al restaurante|Cerrar sesi.n y elegir empleado|terminal-empleado/);
html = render({ parametrizacion: { data: { modulos: { restaurante: true } }, isFetching: false }, acceso: { data: { comercio_id: otro }, isError: false, isPending: false } });
assert.match(html, /Acceso no permitido/);
html = render({ parametrizacion: { data: { modulos: { restaurante: true } }, isFetching: false }, acceso: { isError: true, isPending: false } });
assert.match(html, /Acceso no permitido/);
html = render({ token: null, parametrizacion: { data: { modulos: { restaurante: true } }, isFetching: false }, acceso: { isPending: true } });
assert.match(html, /Acceso no permitido/, 'Sin terminal no debe quedar cargando indefinidamente');
html = render({ parametrizacion: { data: { modulos: { restaurante: true } }, isFetching: false }, acceso: { isPending: true } });
assert.match(html, /Verificando acceso/);
assert.doesNotMatch(html, /Volver al restaurante/);
html = render({ parametrizacion: { data: { modulos: { restaurante: true } }, isFetching: false } });
assert.match(html, /Cerrar sesi.n y elegir empleado/);
html = render({ auth: { session: null, isLoading: false } });
assert.match(html, /terminal-empleado/);
console.log('OK pantalla real: URL directa bloqueada sin restaurante, terminal ajena o error; carga, terminal ausente y acceso autorizado verificados.');
