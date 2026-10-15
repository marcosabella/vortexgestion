// Pruebas de integración en un clúster PostgreSQL temporal, sin conexiones remotas.
// Ejecutar: node scripts/test-recibos-cliente.mjs
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

  sql(`ALTER TABLE public.comercio ADD COLUMN nombre_comercio text DEFAULT 'Comercio prueba', ADD COLUMN calle text, ADD COLUMN numero text, ADD COLUMN localidad text, ADD COLUMN provincia text, ADD COLUMN codigo_postal text, ADD COLUMN telefono text, ADD COLUMN cuit text, ADD COLUMN situacion_afip text, ADD COLUMN ingresos_brutos text, ADD COLUMN fecha_inicio_actividad date, ADD COLUMN logo_url text, ADD COLUMN mostrar_razon_social_con_logo boolean;
    ALTER TABLE public.clientes ADD COLUMN nombre text DEFAULT 'Cliente', ADD COLUMN apellido text DEFAULT 'Prueba', ADD COLUMN cuit text, ADD COLUMN telefono text;
    ALTER TABLE public.ventas ADD COLUMN numero_comprobante text DEFAULT '0001 - 00000001';`);
  sql(migration('20261015160000_recibos_pago_cliente.sql'));
  const test = (name, statements) => {
    sql(`BEGIN; ${asUser} ${statements} ROLLBACK;`);
    passed += 1;
    console.log(`OK ${name}`);
  };

  const request='40000000-0000-0000-0000-000000000001';
  const receiptCall = (amount=100, key=request, client=ids.client, sales=[ids.sale1,ids.sale2], items=[{tipo:'contado',monto:amount}]) =>
    "SELECT public.registrar_cobro_cliente_con_recibo('"+client+"',ARRAY["+sales.map(id=>"'"+id+"'::uuid").join(',')+"],'2026-10-15','Prueba',"+payments(items)+",'"+key+"');";
  test('Pago parcial: saldo y datos de emision persistidos',receiptCall()+
    check("SELECT count(*)=1 AND min(importe)=100 AND min(saldo_anterior)=350 AND min(saldo_posterior)=250 FROM recibos_pago_cliente",'saldo parcial')+
    check("SELECT cliente_snapshot->>'nombre'='Cliente Prueba' AND comercio_snapshot->>'nombre_comercio'='Comercio prueba' AND cardinality(movimiento_ids)=1 FROM recibos_pago_cliente",'snapshot'));
  test('Pago total mixto: un recibo para todas las imputaciones',receiptCall(350,request,ids.client,[ids.sale1,ids.sale2],[{tipo:'contado',monto:50},{tipo:'cheque',monto:300,cheque}])+
    check("SELECT count(*)=1 AND min(saldo_posterior)=0 AND min(importe)=350 FROM recibos_pago_cliente",'total')+
    check("SELECT cardinality(movimiento_ids)=3 AND jsonb_array_length(documentos)=2 AND jsonb_array_length(pagos)=2 FROM recibos_pago_cliente",'agrupacion')+
    check("SELECT count(*)=1 FROM cheques",'cartera sin duplicados'));
  test('Reintento identico no vuelve a cobrar',receiptCall()+receiptCall()+
    check("SELECT count(*)=1 FROM recibos_pago_cliente",'un recibo')+
    check("SELECT sum(monto)=100 FROM cuenta_corriente WHERE tipo_movimiento='credito'",'un cobro')+
    fails(receiptCall(90),'solicitud_recibo_datos_distintos'));
  test('Reimpresion mantiene saldo e identidad aunque haya nuevos movimientos',receiptCall()+
    "RESET ROLE; UPDATE clientes SET nombre='Nombre nuevo' WHERE id='"+ids.client+"'; UPDATE comercio SET nombre_comercio='Otro nombre' WHERE id='"+ids.tenant+"';"+asUser+
    receiptCall(100,'40000000-0000-0000-0000-000000000002',ids.client,[ids.sale2])+
    check("SELECT saldo_posterior=250 AND cliente_snapshot->>'nombre'='Cliente Prueba' AND comercio_snapshot->>'nombre_comercio'='Comercio prueba' FROM recibos_pago_cliente WHERE numero=1",'snapshot original'));
  test('Reversion conserva el original marcado como anulado',receiptCall()+
    "SELECT eliminar_pago_cliente((SELECT movimiento_ids[1] FROM recibos_pago_cliente));"+
    check("SELECT importe=100 AND anulado_en IS NOT NULL FROM recibos_pago_cliente",'anulado')+
    check("SELECT sum(CASE WHEN tipo_movimiento='debito' THEN monto ELSE -monto END)=350 FROM cuenta_corriente WHERE cliente_id='"+ids.client+"'",'saldo restaurado'));
  test('No anula por actualizacion sin cambios reales',receiptCall()+
    "UPDATE cuenta_corriente SET observaciones=observaciones WHERE tipo_movimiento='credito';"+
    check("SELECT anulado_en IS NULL FROM recibos_pago_cliente",'sin cambio'));
  test('Modificacion de imputacion invalida el recibo',receiptCall()+
    "UPDATE cuenta_corriente SET monto=99 WHERE tipo_movimiento='credito';"+
    check("SELECT anulado_en IS NOT NULL FROM recibos_pago_cliente",'cambio detectado'));
  test('Error de cobro revierte todo',fails(receiptCall(351),'pagos_cliente_superan_saldo')+
    check("SELECT count(*)=0 FROM recibos_pago_cliente",'sin recibo')+
    check("SELECT count(*)=0 FROM cuenta_corriente WHERE tipo_movimiento='credito'",'sin cobro'));
  test('Aislamiento de empresas y permisos',receiptCall()+
    fails(receiptCall(10,request,ids.foreignClient,[ids.foreignSale]),'cliente_no_disponible')+
    "SET app.test_comercio='"+ids.otherTenant+"';"+
    check("SELECT count(*)=0 FROM recibos_pago_cliente",'RLS')+
    fails("UPDATE recibos_pago_cliente SET importe=1;",'permission denied')+
    fails("DELETE FROM recibos_pago_cliente;",'permission denied')+
    check("SELECT NOT has_function_privilege('anon','public.registrar_cobro_cliente_con_recibo(uuid,uuid[],date,text,jsonb,uuid)','EXECUTE')",'sin anon'));
  test('Numeracion consecutiva compartida entre clientes del mismo comercio',receiptCall()+
    receiptCall(50,'40000000-0000-0000-0000-000000000002',ids.otherClient,[ids.otherSale])+
    check("SELECT count(*)=2 AND min(numero)=1 AND max(numero)=2 FROM recibos_pago_cliente",'numeracion'));
  test('Integridad de referencias incluso con acceso privilegiado',receiptCall()+
    'RESET ROLE;'+fails("UPDATE recibos_pago_cliente SET cliente_id='"+ids.foreignClient+"';",'recibo_cliente_referencias_invalidas'));
  const child = spawn(executable('psql'), psqlArgs, { windowsHide:true, env });
  let firstError=''; child.stderr.on('data',chunk=>{firstError+=chunk;});
  const locked = new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.stdout.on('data',chunk=>{if(chunk.toString().includes('locked'))resolve();});
    child.on('exit',code=>{if(code!==0)reject(Error(firstError));});
  });
  const done = new Promise(resolve=>child.on('exit',resolve));
  child.stdin.end(`BEGIN; ${asUser} ${receiptCall()} SELECT 'locked'; SELECT pg_sleep(1); COMMIT;`);
  await locked;
  sql(`${asUser} ${receiptCall()}`);
  assert.equal(await done,0,firstError);
  sql(check("SELECT count(*)=1 FROM recibos_pago_cliente",'reintento concurrente')+
    check("SELECT sum(monto)=100 FROM cuenta_corriente WHERE tipo_movimiento='credito'",'cobro unico concurrente'));
  passed++;
  console.log('OK Reintentos simultaneos devuelven un solo recibo y un solo cobro');
  console.log(passed+' pruebas de recibos correctas (PostgreSQL local temporal).');
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
