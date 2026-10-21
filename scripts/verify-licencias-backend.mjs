// Comprueba disponibilidad y rechazo de acceso anónimo; nunca emite comprobantes.
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';
const env = loadEnv('production', process.cwd(), 'VITE_');
assert.equal(env.VITE_SUPABASE_PROJECT_ID, 'zhtqkygjvaaizbdwwsbi');
const headers = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
const consultar = await fetch(env.VITE_SUPABASE_URL + '/rest/v1/rpc/consultar_licencia_comercio', {
  method: 'POST', headers, signal: AbortSignal.timeout(20000),
  body: JSON.stringify({ p_comercio_id: '00000000-0000-0000-0000-000000000001', p_destinatario_id: '00000000-0000-0000-0000-000000000002' }),
});
const rpcError = await consultar.json();
assert.notEqual(rpcError.code, 'PGRST202', 'La RPC debe estar disponible en la caché de esquema');
assert.equal(rpcError.code, '42501', 'La RPC debe rechazar al usuario anónimo');
const fiscal = await fetch(env.VITE_SUPABASE_URL + '/functions/v1/obtener-cae-afip', {
  method: 'POST', headers, signal: AbortSignal.timeout(20000),
  body: JSON.stringify({ ventaId: '00000000-0000-0000-0000-000000000001' }),
});
const fiscalError = await fiscal.json();
assert.equal(fiscalError.success, false);
assert.match(fiscalError.error, /Usuario no autenticado|Sesion invalida/);
console.log('OK producción: RPC de licencias y función fiscal disponibles, acceso anónimo bloqueado. Sin emitir comprobantes.');
