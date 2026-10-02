// Pruebas de integración en un clúster PostgreSQL temporal, sin conexiones remotas.
// Ejecutar: node scripts/test-cobros-cliente.mjs
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
const cluster = mkdtempSync(path.join(tempRoot, 'vortex-cobros-test-'));
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
    CREATE TABLE public.comercio(id uuid PRIMARY KEY);
    CREATE TABLE public.clientes(id uuid PRIMARY KEY, comercio_id uuid NOT NULL REFERENCES comercio(id));
    CREATE TABLE public.ventas(id uuid PRIMARY KEY, comercio_id uuid NOT NULL REFERENCES comercio(id), cliente_id uuid REFERENCES clientes(id), moneda text DEFAULT 'ARS', cae text);
    CREATE TABLE public.cuenta_corriente(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid REFERENCES comercio(id), cliente_id uuid NOT NULL REFERENCES clientes(id),
      tipo_movimiento text NOT NULL CHECK(tipo_movimiento IN ('debito','credito')), monto numeric NOT NULL,
      concepto text NOT NULL, venta_id uuid REFERENCES ventas(id) ON DELETE SET NULL,
      fecha_movimiento timestamptz DEFAULT now(), observaciones text, moneda text DEFAULT 'ARS'
    );
    CREATE TYPE public.estado_cheque AS ENUM('en_cartera','depositado','rechazado','endosado','emitido');
    CREATE TABLE public.cheques(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid REFERENCES comercio(id), numero_cheque text NOT NULL,
      banco_emisor text NOT NULL, monto numeric NOT NULL, fecha_emision date NOT NULL, fecha_vencimiento date NOT NULL,
      emisor_nombre text NOT NULL, emisor_cuit text, cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
      venta_id uuid REFERENCES ventas(id) ON DELETE SET NULL, cuenta_corriente_id uuid REFERENCES cuenta_corriente(id) ON DELETE SET NULL,
      estado public.estado_cheque NOT NULL DEFAULT 'en_cartera', observaciones text, tipo_cheque text DEFAULT 'tercero', movimiento_proveedor_id uuid
    );
    CREATE FUNCTION public.user_belongs_to_comercio(p_id uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT p_id = nullif(current_setting('app.test_comercio', true), '')::uuid $$;
    CREATE FUNCTION public.test_assert(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', p_label; END IF; END; $$;
    CREATE FUNCTION public.test_expect_error(p_sql text, p_message text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      BEGIN EXECUTE p_sql;
      EXCEPTION WHEN OTHERS THEN
        IF position(p_message IN SQLERRM) > 0 THEN RETURN; END IF;
        RAISE;
      END;
      RAISE EXCEPTION 'Expected rejection: %', p_message;
    END; $$;
    DO $$ DECLARE t text; BEGIN
      FOREACH t IN ARRAY ARRAY['clientes','ventas','cuenta_corriente','cheques'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant ON public.%I TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id))', t);
      END LOOP;
    END; $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO comercio VALUES ('${ids.tenant}'), ('${ids.otherTenant}');
    INSERT INTO clientes VALUES ('${ids.client}','${ids.tenant}'), ('${ids.otherClient}','${ids.tenant}'), ('${ids.foreignClient}','${ids.otherTenant}');
    INSERT INTO ventas(id,comercio_id,cliente_id) VALUES
      ('${ids.sale1}','${ids.tenant}','${ids.client}'), ('${ids.sale2}','${ids.tenant}','${ids.client}'),
      ('${ids.otherSale}','${ids.tenant}','${ids.otherClient}'), ('${ids.foreignSale}','${ids.otherTenant}','${ids.foreignClient}');
    INSERT INTO cuenta_corriente(comercio_id,cliente_id,venta_id,tipo_movimiento,monto,concepto) VALUES
      ('${ids.tenant}','${ids.client}','${ids.sale1}','debito',100,'pago_cuenta_corriente'),
      ('${ids.tenant}','${ids.client}','${ids.sale2}','debito',250,'pago_cuenta_corriente'),
      ('${ids.tenant}','${ids.otherClient}','${ids.otherSale}','debito',100,'pago_cuenta_corriente'),
      ('${ids.otherTenant}','${ids.foreignClient}','${ids.foreignSale}','debito',100,'pago_cuenta_corriente');
  `);
  // Usa el trigger real de integridad de tenants del repositorio.
  const tenantTrigger = migration('20260521110000_manual_sale_items.sql').match(/CREATE OR REPLACE FUNCTION public\.validate_same_comercio_references\(\)[\s\S]*?\$\$;/)?.[0];
  assert.ok(tenantTrigger);
  sql(tenantTrigger + `
    CREATE TRIGGER validate_tenant_cc BEFORE INSERT OR UPDATE ON public.cuenta_corriente FOR EACH ROW EXECUTE FUNCTION public.validate_same_comercio_references();
    CREATE TRIGGER validate_tenant_cheque BEFORE INSERT OR UPDATE ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.validate_same_comercio_references();
  `);
  sql(migration('20260924150000_pagos_mixtos_clientes.sql'));
  sql(migration('20261002100000_cobros_cliente_multi_comprobante.sql'));
  const test = (name, statements) => {
    sql(`BEGIN; ${asUser} ${statements} ROLLBACK;`);
    passed += 1;
    console.log(`OK ${name}`);
  };
  test('Un cheque, dos comprobantes, un solo ingreso a cartera',
    call([{ tipo: 'cheque', monto: 300, cheque }]) +
    check(`SELECT count(*) = 1 AND min(monto) = 300 FROM cheques`, 'cheque único') +
    check(`SELECT count(*) = 2 AND sum(monto) = 300 AND count(DISTINCT cheque_id) = 1 FROM cuenta_corriente WHERE tipo_movimiento = 'credito'`, 'dos imputaciones') +
    check(`SELECT sum(monto) = 100 FROM cuenta_corriente WHERE tipo_movimiento = 'credito' AND venta_id = '${ids.sale1}'`, 'primera venta saldada') +
    check(`SELECT sum(monto) = 200 FROM cuenta_corriente WHERE tipo_movimiento = 'credito' AND venta_id = '${ids.sale2}'`, 'segunda venta parcial') +
    check(`SELECT venta_id IS NULL AND cuenta_corriente_id IS NOT NULL FROM cheques`, 'referencias compatibles'));
  test('Respeta el orden elegido', call([{ tipo: 'transferencia', monto: 300 }], [ids.sale2, ids.sale1]) +
    check(`SELECT sum(monto) = 250 FROM cuenta_corriente WHERE tipo_movimiento = 'credito' AND venta_id = '${ids.sale2}'`, 'orden inverso'));
  test('Medios mixtos atraviesan comprobantes y conservan centavos',
    call([{ tipo: 'contado', monto: 25.55 }, { tipo: 'cheque', monto: 200.25, cheque }, { tipo: 'tarjeta', monto: 124.20 }]) +
    check(`SELECT sum(monto) = 350 AND count(*) = 4 FROM cuenta_corriente WHERE tipo_movimiento = 'credito'`, 'distribución exacta') +
    check(`SELECT monto = 200.25 FROM cheques`, 'monto total del cheque'));
  test('Revertir la segunda imputación revierte el cheque completo', call([{ tipo: 'cheque', monto: 300, cheque }]) +
    `SELECT eliminar_pago_cliente((SELECT id FROM cuenta_corriente WHERE cheque_id IS NOT NULL AND venta_id = '${ids.sale2}'));` +
    check(`SELECT count(*) = 0 FROM cheques`, 'cheque eliminado') +
    check(`SELECT count(*) = 0 FROM cuenta_corriente WHERE tipo_movimiento = 'credito'`, 'imputaciones revertidas'));
  for (const state of ['depositado', 'endosado', 'rechazado']) {
    test(`Bloquea reversión de cheque ${state}`, call([{ tipo: 'cheque', monto: 300, cheque }]) +
      `UPDATE cheques SET estado = '${state}';` +
      fails(`SELECT eliminar_pago_cliente((SELECT id FROM cuenta_corriente WHERE cheque_id IS NOT NULL LIMIT 1));`, 'cheque_cliente_pago_ya_utilizado') +
      check(`SELECT count(*) = 2 AND sum(monto) = 300 FROM cuenta_corriente WHERE tipo_movimiento = 'credito'`, 'reversión sin efectos'));
  }
  test('Revertir efectivo conserva otros medios', call([{ tipo: 'contado', monto: 50 }, { tipo: 'cheque', monto: 300, cheque }]) +
    `SELECT eliminar_pago_cliente((SELECT id FROM cuenta_corriente WHERE concepto = 'pago_efectivo'));` +
    check(`SELECT count(*) = 1 FROM cheques`, 'conserva cheque') +
    check(`SELECT sum(monto) = 300 FROM cuenta_corriente WHERE tipo_movimiento = 'credito'`, 'conserva imputaciones'));
  test('Compatibilidad de RPC de un comprobante',
    `SELECT registrar_pagos_cliente_mixtos('${ids.client}','${ids.sale1}','2026-10-02',NULL,${payments([{ tipo: 'cheque', monto: 80, cheque }])});` +
    check(`SELECT venta_id = '${ids.sale1}' AND monto = 80 FROM cheques`, 'RPC histórica'));
  test('Reversión de cheque histórico sin cheque_id',
    `INSERT INTO cuenta_corriente(comercio_id,cliente_id,venta_id,tipo_movimiento,monto,concepto) VALUES ('${ids.tenant}','${ids.client}','${ids.sale1}','credito',50,'pago_cheque');
     INSERT INTO cheques(comercio_id,cliente_id,venta_id,cuenta_corriente_id,numero_cheque,banco_emisor,monto,fecha_emision,fecha_vencimiento,emisor_nombre)
     SELECT '${ids.tenant}','${ids.client}','${ids.sale1}',id,'viejo','Banco',50,'2026-10-02','2026-11-02','Cliente' FROM cuenta_corriente WHERE tipo_movimiento='credito';
     SELECT eliminar_pago_cliente((SELECT cuenta_corriente_id FROM cheques));` +
    check(`SELECT count(*) = 0 FROM cheques`, 'cheque histórico revertido'));
  test('Rechaza comprobantes repetidos', fails(call([{ tipo: 'contado', monto: 10 }], [ids.sale1, ids.sale1]), 'comprobantes_cliente_invalidos'));
  test('Rechaza venta de otro cliente', fails(call([{ tipo: 'contado', monto: 10 }], [ids.sale1, ids.otherSale]), 'venta_cliente_no_disponible'));
  test('Rechaza venta de otro comercio', fails(call([{ tipo: 'contado', monto: 10 }], [ids.sale1, ids.foreignSale]), 'venta_cliente_no_disponible'));
  test('Rechaza cliente de otro comercio', fails(call([{ tipo: 'contado', monto: 10 }], [ids.foreignSale], ids.foreignClient), 'cliente_no_disponible'));
  test('Rechaza importe superior a los comprobantes', fails(call([{ tipo: 'contado', monto: 351 }]), 'pagos_cliente_superan_saldo'));
  test('Respeta créditos generales del cliente',
    `INSERT INTO cuenta_corriente(comercio_id,cliente_id,tipo_movimiento,monto,concepto) VALUES ('${ids.tenant}','${ids.client}','credito',200,'ajuste');` +
    fails(call([{ tipo: 'contado', monto: 151 }]), 'pagos_cliente_superan_saldo'));
  test('Revalida comprobantes ya cobrados', call([{ tipo: 'contado', monto: 100 }], [ids.sale1]) +
    fails(call([{ tipo: 'contado', monto: 10 }]), 'comprobante_cliente_sin_saldo'));
  test('Rechaza monedas distintas', `UPDATE ventas SET moneda = 'USD' WHERE id = '${ids.sale2}';` +
    fails(call([{ tipo: 'contado', monto: 10 }]), 'comprobantes_cliente_moneda_distinta'));
  for (const items of [[{ tipo: 'contado', monto: 0 }], [{ monto: 10 }], [{ tipo: 'contado', monto: 1.001 }], [{ tipo: 'contado', monto: null }]]) {
    test(`Rechaza pago inválido ${JSON.stringify(items)}`, fails(call(items), 'pago_cliente_mixto_item_invalido'));
  }
  test('Un cheque inválido revierte incluso pagos previos de la operación',
    fails(call([{ tipo: 'contado', monto: 20 }, { tipo: 'cheque', monto: 30, cheque: {} }]), 'datos_cheque_cliente_incompletos') +
    check(`SELECT count(*) = 0 FROM cuenta_corriente WHERE tipo_movimiento = 'credito'`, 'operación atómica'));
  test('FK impide borrar un cheque dejando sus imputaciones', call([{ tipo: 'cheque', monto: 300, cheque }]) +
    fails('DELETE FROM cheques;', 'violates foreign key constraint'));
  test('Integridad impide vincular un cheque a otro cliente', call([{ tipo: 'cheque', monto: 300, cheque }]) +
    fails(`UPDATE cuenta_corriente SET cliente_id = '${ids.otherClient}' WHERE cheque_id IS NOT NULL;`, 'cheque_cliente_imputacion_invalida'));
  test('Cobros sobre factura con CAE y protección del débito fiscal',
    `UPDATE ventas SET cae = '1234567890';` + call([{ tipo: 'cheque', monto: 300, cheque }]) +
    fails(`DELETE FROM cuenta_corriente WHERE venta_id = '${ids.sale1}' AND tipo_movimiento = 'debito';`, 'La venta tiene CAE') +
    fails(`UPDATE cuenta_corriente SET venta_id = NULL WHERE tipo_movimiento = 'debito' AND venta_id = '${ids.sale1}';`, 'La venta tiene CAE') +
    fails(`UPDATE cuenta_corriente SET monto = 1 WHERE tipo_movimiento = 'credito';`, 'La venta tiene CAE') +
    `SELECT eliminar_pago_cliente((SELECT id FROM cuenta_corriente WHERE cheque_id IS NOT NULL LIMIT 1));` +
    check(`SELECT count(*) = 0 FROM cheques`, 'reversión de cobro con CAE'));
  test('Permisos mínimos de ejecución',
    check(`SELECT NOT has_function_privilege('anon','public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)','EXECUTE')`, 'sin acceso anónimo') +
    check(`SELECT NOT has_function_privilege('authenticated','public.validar_cheque_imputacion_cliente()','EXECUTE')`, 'trigger sin ejecución directa'));

  // Dos sesiones reales: el segundo cobro debe esperar y revalidar el saldo global.
  sql(`INSERT INTO cuenta_corriente(comercio_id,cliente_id,tipo_movimiento,monto,concepto) VALUES ('${ids.tenant}','${ids.client}','credito',200,'ajuste');`);
  const child = spawn(executable('psql'), psqlArgs, { windowsHide: true, env });
  let firstError = '';
  child.stderr.on('data', (chunk) => { firstError += chunk; });
  const locked = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', (chunk) => { if (chunk.toString().includes('locked')) resolve(); });
    child.on('exit', (code) => { if (code !== 0) reject(new Error(firstError)); });
  });
  const completed = new Promise((resolve) => child.on('exit', resolve));
  child.stdin.end(`BEGIN; ${asUser} ${call([{ tipo: 'contado', monto: 100 }], [ids.sale1])} SELECT 'locked'; SELECT pg_sleep(0.5); COMMIT;`);
  await locked;
  const second = command('psql', psqlArgs, `${asUser} ${call([{ tipo: 'contado', monto: 100 }], [ids.sale2])}`);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /pagos_cliente_superan_saldo/);
  assert.equal(await completed, 0, firstError);
  sql(check(`SELECT sum(CASE WHEN tipo_movimiento='debito' THEN monto ELSE -monto END) = 50 FROM cuenta_corriente WHERE cliente_id='${ids.client}'`, 'saldo tras concurrencia'));
  passed += 1;
  console.log('OK Cobros simultáneos revalidan el saldo del cliente');
  console.log(`${passed} pruebas de integración correctas (PostgreSQL local temporal).`);
} finally {
  if (started && existsSync(path.join(dataDir, 'postmaster.pid'))) {
    checked(command('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']));
  }
  // Solo elimina el directorio temporal creado por esta ejecución.
  const resolved = realpathSync(cluster);
  assert.equal(path.dirname(resolved), tempRoot);
  assert.ok(path.basename(resolved).startsWith('vortex-cobros-test-'));
  rmSync(resolved, { recursive: true, force: true });
}
