// Ejecuta la función real con Auth/DB simulados. No usa red ni cuentas reales.
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const comercio = '10000000-0000-0000-0000-000000000001';
const usuario = '30000000-0000-0000-0000-000000000010';
let handler;
let options;
let calls;
globalThis.Deno = { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'admin' : 'caller' }, serve: fn => { handler = fn; } };
globalThis.restauranteMock = key => {
  if (key !== 'admin') return {
    auth: { getUser: async () => ({ data: { user: options.loggedIn ? { id: 'owner' } : null }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'restaurante_listar_usuarios') return { data: options.users, error: options.admin ? null : new Error('Sin acceso') };
      if (name === 'restaurante_guardar_usuario') return { error: options.saveError ? new Error('No guardado') : null };
      return { data: { sectores: [] }, error: null };
    },
  };
  return {
    auth: { admin: {
      createUser: async args => { calls.push({ name: 'createUser', args }); return { data: { user: { id: usuario } }, error: options.createError }; },
      updateUserById: async (id, args) => { calls.push({ name: 'updateUser', id, args }); return { error: null }; },
      deleteUser: async id => { calls.push({ name: 'deleteUser', id }); return { error: null }; },
      inviteUserByEmail: () => { throw new Error('No debe enviar invitaciones'); },
    }, resetPasswordForEmail: () => { throw new Error('No debe enviar recuperación'); } },
    from: () => ({ select: () => ({ eq: async () => ({ data: options.memberships, error: null }) }) }),
  };
};
const bundle = await build({ entryPoints: ['supabase/functions/restaurante-usuarios/index.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'auth-fixture', setup(b) {
  b.onResolve({ filter: /^https:\/\/esm\.sh\// }, () => ({ path: 'supabase', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient=(url,key)=>globalThis.restauranteMock(key);', loader: 'js' }));
} }] });
const compiled = new Module(path.resolve('scripts/.restaurante-api-test.cjs'));
compiled.filename = path.resolve('scripts/.restaurante-api-test.cjs');
compiled._compile(bundle.outputFiles[0].text, compiled.filename);
const body = { action: 'crear', comercio_id: comercio, nombre: 'Ana', email: 'ana@prueba.local', password: 'ClaveLocal123!', roles: ['mozo'], sector_id: null, cobros: false, activo: true };
async function run(values = {}, config = {}) {
  options = { loggedIn: true, admin: true, users: [], memberships: [{ comercio_id: comercio, solo_restaurante: true, rol: 'operador' }], ...config };
  calls = [];
  const response = await handler(new Request('https://test.local/', { method: 'POST', headers: { Authorization: 'Bearer prueba' }, body: JSON.stringify({ ...body, ...values }) }));
  return { status: response.status, data: await response.json() };
}
let result = await run();
assert.equal(result.status, 200);
assert.deepEqual(calls.find(c => c.name === 'createUser').args, { email: body.email, password: body.password, email_confirm: true });
assert.equal(calls.find(c => c.name === 'restaurante_guardar_usuario').args.p_nuevo, true);
assert.ok(!JSON.stringify(result.data).includes(body.password));
console.log('OK crea cuenta con contraseña y email confirmado, sin correos');
result = await run({ password: '' }); assert.equal(result.status, 400); assert.ok(!calls.some(c => c.name === 'createUser'));
result = await run({}, { admin: false }); assert.equal(result.status, 403); assert.ok(!calls.some(c => c.name === 'createUser'));
result = await run({}, { loggedIn: false }); assert.equal(result.status, 401); assert.equal(calls.length, 0);
console.log('OK exige contraseña y autorización administrativa antes de crear');
result = await run({}, { saveError: true }); assert.equal(result.status, 400); assert.ok(calls.some(c => c.name === 'deleteUser' && c.id === usuario));
console.log('OK fallo de roles limpia sólo la identidad recién creada');
const local = { id: usuario, email: body.email, admin: false, solo_restaurante: true };
result = await run({ action: 'guardar', usuario_id: usuario }, { users: [local] }); assert.equal(result.status, 200); assert.ok(calls.some(c => c.name === 'updateUser' && c.args.email_confirm));
result = await run({ action: 'guardar', usuario_id: usuario, password: '' }, { users: [local] }); assert.equal(result.status, 200); assert.ok(!calls.some(c => c.name === 'updateUser'));
console.log('OK cambia contraseña exclusiva y conserva la actual al dejar vacío');
result = await run({ action: 'guardar', usuario_id: usuario }, { users: [local], memberships: [{ comercio_id: comercio, solo_restaurante: true, rol: 'operador' }, { comercio_id: 'otro', solo_restaurante: false, rol: 'admin' }] }); assert.equal(result.status, 400); assert.ok(!calls.some(c => c.name === 'updateUser'));
result = await run({ action: 'guardar', usuario_id: usuario }, { users: [{ ...local, admin: true }] }); assert.equal(result.status, 400);
result = await run({ action: 'guardar', usuario_id: usuario }, { users: [] }); assert.equal(result.status, 400);
console.log('OK no cambia claves de administradores, cuentas compartidas ni otros comercios');
result = await run({ action: 'recuperar' }); assert.equal(result.status, 400);
result = await run({ action: 'invitar' }); assert.equal(result.status, 400);
console.log('OK rechaza los antiguos flujos de invitación y recuperación por correo');
