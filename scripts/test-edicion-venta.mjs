// Integración real en PostgreSQL temporal. No se conecta a Supabase.
// Ejecutar: node scripts/test-edicion-venta.mjs (PG_BIN opcional).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgBin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const executable = name => path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const tempRoot = realpathSync(os.tmpdir());
const cluster = mkdtempSync(path.join(tempRoot, 'vortex-edicion-venta-test-'));
const dataDir = path.join(cluster, 'data');
const server = net.createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const env = { ...process.env, PGCLIENTENCODING: 'UTF8', PSQLRC: path.join(cluster, 'no-psqlrc') };
const command = (name, args, input) => spawnSync(executable(name), args, {
  input, encoding: 'utf8', windowsHide: true, env,
  stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 30_000,
});
const checked = result => {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const sql = input => checked(command('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input));
const migration = name => readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8');
const tenant = '10000000-0000-0000-0000-000000000001';
const foreignTenant = '10000000-0000-0000-0000-000000000002';
const sale = '30000000-0000-0000-0000-000000000001';
const client = '20000000-0000-0000-0000-000000000001';
const product = '40000000-0000-0000-0000-000000000001';
const foreignProduct = '40000000-0000-0000-0000-000000000002';
const variant = '50000000-0000-0000-0000-000000000001';
const header = { numero_comprobante: '0001-00000027', fecha_venta: '2026-10-01T10:57:00Z', tipo_comprobante: 'recibo_x', cliente_nombre: 'Prueba', cliente_id: client };
const manual = { descripcion_manual: 'Hosting', cantidad: 1, precio_unitario: 200000, porcentaje_iva: 0, subtotal: 200000, monto_iva: 0, total: 200000 };
const payment = { tipo_pago: 'transferencia', monto: 200000 };
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const call = (items = [manual], payments = [payment], saleHeader = header, commerce = tenant) =>
  `SELECT public.actualizar_venta_transaccional('${commerce}', '${sale}', ${json(saleHeader)}, ${json(items)}, ${json(payments)});`;
const check = (condition, label) => `SELECT test_assert((${condition}), '${label}');`;
const fails = (statement, expected) => `SELECT test_expect_error($stmt$${statement}$stmt$, '${expected}');`;
const asUser = `SET app.test_comercio = '${tenant}'; SET app.test_admin = 'on'; SET ROLE authenticated;`;
let passed = 0;
let started = false;
try {
  checked(command('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']));
  checked(command('pg_ctl', ['-D', dataDir, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']));
  started = true;
  sql(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${client}'::uuid $$;
    CREATE FUNCTION public.user_is_comercio_admin(p_id uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT p_id = nullif(current_setting('app.test_comercio', true), '')::uuid AND current_setting('app.test_admin',true)='on' $$;
    CREATE TYPE tipo_pago AS ENUM ('contado','transferencia','tarjeta','cheque','cta_cte','mercado_pago');
    CREATE TYPE tipo_comprobante AS ENUM ('recibo_x','factura_a','factura_c');
    CREATE TABLE comercio(id uuid PRIMARY KEY);
    CREATE TABLE clientes(id uuid PRIMARY KEY, comercio_id uuid, cuit text);
    CREATE TABLE productos(id uuid PRIMARY KEY, comercio_id uuid, stock integer);
    CREATE TABLE producto_variantes(id uuid PRIMARY KEY, producto_id uuid REFERENCES productos(id), stock integer);
    CREATE TABLE bancos(id uuid PRIMARY KEY, comercio_id uuid);
    CREATE TABLE tarjetas_credito(id uuid PRIMARY KEY, comercio_id uuid);
    CREATE TABLE cheques(id uuid PRIMARY KEY, comercio_id uuid);
    CREATE TABLE ventas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid,
      numero_comprobante text, fecha_venta timestamptz, tipo_pago tipo_pago, tipo_comprobante tipo_comprobante,
      cliente_id uuid REFERENCES clientes(id), cliente_nombre text, cae text, moneda text DEFAULT 'ARS',
      punto_venta integer,numero_secuencial bigint,cae_vencimiento date,cae_error text,cae_solicitado_at timestamptz,
      porcentaje_descuento numeric, monto_descuento numeric, porcentaje_recargo numeric, monto_recargo numeric,
      subtotal numeric, total_iva numeric, total numeric, observaciones text, idempotency_payload jsonb);
    CREATE TABLE venta_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venta_id uuid REFERENCES ventas(id), comercio_id uuid,
      producto_id uuid REFERENCES productos(id), producto_variante_id uuid REFERENCES producto_variantes(id),
      descripcion_manual text, codigo_manual text, cantidad numeric NOT NULL, precio_unitario numeric NOT NULL,
      porcentaje_iva numeric NOT NULL, porcentaje_descuento numeric, monto_descuento numeric,
      porcentaje_recargo numeric, monto_recargo numeric, monto_iva numeric, subtotal numeric, total numeric,
      afecta_stock boolean NOT NULL DEFAULT true,
      CONSTRAINT venta_items_stock_coherente CHECK ((afecta_stock AND producto_id IS NOT NULL AND cantidad=trunc(cantidad)) OR (NOT afecta_stock AND producto_id IS NULL)),
      CONSTRAINT venta_items_cantidad_valida CHECK (cantidad>0 AND scale(cantidad)<=4));
    CREATE TABLE pagos_venta(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venta_id uuid REFERENCES ventas(id), comercio_id uuid,
      tipo_pago tipo_pago, monto numeric, banco_id uuid REFERENCES bancos(id), tarjeta_id uuid REFERENCES tarjetas_credito(id),
      cuotas integer, recargo_cuotas numeric, cheque_id uuid REFERENCES cheques(id), moneda text);
    CREATE TABLE cuenta_corriente(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid,
      cliente_id uuid REFERENCES clientes(id), tipo_movimiento text, monto numeric, concepto text, venta_id uuid REFERENCES ventas(id), fecha_movimiento timestamptz, moneda text);
    CREATE FUNCTION test_assert(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',p_label; END IF; END; $$;
    CREATE FUNCTION test_expect_error(p_sql text,p_message text) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN IF position(p_message IN SQLERRM)>0 THEN RETURN; END IF; RAISE; END;
      RAISE EXCEPTION 'Expected rejection: %',p_message; END; $$;
    CREATE FUNCTION test_snapshot() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ventas t), (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM venta_items t),
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM productos t), (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM producto_variantes t),
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM pagos_venta t), (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM cuenta_corriente t)) $$;
    CREATE TABLE test_before(snapshot jsonb);
    DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['ventas','venta_items','pagos_venta','cuenta_corriente','productos','clientes','bancos','tarjetas_credito','cheques'] LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
      EXECUTE format('CREATE POLICY tenant ON %I FOR ALL TO authenticated USING (comercio_id=nullif(current_setting(''app.test_comercio'',true),'''')::uuid) WITH CHECK (comercio_id=nullif(current_setting(''app.test_comercio'',true),'''')::uuid)',t);
    END LOOP; END; $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    CREATE POLICY update_permission ON ventas AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (current_setting('app.test_update_denied',true) IS DISTINCT FROM 'on');
  `);
  sql(migration('20260916180000_ventas_desde_orden_permiten_stock_negativo.sql'));
  sql(`CREATE TRIGGER stock_insert AFTER INSERT ON venta_items FOR EACH ROW EXECUTE FUNCTION apply_venta_item_stock();
    CREATE TRIGGER stock_delete AFTER DELETE ON venta_items FOR EACH ROW EXECUTE FUNCTION apply_venta_item_stock();`);
  sql(migration('20261005120000_actualizar_venta_transaccional.sql'));
  // Incluye las funciones y el indice reales, cuyos permisos afectan incluso
  // UPDATEs de cabecera. Reproduce el error reportado antes de corregirlo.
  const numbering = migration('20260907150000_ventas_transaccionales_numeracion.sql');
  sql(numbering.slice(numbering.indexOf('CREATE OR REPLACE FUNCTION public.ventas_punto_venta_canonico'), numbering.indexOf('-- Preflight:')));
  sql(numbering.slice(numbering.indexOf('CREATE UNIQUE INDEX ventas_numeracion_canonica_unica'), numbering.indexOf('CREATE UNIQUE INDEX ventas_idempotency_key_unica')));
  sql(`INSERT INTO comercio VALUES ('${tenant}'),('${foreignTenant}');
    INSERT INTO clientes VALUES ('${client}','${tenant}',NULL);
    INSERT INTO productos VALUES ('${product}','${tenant}',10),('${foreignProduct}','${foreignTenant}',10);
    INSERT INTO producto_variantes VALUES ('${variant}','${product}',10);
    INSERT INTO bancos VALUES ('${foreignProduct}','${foreignTenant}');
    INSERT INTO ventas(id,comercio_id,numero_comprobante,fecha_venta,tipo_pago,tipo_comprobante,cliente_id,cliente_nombre,subtotal,total_iva,total)
    VALUES ('${sale}','${tenant}','0001-00000027','2026-10-01','transferencia','recibo_x','${client}','Original',200000,0,200000);
    `);
  sql(`${asUser} ${fails(call([manual], [payment], { ...header, numero_comprobante: '0001-00000028' }), 'permission denied for function ventas_punto_venta_canonico')}`);
  passed++; console.log('OK Reproduce el fallo de permisos con el indice real');
  sql(migration('20261005130000_permisos_funciones_indice_numeracion_ventas.sql'));
  sql(`${asUser} ${call()}`);
  const unchanged = check('SELECT snapshot=test_snapshot() FROM test_before', 'ninguna escritura parcial');
  const test = (name, statements) => {
    sql(`BEGIN; ${asUser} INSERT INTO test_before SELECT test_snapshot(); ${statements} ROLLBACK;`);
    passed++; console.log(`OK ${name}`);
  };
  test('Editar concepto manual con afecta_stock omitido', call() + check('SELECT NOT afecta_stock AND producto_id IS NULL FROM venta_items', 'manual sin stock'));
  test('Normaliza bandera falsa en producto y true en manual', call([{ ...manual, afecta_stock: true }]) +
    call([{ ...manual, producto_id: product, afecta_stock: false }]) + check('SELECT afecta_stock FROM venta_items', 'producto con stock'));
  test('Cantidades decimales manuales', call([{ ...manual, cantidad: 0.5, precio_unitario: 400000 }]) + check('SELECT cantidad=0.5 AND NOT afecta_stock FROM venta_items','cantidad decimal'));
  test('Edición repetida no descuenta dos veces stock', call([{ ...manual, producto_id: product }]) + call([{ ...manual, producto_id: product }]) + check(`SELECT stock=9 FROM productos WHERE id='${product}'`, 'stock neto'));
  test('Stock de variante', call([{ ...manual, producto_id: product, producto_variante_id: variant }]) + check(`SELECT stock=9 FROM producto_variantes WHERE id='${variant}'`, 'stock variante'));
  test('Stock insuficiente revierte cabecera e ítems borrados', fails(call([{ ...manual, producto_id: product, cantidad: 11, precio_unitario: 200000/11, total: 200000 }]), 'Stock insuficiente') + unchanged);
  test('Constraint fallido después de borrar conserva detalle', fails(call([{ ...manual, cantidad: 1.00001, precio_unitario: 200000/1.00001 }]), 'venta_items_cantidad_valida') + unchanged);
  sql(`CREATE FUNCTION test_payment_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('app.test_payment_fail',true)='on' THEN RAISE EXCEPTION 'pago_rechazado'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER test_payment_fail BEFORE INSERT ON pagos_venta FOR EACH ROW EXECUTE FUNCTION test_payment_fail();`);
  test('Fallo tardío de pago revierte detalle, stock y cuenta corriente', `SET app.test_payment_fail='on';` +
    fails(call([{ ...manual, producto_id: product }]), 'pago_rechazado') + unchanged);
  test('Conserva cobros imputados al actualizar cuenta corriente',
    `INSERT INTO cuenta_corriente(comercio_id,cliente_id,tipo_movimiento,monto,concepto,venta_id) VALUES ('${tenant}','${client}','credito',50000,'cobro','${sale}');` +
    call([manual], [{ tipo_pago: 'cta_cte', monto: 200000 }]) +
    check("SELECT count(*)=1 FROM cuenta_corriente WHERE tipo_movimiento='credito'", 'crédito conservado') +
    check("SELECT sum(monto)=200000 FROM cuenta_corriente WHERE tipo_movimiento='debito'", 'débito actualizado'));
  test('Permiso administrador', `SET app.test_admin='off';` + fails(call(), 'ventas_no_disponible') + unchanged);
  test('RLS impide edición sin borrar el detalle', `SET app.test_update_denied='on';` + fails(call(), 'ventas_no_disponible') + unchanged);
  test('Venta de otro comercio', fails(call([manual], [payment], header, foreignTenant), 'ventas_no_disponible') + unchanged);
  test('Producto de otro comercio', fails(call([{ ...manual, producto_id: foreignProduct }]), 'ventas_producto_no_disponible') + unchanged);
  test('Variante incompatible con concepto manual', fails(call([{ ...manual, producto_variante_id: variant }]), 'ventas_producto_no_disponible') + unchanged);
  test('CAE bloquea actualización', `UPDATE ventas SET cae='123456'; TRUNCATE test_before; INSERT INTO test_before SELECT test_snapshot();` + fails(call(), 'La venta tiene CAE') + unchanged);
  test('Rechaza pagos inconsistentes', fails(call([manual], [{ ...payment, monto: 1 }]), 'ventas_pagos_no_coinciden') + unchanged);
  test('Rechaza detalle vacío', fails(call([], [payment]), 'ventas_detalle_requerido') + unchanged);
  test('Rechaza pago de otro comercio', fails(call([manual], [{ ...payment, banco_id: foreignProduct }]), 'ventas_pago_invalido') + unchanged);
  test('Conserva origen de orden y campos protegidos', `UPDATE ventas SET origen_orden_trabajo=true;` +
    call([manual], [payment], { ...header, origen_orden_trabajo: false, comercio_id: foreignTenant, cae: '123', moneda: 'USD' }) +
    check(`SELECT origen_orden_trabajo AND cae IS NULL AND moneda='ARS' AND comercio_id='${tenant}' FROM ventas`, 'campos protegidos'));
  test('Recalcula totales con IVA, descuento general y recargo de cuotas',
    call([{ ...manual, precio_unitario: 121, porcentaje_iva: 21, subtotal: 100, monto_iva: 21, total: 121 }],
      [{ tipo_pago: 'tarjeta', monto: 121, recargo_cuotas: 12.1 }], { ...header, porcentaje_descuento: 10, total: 1 }) +
    check('SELECT total=121 AND subtotal=100 AND total_iva=21 FROM ventas','totales backend'));
  test('Sin permisos para anónimo', check("SELECT NOT has_function_privilege('anon','actualizar_venta_transaccional(uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE')", 'permiso anon'));
  test('Permisos minimos de funciones del indice',
    check("SELECT ventas_punto_venta_canonico('0001-00000027')=1 AND ventas_numero_secuencial_canonico('0001-00000027')=27", 'funciones del indice disponibles') +
    check("SELECT NOT has_function_privilege('anon','ventas_punto_venta_canonico(text)','EXECUTE') AND NOT has_function_privilege('anon','ventas_numero_secuencial_canonico(text)','EXECUTE')", 'sin permiso anon'));
  test('Conserva unicidad de numeracion',
    fails(`INSERT INTO ventas(comercio_id,numero_comprobante,tipo_comprobante) VALUES ('${tenant}','0001-00000027','recibo_x');`, 'ventas_numeracion_canonica_unica') + unchanged);

  const repair = migration('20261005121000_recuperar_detalle_recibo_x_27_jovita.sql');
  const originalItems = [{ ...manual, descripcion_manual: 'MANTENIMIENTO HOSTING WEB - SEPTIEMBRE 2026', afecta_stock: false, porcentaje_descuento: 0, monto_descuento: 0, porcentaje_recargo: 0, monto_recargo: 0 }];
  // El payload de creación no incluye los totales calculados de las líneas.
  delete originalItems[0].subtotal; delete originalItems[0].monto_iva; delete originalItems[0].total;
  sql(`INSERT INTO ventas(id,comercio_id,numero_comprobante,fecha_venta,tipo_pago,tipo_comprobante,cliente_nombre,total,idempotency_payload)
    VALUES ('3a357436-95de-40f0-a6bf-7d2e2da58cd9','037c362e-555b-4b19-b257-5fd9c3a82203','0001-00000027','2026-10-01 10:57:00+00','transferencia','recibo_x','COOPERATIVA ELECTRICA JOVITA LIMITADA',200000,${json({ items: originalItems })});`);
  sql(repair); sql(repair);
  sql(check("SELECT count(*)=1 AND sum(total)=200000 AND bool_and(NOT afecta_stock) FROM venta_items WHERE venta_id='3a357436-95de-40f0-a6bf-7d2e2da58cd9'",'recuperación exacta e idempotente'));
  passed++; console.log('OK Recuperación acotada e idempotente del Recibo X 27');
  sql(migration('20261005140000_cache_wsaa_y_registro_intentos_cae.sql'));
  const cacheKey = 'produccion:wsfe:test';
  const reservation = '60000000-0000-0000-0000-000000000001';
  const reserve = `SELECT afip_wsaa_reservar_ticket('${tenant}','${cacheKey}','${reservation}');`;
  test('Tickets e intentos fiscales privados',
    fails('SELECT * FROM afip_wsaa_tickets;', 'permission denied') +
    fails(reserve, 'permission denied') + fails('SELECT * FROM afip_cae_intentos;', 'permission denied'));
  sql(`SET ROLE service_role; ${reserve}`);
  sql(`SET ROLE service_role; ${check(`SELECT afip_wsaa_reservar_ticket('${tenant}','${cacheKey}','70000000-0000-0000-0000-000000000001')->>'estado'='ocupado'`, 'reserva exclusiva')}`);
  const ticket = { token: 'test-token', sign: 'test-sign', expirationTime: '2099-01-01T00:00:00Z' };
  sql(`SET ROLE service_role; SELECT afip_wsaa_guardar_ticket('${tenant}','${cacheKey}','${reservation}',${json(ticket)});
    ${check(`SELECT afip_wsaa_reservar_ticket('${tenant}','${cacheKey}','${reservation}')->>'estado'='vigente'`, 'reutiliza TA')}
    ${check(`SELECT afip_wsaa_reservar_ticket('${foreignTenant}','${cacheKey}','${reservation}')->>'estado'='renovar'`, 'aislamiento tenant')}
    ${fails(`INSERT INTO afip_cae_intentos(venta_id,comercio_id,ambiente,cuit_emisor,punto_venta,tipo_comprobante,numero_secuencial,solicitud) VALUES ('${sale}','${foreignTenant}','produccion','20300323872',3,11,126,'{}');`, 'afip_intento_venta_comercio_invalido')}`);
  passed++; console.log('OK TA persistente, reserva exclusiva y aislamiento de comercio');

  // Prueba el trigger de numeracion real junto con la recuperacion de CAE.
  sql(numbering.slice(numbering.indexOf('CREATE OR REPLACE FUNCTION public.sincronizar_numeracion_venta()'), numbering.indexOf('-- Conserva exactamente el comportamiento previo')));
  sql(`INSERT INTO clientes VALUES ('80000000-0000-0000-0000-000000000001','037c362e-555b-4b19-b257-5fd9c3a82203','30545766678');`);
  const protection = migration('20260609120000_protect_ventas_with_cae.sql');
  sql(protection.slice(0, protection.indexOf('CREATE OR REPLACE FUNCTION public.prevent_authorized_venta_relation_changes()')));
  sql(`UPDATE ventas SET tipo_comprobante='factura_c',fecha_venta='2026-10-05 10:57+00',subtotal=200000,total_iva=0,
    cliente_id='80000000-0000-0000-0000-000000000001' WHERE id='3a357436-95de-40f0-a6bf-7d2e2da58cd9';`);
  const caeRepair = migration('20261005141000_recuperar_cae_factura_jovita_128.sql');
  sql(caeRepair); sql(caeRepair);
  sql(check("SELECT cae='86406153097333' AND numero_comprobante='0003-00000128' AND punto_venta=3 AND numero_secuencial=128 FROM ventas WHERE id='3a357436-95de-40f0-a6bf-7d2e2da58cd9'", 'recuperacion CAE coherente'));
  passed++; console.log('OK Recuperación de CAE idempotente con trigger real de numeración');
  console.log(`${passed} pruebas de integración correctas (PostgreSQL local temporal).`);
} finally {
  if (started && existsSync(path.join(dataDir, 'postmaster.pid'))) checked(command('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']));
  const resolved = realpathSync(cluster);
  assert.equal(path.dirname(resolved), tempRoot);
  assert.ok(path.basename(resolved).startsWith('vortex-edicion-venta-test-'));
  rmSync(resolved, { recursive: true, force: true });
}
