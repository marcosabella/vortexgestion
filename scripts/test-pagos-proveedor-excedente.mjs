// Pruebas de integración en un clúster PostgreSQL temporal, sin conexiones remotas.
// Ejecutar: node scripts/test-pagos-proveedor-excedente.mjs
// PG_BIN permite indicar el directorio de binarios de PostgreSQL.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgBin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const executable = (name) => path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
if (pgBin && !existsSync(executable('initdb'))) throw new Error('Indicá PG_BIN con una instalación local de PostgreSQL.');
const tempRoot = realpathSync(os.tmpdir());
const cluster = mkdtempSync(path.join(tempRoot, 'vortex-pagos-proveedor-test-'));
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
const ids = {
  tenant: '10000000-0000-0000-0000-000000000001', otherTenant: '10000000-0000-0000-0000-000000000002',
  client: '20000000-0000-0000-0000-000000000001', otherClient: '20000000-0000-0000-0000-000000000002',
  foreignClient: '20000000-0000-0000-0000-000000000003',
  sale1: '30000000-0000-0000-0000-000000000001', sale2: '30000000-0000-0000-0000-000000000002',
  otherSale: '30000000-0000-0000-0000-000000000003', foreignSale: '30000000-0000-0000-0000-000000000004',
};
const cheque = { numero_cheque: '12345', banco_emisor: 'Banco prueba', emisor_nombre: 'Cliente prueba', fecha_emision: '2026-10-02', fecha_vencimiento: '2026-11-02' };
const payments = (items) => `'${JSON.stringify(items)}'::jsonb`;
const call = (items, sales = [ids.sale1, ids.sale2], client = ids.client) =>
  `SELECT public.registrar_pagos_cliente_multi_documento('${client}', ARRAY[${sales.map((id) => `'${id}'::uuid`).join(',')}], '2026-10-02', 'Prueba', ${payments(items)});`;
