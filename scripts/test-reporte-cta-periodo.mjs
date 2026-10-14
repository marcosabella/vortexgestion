import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url), exports = {};
const code = ts.transpileModule(readFileSync('src/utils/cuentaClientePeriodo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require });
const { inicioMesCuentaCliente, periodoCuentaCliente } = exports;
assert.equal(inicioMesCuentaCliente(new Date(2026, 0, 14)), '2026-01-01');
assert.equal(inicioMesCuentaCliente(new Date(2026, 9, 14)), '2026-10-01');
const movements = [
  {id:'1',fecha_movimiento:'2026-09-01T12:00:00',tipo_movimiento:'debito',monto:200000},
  {id:'2',fecha_movimiento:'2026-09-30T12:00:00',tipo_movimiento:'credito',monto:29000},
  {id:'3',fecha_movimiento:'2026-10-01T12:00:00',tipo_movimiento:'debito',monto:1000},
  {id:'4',fecha_movimiento:'2026-10-14T12:00:00',tipo_movimiento:'credito',monto:500},
  {id:'5',fecha_movimiento:'2026-10-15T12:00:00',tipo_movimiento:'debito',monto:0.1},
  {id:'6',fecha_movimiento:'2026-10-16T12:00:00',tipo_movimiento:'debito',monto:0.2},
];
const period = periodoCuentaCliente(movements.slice().reverse(), '2026-10-01');
assert.equal(period.saldoAnterior,171000);
assert.equal(period.movimientos.length,4);
assert.equal(period.totalDebitos,1000.3);
assert.equal(period.totalCreditos,500);
assert.equal(period.saldoFinal,171500.3);
const limited = periodoCuentaCliente(movements,'2026-10-01','2026-10-01');
assert.equal(limited.movimientos.length,1);assert.equal(limited.saldoFinal,172000);
console.log('OK reporte: corte previo, orden, rango inclusivo, saldo final y centavos');
