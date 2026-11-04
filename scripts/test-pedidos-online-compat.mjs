import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/utils/pedidosOnlineQuery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Error });
const { cargarPedidosOnlineCompatibles } = exports;
const antiguo = { id: 'f12488a6-6650-4aa3-93d8-310274478941', numero: 24, created_at: '2026-11-03', estado: 'cancelado', estado_pago: 'aprobado', venta_id: null };
const absent = name => ({ data: null, error: { code: 'PGRST200', message: `Could not find a relationship between pedidos_online and ${name} in the schema cache` } });
let calls = [];
let result = await cargarPedidosOnlineCompatibles(async flags => {
  calls.push(flags);
  return flags.cancelaciones ? absent('pedido_online_cancelaciones') : { data: [{ ...antiguo, pedido_online_reembolsos: null }], error: null };
});
assert.equal(result.pedidos[0].id, antiguo.id, 'El pedido historico no desaparece por la migracion pendiente');
assert.equal(result.pedidos[0].estado, 'cancelado');
assert.equal(result.pedidos[0].pedido_online_cancelaciones, null);
assert.equal(result.reembolsosDisponibles, true); assert.equal(result.comprobantesDisponibles, false); assert.equal(calls.length, 2);
result = await cargarPedidosOnlineCompatibles(async () => ({ data: [{ ...antiguo, pedido_online_cancelaciones: null, pedido_online_reembolsos: null }], error: null }));
assert.equal(result.pedidos[0].id, antiguo.id, 'Despues de migrar el mismo pedido sigue visible sin relaciones nuevas');
assert.equal(result.comprobantesDisponibles, true);
calls = [];
result = await cargarPedidosOnlineCompatibles(async flags => {
  calls.push(flags);
  if (flags.cancelaciones) return absent('pedido_online_cancelaciones');
  if (flags.reembolsos) return absent('pedido_online_reembolsos');
  return { data: [antiguo], error: null };
});
assert.equal(calls.length, 3); assert.equal(result.pedidos[0].id, antiguo.id); assert.equal(result.reembolsosDisponibles, false);
for (const error of [{ code: '42501', message: 'permission denied' }, { message: 'Failed to fetch' }, { code: 'PGRST200', message: 'missing relationship pedido_online_items' }]) {
  let attempts = 0;
  await assert.rejects(cargarPedidosOnlineCompatibles(async () => { attempts++; return { data: null, error }; }));
  assert.equal(attempts, 1, 'No oculta errores de permisos, red o datos principales');
}
console.log('OK compatibilidad: pedido historico visible antes/despues de migrar, relaciones opcionales, acciones nuevas deshabilitadas y errores reales conservados.');