const check = (condition, label) => `SELECT public.test_assert((${condition}), '${label}');`;
const fails = (statement, expected) => `SELECT public.test_expect_error($stmt$${statement}$stmt$, '${expected}');`;
const asUser = `SET app.test_comercio = '${ids.tenant}'; SET ROLE authenticated;`;
let passed = 0;
let started = false;
try {
  checked(command('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']));
  checked(command('pg_ctl', ['-D', dataDir, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']));
  started = true;
  sql(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE TABLE proveedores(id uuid PRIMARY KEY, comercio_id uuid NOT NULL);
    CREATE TABLE compras_facturas(id uuid PRIMARY KEY, comercio_id uuid NOT NULL, proveedor_id uuid NOT NULL);
    CREATE TABLE gastos_egresos(id uuid PRIMARY KEY, comercio_id uuid NOT NULL, proveedor_id uuid NOT NULL, medio_pago text, estado text, concepto text);
    CREATE TYPE estado_cheque AS ENUM('en_cartera','depositado','rechazado','endosado','emitido');
    CREATE TABLE cheques(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL,
      numero_cheque text, banco_emisor text, monto numeric, fecha_emision date, fecha_vencimiento date,
      emisor_nombre text, emisor_cuit text, estado estado_cheque DEFAULT 'en_cartera', observaciones text,
      tipo_cheque text DEFAULT 'tercero', proveedor_id uuid, movimiento_proveedor_id uuid);
    CREATE TABLE cuenta_corriente_proveedores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL,
      proveedor_id uuid NOT NULL REFERENCES proveedores(id), factura_id uuid REFERENCES compras_facturas(id),
      gasto_egreso_id uuid REFERENCES gastos_egresos(id), tipo text, monto numeric CHECK(monto>0), fecha date,
      medio_pago text, observaciones text, cheque_id uuid REFERENCES cheques(id), created_at timestamptz DEFAULT now());
    CREATE TABLE pagos_compra(id uuid DEFAULT gen_random_uuid(), movimiento_id uuid, monto numeric, fecha date, tipo_pago text);
    CREATE TABLE migracion_id_map(comercio_id uuid, entidad text, id_destino uuid);
    CREATE FUNCTION user_belongs_to_comercio(p_id uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$SELECT p_id=nullif(current_setting('app.test_comercio',true),'')::uuid$$;
    ALTER TABLE cuenta_corriente_proveedores ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant ON cuenta_corriente_proveedores TO authenticated
      USING (public.user_belongs_to_comercio(comercio_id));
    GRANT SELECT ON cuenta_corriente_proveedores TO authenticated;
  `);
  const migration = (name) => readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8');
  const functionFrom = (name, fn) => {
    const found = migration(name).match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\$\\$;`));
    assert.ok(found, fn);
    return found[0];
  };
  sql(functionFrom('20260921120000_compras_facturas_y_cuenta_corriente_proveedores.sql', 'registrar_pago_factura_compra'));
  sql(functionFrom('20260923100000_pagos_cuenta_corriente_gastos.sql', 'registrar_pago_gasto_egreso'));
  sql(functionFrom('20260929120000_cheque_multi_comprobante_proveedor.sql', 'eliminar_pago_proveedor_con_cheque'));
  sql(migration('20261118110000_pagos_proveedor_excedente_todos_medios.sql'));
  const tenant = '00000000-0000-0000-0000-000000000001';
  const provider = '00000000-0000-0000-0000-000000000002';
  const invoice = '00000000-0000-0000-0000-000000000003';
  const expense = '00000000-0000-0000-0000-000000000004';
  const cheque = '00000000-0000-0000-0000-000000000005';
  sql(`INSERT INTO proveedores VALUES('${provider}','${tenant}');
    INSERT INTO compras_facturas VALUES('${invoice}','${tenant}','${provider}');
    INSERT INTO gastos_egresos VALUES('${expense}','${tenant}','${provider}','cuenta_corriente','pendiente','Gasto');
    INSERT INTO cuenta_corriente_proveedores(comercio_id,proveedor_id,factura_id,tipo,monto) VALUES('${tenant}','${provider}','${invoice}','deuda',393603.08);
    INSERT INTO cheques(id,comercio_id,numero_cheque,banco_emisor,monto) VALUES('${cheque}','${tenant}','00000262','E-CHEQ',470000);`);
  const call = (payments, documents = [{ factura_id: invoice }]) => `SELECT registrar_pagos_proveedor_multi_documento_v2('${provider}','2026-11-18','Prueba','${JSON.stringify(documents)}','${JSON.stringify(payments)}');`;
  const total = (where = 'true') => Number(sql(`SELECT coalesce(sum(monto),0) FROM cuenta_corriente_proveedores WHERE tipo='pago' AND ${where}`));
  const credit = () => total('factura_id IS NULL AND gasto_egreso_id IS NULL');
  const test = (name, run) => {
    // Restore fixtures after every case; RPC calls commit as in the application.
    sql(`CREATE SCHEMA snapshot; CREATE TABLE snapshot.mov AS TABLE cuenta_corriente_proveedores; CREATE TABLE snapshot.ch AS TABLE cheques; CREATE TABLE snapshot.g AS TABLE gastos_egresos;`);
    try { run(); console.log(`OK ${name}`); } finally {
      sql(`DELETE FROM pagos_compra; DELETE FROM cuenta_corriente_proveedores; DELETE FROM cheques;
        INSERT INTO cheques SELECT * FROM snapshot.ch; INSERT INTO cuenta_corriente_proveedores SELECT * FROM snapshot.mov;
        UPDATE gastos_egresos SET estado=s.estado FROM snapshot.g s WHERE gastos_egresos.id=s.id; DROP SCHEMA snapshot CASCADE;`);
    }
  };
  const execute = (statement) => sql(`SET ROLE authenticated; SET app.test_comercio='${tenant}'; ${statement}`);
  test('eCheq 00000262: deuda 393603.08, pago 470000, saldo a favor 76396.92 y reversion completa', () => {
    execute(call([{ tipo: 'cheque', monto: 470000, cheque_id: cheque }]));
    assert.equal(total(), 470000); assert.equal(credit(), 76396.92);
    assert.equal(total(`factura_id='${invoice}'`), 393603.08);
    assert.equal(sql(`SELECT estado FROM cheques WHERE id='${cheque}'` ).trim(), 'endosado');
    assert.equal(sql(`SELECT count(DISTINCT cheque_id) FROM cuenta_corriente_proveedores WHERE tipo='pago'`).trim(), '1');
    execute(`SELECT eliminar_pago_proveedor_con_cheque((SELECT id FROM cuenta_corriente_proveedores WHERE tipo='pago' AND factura_id IS NULL LIMIT 1));`);
    assert.equal(total(), 0); assert.equal(sql(`SELECT estado FROM cheques WHERE id='${cheque}'`).trim(), 'en_cartera');
  });
  for (const method of ['contado','transferencia','tarjeta']) test(`Excedente ${method}`, () => {
    execute(call([{ tipo: method, monto: 470000 }]));
    assert.equal(total(), 470000); assert.equal(credit(), 76396.92);
    assert.equal(sql(`SELECT medio_pago FROM cuenta_corriente_proveedores WHERE factura_id IS NULL`).trim(), method);
  });
  test('Varios medios, incluyendo un medio completo a favor', () => {
    execute(call([{ tipo:'contado',monto:393603.08 },{tipo:'transferencia',monto:100},{tipo:'tarjeta',monto:50}]));
    assert.equal(total(),393753.08); assert.equal(credit(),150);
  });
  test('Cheque completo a favor despues de cancelar la deuda con efectivo', () => {
    execute(call([{tipo:'contado',monto:393603.08},{tipo:'cheque',monto:470000,cheque_id:cheque}]));
    assert.equal(credit(),470000);
    assert.equal(sql(`SELECT movimiento_proveedor_id IS NOT NULL FROM cheques WHERE id='${cheque}'`).trim(),'t');
    execute(`SELECT eliminar_pago_proveedor_con_cheque((SELECT id FROM cuenta_corriente_proveedores WHERE cheque_id='${cheque}' LIMIT 1));`);
    assert.equal(total(),393603.08); assert.equal(credit(),0);
  });
  for (const value of [393603.08, 100]) test(`Pago sin excedente ${value}`, () => {
    execute(call([{tipo:'transferencia',monto:value}]));
    assert.equal(total(),value); assert.equal(credit(),0);
  });
  const own = {numero_cheque:'PROPIO',banco_emisor:'Banco',emisor_nombre:'Emisor',fecha_emision:'2026-11-18',fecha_vencimiento:'2026-12-18'};
  test('Cheque propio mayor y reversion desde el excedente', () => {
    execute(call([{tipo:'cheque',monto:470000,cheque_propio:own}]));
    assert.equal(credit(),76396.92);
    execute(`SELECT eliminar_pago_proveedor_con_cheque((SELECT id FROM cuenta_corriente_proveedores WHERE tipo='pago' AND factura_id IS NULL LIMIT 1));`);
    assert.equal(total(),0); assert.equal(sql(`SELECT count(*) FROM cheques WHERE tipo_cheque='propio'`).trim(),'0');
  });
  test('Gasto e historico se cancelan y excedente general queda separado', () => {
    sql(`INSERT INTO cuenta_corriente_proveedores(comercio_id,proveedor_id,gasto_egreso_id,tipo,monto) VALUES('${tenant}','${provider}','${expense}','deuda',100);
      INSERT INTO cuenta_corriente_proveedores(id,comercio_id,proveedor_id,tipo,monto) VALUES('00000000-0000-0000-0000-000000000006','${tenant}','${provider}','deuda',200);
      INSERT INTO migracion_id_map VALUES('${tenant}','cuenta_corriente_proveedores','00000000-0000-0000-0000-000000000006');`);
    execute(call([{tipo:'transferencia',monto:500}],[{gasto_id:expense},{saldo_historico:true}]));
    assert.equal(total(`gasto_egreso_id='${expense}'`),100); assert.equal(credit(),400);
    assert.equal(sql(`SELECT estado FROM gastos_egresos WHERE id='${expense}'`).trim(),'pagado');
    assert.equal(total(`observaciones LIKE 'Saldo a favor%'`),200);
    sql('DELETE FROM migracion_id_map;');
  });
  for (const amount of [100,393603.08]) test(`Sin excedente ${amount}`, () => {
    execute(call([{tipo:'contado',monto:amount}])); assert.equal(total(),amount); assert.equal(credit(),0);
  });
  test('Cheque duplicado revierte toda la operacion', () => {
    assert.throws(()=>execute(call([{tipo:'cheque',monto:470000,cheque_id:cheque},{tipo:'cheque',monto:470000,cheque_id:cheque}])),/cheque_cartera_no_disponible/);
    assert.equal(total(),0);
  });
  test('Tenant ajeno, anonimo, importe invalido y cheque de otro importe bloqueados', () => {
    assert.throws(()=>sql(`SET ROLE authenticated; SET app.test_comercio='00000000-0000-0000-0000-000000000099';${call([{tipo:'contado',monto:470000}])}`),/invalido/);
    assert.throws(()=>sql(`SET ROLE anon;${call([{tipo:'contado',monto:470000}])}`),/permission denied/);
    assert.throws(()=>execute(call([{tipo:'contado',monto:-1}])),/invalido/);
    assert.throws(()=>execute(call([{tipo:'cheque',monto:470001,cheque_id:cheque}])),/cheque_monto_pago_diferente/);
    assert.equal(total(),0);
  });
  console.log('Pruebas de pagos con excedente correctas en PostgreSQL local temporal.');
} finally {
  if (started && existsSync(path.join(dataDir, 'postmaster.pid'))) checked(command('pg_ctl', ['-D',dataDir,'-m','immediate','-w','stop']));
  const resolved = realpathSync(cluster);
  assert.equal(path.dirname(resolved),tempRoot);
  assert.ok(path.basename(resolved).startsWith('vortex-pagos-proveedor-test-'));
  rmSync(resolved,{recursive:true,force:true});
}
