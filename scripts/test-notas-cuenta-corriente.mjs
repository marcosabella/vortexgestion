// Pruebas de integración en un clúster PostgreSQL temporal, sin conexiones remotas.
// Ejecutar: node scripts/test-notas-cuenta-corriente.mjs
// PG_BIN permite indicar el directorio de binarios de PostgreSQL.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {exports,require:name=>name.startsWith('@/')?load(path.resolve('src',name.slice(2)+'.ts')):require(name)});
  return exports;
}
const { formatCuentaCorrienteComprobante, esComprobanteCuentaCorriente } = load(path.resolve('src/utils/cuentaCorrientePresentation.ts'));
for (const letter of ['a','b','c']) {
  const note={venta_id:'nc',tipo_movimiento:'credito',concepto:'nota_credito',venta:{tipo_comprobante:'nota_credito_'+letter,numero_comprobante:'0006-00000071'}};
  assert.equal(formatCuentaCorrienteComprobante(note),`Nota de Crédito ${letter.toUpperCase()}: 0006-00000071`);
  assert.equal(formatCuentaCorrienteComprobante(note,undefined,'FACTURA'),`Nota de Crédito ${letter.toUpperCase()}: 0006-00000071`);
  assert.equal(esComprobanteCuentaCorriente(note),true);
  const payment={...note,concepto:'pago_transferencia'};
  assert.equal(esComprobanteCuentaCorriente(payment),false);
  assert.equal(formatCuentaCorrienteComprobante(payment),'Pago por Transferencia');
}
console.log('OK Presentacion: etiquetas NC A/B/C en pantalla y PDF; comprobantes separados de cobros.');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgBin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const executable = (name) => path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
if (pgBin && !existsSync(executable('initdb'))) throw new Error('Indicá PG_BIN con una instalación local de PostgreSQL.');
const tempRoot = realpathSync(os.tmpdir());
const cluster = mkdtempSync(path.join(tempRoot, 'vortex-notas-test-'));
const dataDir = path.join(cluster, 'data');
const server = net.createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const env = { ...process.env, PGCLIENTENCODING: 'UTF8', PSQLRC: path.join(cluster, 'no-psqlrc') };
const command = (name, args, input) => spawnSync(executable(name), args, {
  input, encoding: 'utf8', windowsHide: true, env,
  // El postmaster de Windows hereda los pipes de pg_ctl si se capturan.
  // Su log ya se escribe en el archivo temporal indicado con -l.
  stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
  timeout: 30_000,
});
const checked = (result) => {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const psqlArgs = ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = (input) => checked(command('psql', psqlArgs, input));
const migration = (name) => readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8');
const tenant = 'a4983b26-4f3d-46e0-8e4f-46bd34fec838';
const client = '20000000-0000-0000-0000-000000000001';
let started = false;
try {
  checked(command('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']));
  checked(command('pg_ctl', ['-D', dataDir, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']));
  started = true;
  sql(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE TABLE clientes(id uuid PRIMARY KEY, comercio_id uuid, nombre text, apellido text);
    CREATE TABLE ventas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid, cliente_id uuid, tipo_comprobante text,
      numero_comprobante text, fecha_venta timestamptz, total numeric, cae text);
    CREATE TABLE cuenta_corriente(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid, cliente_id uuid,
      venta_id uuid REFERENCES ventas(id), tipo_movimiento text, concepto text, monto numeric, cheque_id uuid);
    INSERT INTO clientes VALUES ('${client}','${tenant}','MARCELO','BRUERA');
  `);
  const protection = migration('20261002100000_cobros_cliente_multi_comprobante.sql');
  sql(protection.slice(protection.indexOf('CREATE FUNCTION public.proteger_cuenta_corriente_venta_cae()'), protection.indexOf('CREATE FUNCTION public.registrar_pagos_cliente_multi_documento(')));
  const numbering = migration('20260907150000_ventas_transaccionales_numeracion.sql');
  sql(numbering.slice(numbering.indexOf('CREATE OR REPLACE FUNCTION public.ventas_punto_venta_canonico'), numbering.indexOf('-- Preflight:')));
  // Asiento anterior a la correccion, luego autorizado con CAE.
  sql(`
    INSERT INTO ventas(comercio_id,cliente_id,tipo_comprobante,numero_comprobante,fecha_venta,total)
    VALUES ('${tenant}','${client}','nota_credito_a','0006-00000071','2026-10-29T15:00:00Z',12000);
    INSERT INTO cuenta_corriente(comercio_id,cliente_id,venta_id,tipo_movimiento,concepto,monto)
    SELECT comercio_id,cliente_id,id,'debito','pago_cuenta_corriente',12000 FROM ventas;
    UPDATE ventas SET cae='12345678901234';
  `);
  sql(migration('20261030120000_notas_cuenta_corriente_signo.sql'));
  assert.equal(sql('SELECT tipo_movimiento FROM cuenta_corriente;').trim(),'debito');
  const original=sql('SELECT row_to_json(v) FROM ventas v;');
  const repair=readFileSync(path.join(repo,'docs/sql/reparar-nc-bruera-bostico.sql'),'utf8');
  sql(repair); sql(repair);
  assert.equal(sql("SELECT tipo_movimiento || ':' || concepto FROM cuenta_corriente;").trim(),'credito:nota_credito');
  const protectedDelete=command('psql',psqlArgs,'DELETE FROM cuenta_corriente;');
  assert.notEqual(protectedDelete.status,0); assert.match(protectedDelete.stderr,/CAE/);
  for (const type of ['nota_credito_a','nota_credito_b','nota_credito_c','nota_debito_a','nota_debito_b','nota_debito_c','factura_a']) {
    sql(`
      INSERT INTO ventas(comercio_id,cliente_id,tipo_comprobante) VALUES ('${tenant}','${client}','${type}');
      INSERT INTO cuenta_corriente(comercio_id,cliente_id,venta_id,tipo_movimiento,concepto,monto)
      SELECT comercio_id,cliente_id,id,'debito','pago_cuenta_corriente',12000 FROM ventas WHERE tipo_comprobante='${type}' AND cae IS NULL;
    `);
    const expected=type.startsWith('nota_credito')?'credito:nota_credito':type.startsWith('nota_debito')?'debito:nota_debito':'debito:pago_cuenta_corriente';
    assert.equal(sql(`SELECT cc.tipo_movimiento||':'||cc.concepto FROM cuenta_corriente cc JOIN ventas v ON v.id=cc.venta_id WHERE v.tipo_comprobante='${type}' AND v.cae IS NULL;`).trim(),expected);
  }
  assert.equal(sql(`SELECT sum(CASE WHEN cc.tipo_movimiento='debito' THEN monto ELSE -monto END) FROM cuenta_corriente cc JOIN ventas v ON v.id=cc.venta_id WHERE v.cae IS NOT NULL OR v.tipo_comprobante='factura_a';`).trim(),'0');
  assert.equal(sql('SELECT row_to_json(v) FROM ventas v WHERE cae IS NOT NULL;'),original);
  sql(`INSERT INTO cuenta_corriente(comercio_id,cliente_id,venta_id,tipo_movimiento,concepto,monto)
    SELECT comercio_id,cliente_id,id,'credito','pago_transferencia',100 FROM ventas WHERE cae IS NOT NULL;`);
  assert.equal(sql("SELECT count(*) FROM cuenta_corriente WHERE concepto='pago_transferencia' AND tipo_movimiento='credito';").trim(),'1');
  const foreign=command('psql',psqlArgs,`INSERT INTO cuenta_corriente(comercio_id,cliente_id,venta_id,tipo_movimiento,concepto,monto) SELECT '10000000-0000-0000-0000-000000000099',cliente_id,id,'debito','pago_cuenta_corriente',100 FROM ventas WHERE tipo_comprobante='factura_a';`);
  assert.notEqual(foreign.status,0); assert.match(foreign.stderr,/referencias_invalidas/);
  // La reparacion rechaza datos distintos y restaura la proteccion al revertir.
  sql('UPDATE ventas SET total=13000 WHERE cae IS NOT NULL;');
  const invalidRepair=command('psql',psqlArgs,repair);
  assert.notEqual(invalidRepair.status,0); assert.match(invalidRepair.stderr,/venta_no_univoca/);
  assert.equal(sql("SELECT tgenabled FROM pg_trigger WHERE tgname='prevent_authorized_cuenta_corriente_changes';").trim(),'O');
  console.log('OK PostgreSQL: NC A/B/C al Haber, ND A/B/C al Debe, factura, saldo cero, cobros, tenant, reparacion idempotente y proteccion CAE.');
} finally {
  if (started && existsSync(path.join(dataDir, 'postmaster.pid'))) {
    checked(command('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']));
  }
  const resolved = realpathSync(cluster);
  assert.equal(path.dirname(resolved), tempRoot);
  assert.ok(path.basename(resolved).startsWith('vortex-notas-test-'));
  rmSync(resolved, { recursive: true, force: true });
}
