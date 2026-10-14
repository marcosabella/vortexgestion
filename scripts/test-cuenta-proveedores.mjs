import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const code = ts.transpileModule(readFileSync('src/utils/cuentaProveedorHistorica.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports });
const { conceptoHistoricoProveedor: concept, saldoHistoricoProveedor: balance, periodoCuentaProveedor: period } = exports;
assert.equal(concept('Historico Access CompraProveedor:2202 | Comprobante 0007 - 124576'), 'Comprobante 0007 - 124576');
assert.equal(concept('Historico Access CompraProveedor:2202 | Comprobante 0007 - 124576 | Nota original'), 'Comprobante 0007 - 124576');
assert.equal(concept('Historico Access PagosProveedores:839'), 'Pago: 839');
assert.equal(concept('Historico Access PagosProveedores:839 | Pago negativo de origen (reversion)'), 'Pago: 839');
assert.equal(concept('Pago de factura'), null);
const rows = [
  { id: '1', fecha: '2026-09-01', tipo: 'deuda', monto: 200000, observaciones: 'Historico Access CompraProveedor:1 | Comprobante 1' },
  { id: '2', fecha: '2026-09-30', tipo: 'pago', monto: 29000, observaciones: 'Historico Access PagosProveedores:2' },
  { id: '3', fecha: '2026-10-01', tipo: 'deuda', monto: 1000 },
  { id: '4', fecha: '2026-10-14', tipo: 'pago', monto: 500 },
  { id: '5', fecha: '2026-10-15', tipo: 'deuda', monto: 0.1, factura_id: 'factura' },
  { id: '6', fecha: '2026-10-16', tipo: 'deuda', monto: 0.2, gasto_egreso_id: 'gasto' },
];
assert.equal(balance(rows), 171500);
assert.equal(balance([{ tipo: 'deuda', monto: 10 }]), 0);
const current = period(rows.slice().reverse(), '2026-10-01', '');
assert.equal(current.saldoAnterior, 171000);
assert.equal(current.movimientos.length, 4);
assert.equal(current.movimientos.at(-1).accumulatedBalance, 171500.3);
const historic = period(rows, '', '2026-09-30');
assert.equal(historic.saldoAnterior, 0);
assert.equal(historic.movimientos.length, 2);
assert.equal(historic.movimientos.at(-1).accumulatedBalance, 171000);
const limited = period(rows, '2026-10-14', '2026-10-14');
assert.equal(limited.saldoAnterior, 172000);
assert.equal(limited.movimientos.length, 1);
assert.equal(limited.movimientos[0].accumulatedBalance, 171500);
const empty = period(rows, '2026-11-01', '2026-11-30');
assert.equal(empty.saldoAnterior, 171500.3);
assert.equal(empty.movimientos.length, 0);
console.log('OK conceptos, saldo historico, corte mensual, rango inclusivo, historia completa y centavos');
