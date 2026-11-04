import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file, dependencies = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { if (!(name in dependencies)) throw Error('Dependencia inesperada: ' + name); return dependencies[name]; }, Error, Number, JSON, Date, Request, Response, AbortSignal, ...extra });
  return exports;
}
const associated = compile('supabase/functions/obtener-cae-afip/comprobante-asociado.ts');
const original = { tipo: 'factura_a', puntoVenta: 3, numero: 123, fecha: '20261104', cuit: '20123456786' };
const fields = associated.asociarFacturaOriginal('nota_credito_a', original);
for (const clase of ['a', 'b', 'c']) assert.equal(associated.asociarFacturaOriginal('nota_credito_' + clase, { ...original, tipo: 'factura_' + clase }).CbtesAsoc.CbteAsoc.length, 1);
assert.match(associated.xmlComprobantesAsociados(fields.CbtesAsoc), /<ar:Tipo>1<\/ar:Tipo><ar:PtoVta>3<\/ar:PtoVta><ar:Nro>123<\/ar:Nro>/);
for (const invalid of [{ tipo: 'factura_b' }, { puntoVenta: 0 }, { numero: -1 }, { cuit: '<xml>' }, { fecha: 'invalida' }]) assert.throws(() => associated.asociarFacturaOriginal('nota_credito_a', { ...original, ...invalid }));

async function handlerCase({ needsCae = false, fiscalError = false, timeout = false, denied = false } = {}) {
  const events = [];
  let handler;
  const chain = { error: null, eq() { return this; } };
  const db = {
    rpc: async (name, args) => {
      events.push(name);
      assert.equal(args.p_usuario_id, 'admin');
      if (name === 'preparar_anulacion_comprobante_online') return denied ? { error: { message: 'Sin permisos' } } : { data: { requiere_cae: needsCae, nota_credito_id: 'note' } };
      if (name === 'preparar_reembolso_pedido_online') return { data: { id: 'job', puede_procesar: false, estado: 'completado' } };
      throw Error('RPC inesperada: ' + name);
    },
    from: name => { assert.equal(name, 'pedido_online_cancelaciones'); return { update: () => { events.push('guardar_error_fiscal'); return chain; } }; },
  };
  compile('supabase/functions/mercadopago-reembolsar-pedido/index.ts', {
    '../_shared/mercadopago.ts': {
      adminClient: () => db, authenticatedUser: async () => ({ id: 'admin' }), corsHeaders: {},
      credential: () => { throw Error('No debe leer credenciales con un reembolso completado'); },
      json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    },
    './reembolso.ts': { procesarReembolso: async () => { events.push('procesar_dinero'); return { estado: 'completado' }; } },
  }, { Deno: { serve: fn => { handler = fn; }, env: { get: name => name === 'SUPABASE_URL' ? 'https://example.invalid' : 'fake-server-key' } },
    fetch: async (_url, options) => {
      events.push('autorizar_nota'); assert.equal(options.headers.Authorization, 'Bearer fake-user');
      assert.deepEqual(JSON.parse(options.body), { ventaId: 'note' });
      if (timeout) throw Error('Timeout ARCA');
      return new Response(JSON.stringify(fiscalError ? { success: false, error: 'Rechazo ARCA' } : { success: true }), { status: 200 });
    } });
  const response = await handler(new Request('https://example.invalid/refund', { method: 'POST', headers: { Authorization: 'Bearer fake-user', 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId: 'order', comercioId: 'tenant' }) }));
  return { events, status: response.status, result: await response.json() };
}
let scenario = await handlerCase();
assert.deepEqual(scenario.events, ['preparar_anulacion_comprobante_online', 'preparar_reembolso_pedido_online', 'procesar_dinero'], 'Sin comprobante se conserva el reembolso existente');
scenario = await handlerCase({ needsCae: true });
assert.deepEqual(scenario.events, ['preparar_anulacion_comprobante_online', 'autorizar_nota', 'preparar_reembolso_pedido_online', 'procesar_dinero'], 'Primero CAE, despues dinero');
for (const failure of [{ fiscalError: true }, { timeout: true }]) {
  scenario = await handlerCase({ needsCae: true, ...failure });
  assert.equal(scenario.result.estado, 'fiscal_pendiente');
  assert.equal(scenario.events.includes('procesar_dinero'), false);
  assert.equal(scenario.events.includes('preparar_reembolso_pedido_online'), false);
  assert.ok(scenario.events.includes('guardar_error_fiscal'));
}
scenario = await handlerCase({ denied: true });
assert.equal(scenario.status, 400); assert.equal(scenario.events.includes('procesar_dinero'), false);

const venta = compile('src/types/venta.ts');
const caja = compile('src/types/caja.ts', { '@/types/venta': venta });
const sale = { origen_pedido_online_id: 'order', total: 242, tipo_pago: 'mercado_pago', cae: 'original', pagos_venta: [{ tipo_pago: 'mercado_pago', monto: 242 }] };
const note = { ...sale, comprobante_asociado_id: 'sale', cae: 'credit', pagos_venta: [{ tipo_pago: 'mercado_pago', monto: 242, es_reembolso: true, reembolso_confirmado: 0 }] };
let summary = caja.buildCajaResumen(null, [sale, note]);
assert.equal(summary.totalVentas, 0, 'Nota fiscal resta de ventas, no duplica ingresos');
assert.equal(summary.pagosPorTipo[0].monto, 242, 'El dinero sigue retenido hasta confirmar reembolso');
note.pagos_venta[0].reembolso_confirmado = 100;
assert.equal(caja.buildCajaResumen(null, [sale, note]).pagosPorTipo[0].monto, 142);
note.pagos_venta[0].reembolso_confirmado = 242;
summary = caja.buildCajaResumen(null, [sale, note]);
assert.equal(summary.pagosPorTipo[0].monto, 0);
assert.equal(venta.getVentaTotalFinal(note), 242, 'El documento conserva importe positivo para ARCA/impresion');
const internal = { ...sale, cae: null, anulado_at: '2026-11-04', pagos_venta: [{ tipo_pago: 'mercado_pago', monto: 242, reembolso_confirmado: 242 }] };
summary = caja.buildCajaResumen(null, [internal]); assert.equal(summary.totalVentas, 0); assert.equal(summary.pagosPorTipo[0].monto, 0);
console.log('OK fiscal/dinero simulados: asociacion real A/B/C, CAE antes del reembolso, timeout/rechazo sin devolver, sin comprobante conservado, permisos y saldo contable/caja sin ingresos duplicados.');
