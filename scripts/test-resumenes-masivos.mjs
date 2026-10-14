import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { File } from 'node:buffer';
import ts from 'typescript';
const require = createRequire(import.meta.url), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {exports,require:name=>name.startsWith('@/')?load(path.resolve('src',name.slice(2)+'.ts')):require(name),Blob,File,TextEncoder,Uint8Array,setTimeout,console});
  return exports;
}
const { agruparMovimientosClientes, saldoActualResumenCliente, coincideTipoSaldoResumen, resumenClienteAlCorte } = load(path.resolve('src/utils/resumenesCuentaCliente.ts'));
const { buildResumenesCuentaCorrientePdfFile, buildCuentaCorrientePdfFile } = load(path.resolve('src/utils/cuentaCorrientePdf.ts'));
const client = { id:'a', nombre:'CLIENTE DEUDOR',apellido:'PRUEBA',cuit:'30111111111' };
const raw = [
 {id:'old1',cliente_id:'a',fecha_movimiento:'2026-08-31T12:00:00',tipo_movimiento:'debito',monto:200000,concepto:'venta_credito'},
 {id:'old2',cliente_id:'a',fecha_movimiento:'2026-08-31T23:00:00',tipo_movimiento:'credito',monto:29000,concepto:'pago_efectivo'},
 {id:'new1',cliente_id:'a',fecha_movimiento:'2026-09-01T12:00:00',tipo_movimiento:'debito',monto:1000,concepto:'venta_credito'},
 {id:'new2',cliente_id:'a',fecha_movimiento:'2026-09-02T12:00:00',tipo_movimiento:'credito',monto:500,concepto:'pago_efectivo'},
];
const report = resumenClienteAlCorte(client,raw,'2026-08-31');
assert.equal(report.saldoInicial,171000);assert.equal(report.fechaDesde,'2026-09-01');assert.equal(report.movimientos.length,2);assert.equal(report.resumen.saldo_actual,171500);
assert.equal(saldoActualResumenCliente(raw),171500);
assert.equal(coincideTipoSaldoResumen(1,'deudor'),true);assert.equal(coincideTipoSaldoResumen(-1,'acreedor'),true);assert.equal(coincideTipoSaldoResumen(0,'todos'),true);assert.equal(coincideTipoSaldoResumen(0,'deudor'),false);
assert.throws(()=>resumenClienteAlCorte(client,raw,'2026-02-30'));
assert.throws(()=>resumenClienteAlCorte(client,[{...raw[0],cliente_id:'otro'}],'2026-08-31'));
assert.equal(resumenClienteAlCorte(client,[],'2026-12-31').fechaDesde,'2027-01-01');
assert.equal(agruparMovimientosClientes([...raw,{...raw[0],cliente_id:'b'}]).get('a').length,4);
const many = [...raw,...Array.from({length:59},(_,i)=>({id:'extra'+String(i).padStart(3,'0'),cliente_id:'a',fecha_movimiento:'2026-09-03T12:00:00',tipo_movimiento:i%2?'credito':'debito',monto:10.01,concepto:i%2?'pago_efectivo':'venta_credito',observaciones:'Movimiento de prueba '+i}))];
const main = resumenClienteAlCorte(client,many,'2026-08-31');
const creditor = resumenClienteAlCorte({id:'b',nombre:'CLIENTE ACREEDOR',apellido:'PRUEBA',cuit:'30222222222'},[{...raw[0],id:'b1',cliente_id:'b',tipo_movimiento:'credito',monto:750}], '2026-08-31');
const zero = resumenClienteAlCorte({id:'c',nombre:'CLIENTE SALDO CERO',apellido:'PRUEBA',cuit:'30333333333'},[], '2026-08-31');
assert.equal(creditor.saldoInicial,-750);assert.equal(zero.saldoInicial,0);
const individual = await buildCuentaCorrientePdfFile(main.resumen,main.movimientos,{saldoInicial:main.saldoInicial,fechaDesde:main.fechaDesde});
const batch = await buildResumenesCuentaCorrientePdfFile([main,creditor,zero],{fechaCorte:'2026-08-31'});
const bytes = Buffer.from(await batch.arrayBuffer());
const streams = text => [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m=>m[1]);
const pages = streams(bytes.toString('utf8')), one = streams(Buffer.from(await individual.arrayBuffer()).toString('utf8'));
assert.equal(one.length,3);assert.equal(pages.length,5);assert.deepEqual(pages.slice(0,3),one);
assert.ok(pages[3].includes('CLIENTE ACREEDOR'));assert.ok(pages[4].includes('CLIENTE SALDO CERO'));
assert.ok(pages.every(p=>p.includes('RESUMEN CTA CTE')));
assert.ok(pages[0].includes('31/08/2026'));assert.ok(pages[0].includes('171.000,00'));
await assert.rejects(buildResumenesCuentaCorrientePdfFile([],{fechaCorte:'2026-08-31'}));
if(process.env.RESUMENES_PDF_QA){mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/resumenes-masivos-prueba.pdf',bytes);}
console.log('OK corte inclusivo, seleccion por saldo, saldo cero, limites, aislamiento de cliente, 5 paginas y formato individual conservado');
