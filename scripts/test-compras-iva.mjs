import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const code = ts.transpileModule(readFileSync('src/utils/compraTotales.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(code, { exports });
const { compraItemTotal } = exports;
const item = {
  producto_id: 'producto', cantidad_solicitada: 1, costo_unitario: 1000,
  porcentaje_iva: 21, porcentaje_descuento: 0, monto_descuento: 0,
  porcentaje_recargo: 0, monto_recargo: 0, actualizar_costo: true,
};

assert.equal(compraItemTotal(item), 1210);
assert.equal(compraItemTotal({ ...item, porcentaje_iva: 0 }), 1000);
assert.equal(compraItemTotal({ ...item, porcentaje_iva: 10.5 }), 1105);
assert.equal(compraItemTotal({ ...item, cantidad_solicitada: 3 }), 3630);
assert.equal(compraItemTotal({ ...item, costo_unitario: 0 }), 0);
assert.equal(compraItemTotal({ ...item, porcentaje_descuento: 10 }), 1089);
assert.equal(compraItemTotal({ ...item, monto_descuento: 100 }), 1089);
assert.equal(compraItemTotal({ ...item, porcentaje_recargo: 10, monto_recargo: 50 }), 1391.5);
assert.equal(compraItemTotal({ ...item, monto_descuento: 2000 }), 0);
assert.equal(compraItemTotal({
  ...item, cantidad_solicitada: 2, porcentaje_descuento: 10,
  monto_descuento: 50, porcentaje_recargo: 5, monto_recargo: 25,
}), 2268.75);
assert.equal(compraItemTotal({ ...item, costo_unitario: 19.99, cantidad_solicitada: 3 }), 72.56);

console.log('OK: IVA 21%, 0%, 10.5%, cantidades, ajustes, costo cero y redondeo.');
