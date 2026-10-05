// Ejecuta el handler real con Supabase y SOAP simulados. No usa credenciales.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const globals = { Error, crypto: webcrypto, TextEncoder, setTimeout, AbortSignal, Request, Response, console: { log() {}, error() {} } };
const load = (file, require = () => ({}), extras = {}) => {
  const exports = {};
  vm.runInNewContext(compile(file), { ...globals, exports, require, ...extras }, { filename: file });
  return exports;
};
const cache = load('supabase/functions/_shared/wsaa-cache.ts');
const caeHelpers = load('supabase/functions/obtener-cae-afip/cae.ts');
const commerce = 'tenant';
const saleId = 'sale';
const config = { punto_venta: 3, cuit_emisor: '20300323872', ambiente: 'produccion', certificado_crt: 'TEST CERT', certificado_key: 'TEST KEY' };
const original = { id: saleId, comercio_id: commerce, numero_comprobante: '0001-00000027', punto_venta: 1, numero_secuencial: 27,
  tipo_comprobante: 'factura_c', fecha_venta: '2026-10-05T10:57:00Z', total: 200000, subtotal: 200000, total_iva: 0,
  venta_items: [{ cantidad: 1, precio_unitario: 200000, porcentaje_iva: 0, total: 200000, subtotal: 200000, monto_iva: 0 }], cliente: { cuit: '30545766678' } };
let state;
let handler;
const consultXml = (total = 200000) => `<ResultGet><Resultado>A</Resultado><EmisionTipo>CAE</EmisionTipo><CodAutorizacion>86406153037880</CodAutorizacion><FchVto>20261015</FchVto><PtoVta>3</PtoVta><CbteTipo>11</CbteTipo><CbteDesde>126</CbteDesde><CbteHasta>126</CbteHasta><DocTipo>80</DocTipo><DocNro>30545766678</DocNro><CbteFch>20261005</CbteFch><ImpTotal>${total}</ImpTotal></ResultGet>`;
const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
  rpc: async () => ({ data: { estado: 'vigente', token: 'test-token', sign: 'test-sign', expirationTime: '2099-01-01T00:00:00Z' }, error: null }),
  from: table => {
    let action = 'select'; let payload;
    const builder = {
      select() { return builder; }, eq() { return builder; }, order() { return builder; }, limit() { return builder; },
      insert(value) { action = 'insert'; payload = value; return builder; },
      delete() { action = 'delete'; return builder; },
      update(value) { action = 'update'; payload = value; return builder; },
      single() { return builder; }, maybeSingle() { return builder; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (table === 'comercio_usuarios') return { data: state.denyAdmin ? null : { activo: true }, error: null };
        if (table === 'afip_config') return { data: config, error: null };
        if (table === 'ventas') {
          if (action === 'select') return { data: structuredClone(state.sale), error: null };
          if (payload.cae && state.failFinal) { state.failFinal = false; return { data: null, error: { message: 'fallo de guardado simulado' } }; }
          // Reproduce la coherencia exigida por el trigger de numeracion.
          if (payload.cae && (payload.punto_venta !== 3 || payload.numero_secuencial !== 126)) {
            return { data: null, error: { message: 'ventas_punto_venta_inconsistente' } };
          }
          Object.assign(state.sale, payload); return { data: { id: saleId }, error: null };
        }
        if (table === 'afip_cae_intentos') {
          if (action === 'delete') { state.attempt = null; return { data: { venta_id: saleId }, error: null }; }
          if (action === 'select') return { data: structuredClone(state.attempt), error: null };
          if (action === 'insert') {
            if (state.attempt) return { data: null, error: { message: 'duplicate key' } };
            state.attempt = structuredClone(payload); return { data: null, error: null };
          }
          Object.assign(state.attempt, payload); return { data: null, error: null };
        }
        throw new Error('Tabla inesperada: ' + table);
      }).then(resolve, reject); },
    };
    return builder;
  },
};
const fakeFetch = async (_url, options) => {
  const action = options.headers.SOAPAction;
  state.calls.push(action);
  if (action.endsWith('FECompUltimoAutorizado')) return new Response('<CbteNro>125</CbteNro>');
  if (action.endsWith('FECAESolicitar')) {
    assert.ok(state.attempt, 'Debe conservar el numero ANTES de llamar a ARCA');
    if (state.failNetwork) throw new Error('Conexion interrumpida despues del envio');
    if (state.rejected) return new Response('<Resultado>R</Resultado><Obs><Msg>Dato invalido</Msg></Obs>');
    return new Response('<Resultado>A</Resultado><CAE>86406153037880</CAE><CAEFchVto>20261015</CAEFchVto>');
  }
  if (action.endsWith('FECompConsultar')) return new Response(state.consultXml || consultXml());
  throw new Error('Llamada SOAP inesperada');
};
load('supabase/functions/obtener-cae-afip/index.ts', name => {
  if (name.includes('supabase-js')) return { createClient: () => supabase };
  if (name.includes('node-forge')) return {};
  if (name.includes('wsaa-cache')) return cache;
  if (name === './cae.ts') return caeHelpers;
  throw new Error('Import inesperado: ' + name);
}, { fetch: fakeFetch, Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } } });
const reset = () => { state = { sale: structuredClone(original), attempt: null, calls: [] }; };
const request = async () => {
  const response = await handler(new Request('https://test.local', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ ventaId: saleId }) }));
  return { status: response.status, body: await response.json() };
};
let passed = 0;
const test = async (label, run) => { reset(); await run(); passed++; console.log('OK ' + label); };
await test('Guarda CAE junto con punto de venta y secuencia fiscal', async () => {
  const response = await request(); assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(state.sale.numero_comprobante, '0003-00000126'); assert.equal(state.sale.punto_venta, 3);
  assert.equal(state.sale.numero_secuencial, 126); assert.equal(state.sale.cae, '86406153037880');
});
await test('Fallo de guardado: reintento recupera CAE sin autenticar ni emitir otra vez', async () => {
  state.failFinal = true; assert.equal((await request()).status, 400);
  assert.equal(state.attempt.cae, '86406153037880');
  const priorCalls = state.calls.length; assert.equal((await request()).status, 200);
  assert.equal(state.calls.length, priorCalls); assert.equal(state.sale.cae, '86406153037880');
});
await test('Respuesta perdida: consulta exactamente el numero original', async () => {
  state.failNetwork = true; assert.equal((await request()).status, 400);
  assert.equal(state.attempt.numero_secuencial, 126); state.failNetwork = false;
  assert.equal((await request()).status, 200);
  assert.equal(state.calls.filter(x => x.endsWith('FECAESolicitar')).length, 1);
  assert.equal(state.calls.filter(x => x.endsWith('FECompConsultar')).length, 1);
});
await test('No vincula un CAE de otro importe ni emite una factura nueva', async () => {
  state.failNetwork = true; await request(); state.failNetwork = false; state.consultXml = consultXml(1);
  assert.equal((await request()).status, 400); assert.equal(state.sale.cae, undefined);
  assert.equal(state.calls.filter(x => x.endsWith('FECAESolicitar')).length, 1);
});
await test('No recupera un intento si cambiaron los datos fiscales de la venta', async () => {
  state.failFinal = true; await request(); state.sale.total = 300000;
  const before = state.calls.length; assert.equal((await request()).status, 400); assert.equal(state.calls.length, before);
});
await test('Dos solicitudes simultaneas producen una sola emision', async () => {
  const responses = await Promise.all([request(), request()]);
  assert.ok(responses.some(r => r.status === 200));
  assert.equal(state.calls.filter(x => x.endsWith('FECAESolicitar')).length, 1);
});
await test('TA vigente se reutiliza sin llamar a LoginCms', async () => {
  let emitted = 0;
  const result = await cache.obtenerTicketWsaaCacheado(supabase, commerce, 'TEST CERT', 'wsfe', 'produccion', async () => { emitted++; return {}; });
  assert.equal(result.token, 'test-token'); assert.equal(emitted, 0);
});
await test('Sin permiso fiscal no solicita CAE ni modifica la venta', async () => {
  state.denyAdmin = true; assert.equal((await request()).status, 400);
  assert.equal(state.calls.length, 0); assert.equal(state.attempt, null); assert.deepEqual(state.sale, original);
});
await test('Rechazo explicito permite corregir y reintentar sin bloquear la venta', async () => {
  state.rejected = true; assert.equal((await request()).status, 400); assert.equal(state.attempt.rechazado, true);
  state.rejected = false; assert.equal((await request()).status, 200);
  assert.equal(state.sale.cae, '86406153037880');
});
await test('TA nuevo se guarda antes de usarlo y otra funcion puede reutilizarlo', async () => {
  let ticket; let emitted = 0; let saves = 0;
  const client = { rpc: async (name, args) => {
    if (name === 'afip_wsaa_reservar_ticket') return { data: ticket ? { estado: 'vigente', ...ticket } : { estado: 'renovar' }, error: null };
    ticket = args.p_ticket; saves++; return { data: null, error: null };
  } };
  const emit = async () => { emitted++; return { token: 'new-token', sign: 'new-sign', expirationTime: '2099-01-01T00:00:00Z' }; };
  await cache.obtenerTicketWsaaCacheado(client, commerce, 'TEST CERT', 'wsfe', 'produccion', emit);
  const result = await cache.obtenerTicketWsaaCacheado(client, commerce, 'TEST CERT', 'wsfe', 'produccion', emit);
  assert.equal(emitted, 1); assert.equal(saves, 1); assert.equal(result.token, 'new-token');
});
await test('Ticket previo perdido: explica el error y no confunde TA con CAE', async () => {
  const client = { rpc: async () => ({ data: { estado: 'renovar' }, error: null }) };
  await assert.rejects(cache.obtenerTicketWsaaCacheado(client, commerce, 'TEST CERT', 'wsfe', 'produccion', async () => {
    throw new Error('El CEE ya posee un TA valido para el acceso al WSN solicitado');
  }), /no indica si la factura tiene CAE/);
});
console.log(`${passed} pruebas fiscales con servicios simulados correctas. No se emitieron comprobantes reales.`);
