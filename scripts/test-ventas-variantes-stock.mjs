// Migraciones reales en PostgreSQL temporal local. Nunca conecta con Supabase.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
const tempRoot = realpathSync(os.tmpdir()), cluster = mkdtempSync(path.join(tempRoot, 'vortex-variantes-test-')), dataDir = path.join(cluster, 'data');
const pgBin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve));
const command = (name, args, input) => {
  const result = spawnSync(path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')), args, { input, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 30000 });
  if (result.error) throw result.error; if (result.status !== 0) throw Error(result.stderr || result.stdout || name); return result.stdout;
};
const sql = input => command('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
const migration = name => readFileSync('supabase/migrations/' + name, 'utf8').replaceAll('\r\n', '\n');
const tenant = '10000000-0000-0000-0000-000000000001', foreign = '10000000-0000-0000-0000-000000000002', client = '20000000-0000-0000-0000-000000000001';
const product = '40000000-0000-0000-0000-000000000001', plain = '40000000-0000-0000-0000-000000000002', otherProduct = '40000000-0000-0000-0000-000000000003';
const v1 = '50000000-0000-0000-0000-000000000001', v2 = '50000000-0000-0000-0000-000000000002', v3 = '50000000-0000-0000-0000-000000000003';
const actor = `SET app.test_comercio='${tenant}'; SET app.test_admin='on'; SET ROLE authenticated;`;
const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
let sequence = 0;
const key = () => `60000000-0000-0000-0000-${String(++sequence).padStart(12, '0')}`;
const item = (variant = v2, quantity = 1, selectedProduct = product) => ({ producto_id: selectedProduct, ...(variant ? { producto_variante_id: variant } : {}), cantidad: quantity, precio_unitario: 100, porcentaje_iva: 0, afecta_stock: true });
const sale = (items = [item()], idempotency = key()) => `SELECT (registrar_venta_transaccional('${tenant}','recibo_x',1,'${client}','Prueba','ARS','cta_cte',${quote(items)},'[]','${idempotency}','2026-10-15',NULL,0,0,0,0)).id;`;
const check = (expression, label) => assert.equal(sql(`SELECT (${expression});`).trim(), 't', label);
const fails = (statement, error) => sql(`SET app.test_comercio='${tenant}'; SET app.test_admin='on'; SELECT test_expect_error($stmt$${statement}$stmt$,'${error}');`);
let started = false;
try {
  command('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  command('pg_ctl', ['-D', dataDir, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']); started = true;
  const fixture = readFileSync('scripts/test-edicion-venta.mjs', 'utf8').replaceAll('\r\n', '\n');
  const inicio = fixture.indexOf('  sql(`') + 7, fin = fixture.indexOf('\n  `);', inicio);
  assert.ok(inicio > 7 && fin > inicio);
  sql(fixture.slice(inicio, fin).replaceAll('${client}', client));
  sql(`ALTER TABLE ventas ADD COLUMN idempotency_key uuid, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN origen_orden_trabajo boolean DEFAULT false;
    CREATE TABLE comercio_parametrizacion(comercio_id uuid PRIMARY KEY REFERENCES comercio(id),parametros jsonb);
    CREATE TABLE afip_cae_intentos(venta_id uuid);
    CREATE TABLE ventas_numeradores(comercio_id uuid,tipo_comprobante tipo_comprobante,punto_venta integer,ultimo_numero bigint DEFAULT 0,updated_at timestamptz DEFAULT now(),PRIMARY KEY(comercio_id,tipo_comprobante,punto_venta));
    CREATE FUNCTION user_belongs_to_comercio(p_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT p_id=nullif(current_setting('app.test_comercio',true),'')::uuid $$;
    CREATE UNIQUE INDEX ventas_idempotency_key_unica ON ventas(comercio_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
    INSERT INTO comercio VALUES('${tenant}'),('${foreign}'); INSERT INTO clientes VALUES('${client}','${tenant}',NULL);
    INSERT INTO productos VALUES('${product}','${tenant}',3),('${plain}','${tenant}',5),('${otherProduct}','${foreign}',5);
    INSERT INTO comercio_parametrizacion VALUES('${tenant}','{"funciones":{"multiples_cuit":false,"ingreso_manual_numero_comprobante":true,"talles_colores_productos":true}}'),('${foreign}','{}');`);
  const numbering = migration('20260907150000_ventas_transaccionales_numeracion.sql');
  sql(numbering.slice(numbering.indexOf('CREATE OR REPLACE FUNCTION public.ventas_punto_venta_canonico'), numbering.indexOf('-- Preflight:')));
  sql(numbering.slice(numbering.indexOf('CREATE UNIQUE INDEX ventas_numeracion_canonica_unica'), numbering.indexOf('CREATE UNIQUE INDEX ventas_idempotency_key_unica')));
  sql(numbering.slice(numbering.indexOf('CREATE OR REPLACE FUNCTION public.sincronizar_numeracion_venta()'), numbering.indexOf('-- Conserva exactamente el comportamiento previo')));
  sql(migration('20260908130000_venta_items_precio_iva_decimal.sql'));
  sql(migration('20260924140000_numeracion_manual_comprobantes.sql'));
  sql(migration('20260916180000_ventas_desde_orden_permiten_stock_negativo.sql'));
  sql(migration('20261014130000_emisores_fiscales_estructura.sql'));
  sql(migration('20261014131000_emisores_fiscales_ventas.sql'));
  sql(`CREATE TRIGGER stock_insert AFTER INSERT ON venta_items FOR EACH ROW EXECUTE FUNCTION apply_venta_item_stock();
    CREATE TRIGGER stock_delete AFTER DELETE ON venta_items FOR EACH ROW EXECUTE FUNCTION apply_venta_item_stock();
    INSERT INTO producto_variantes VALUES('${v1}','${product}',2),('${v2}','${product}',1),('${v3}','${otherProduct}',5);
    GRANT SELECT ON comercio_parametrizacion TO authenticated;`);
  const stockMigration = migration('20260914160000_stock_por_talle_color.sql');
  sql(stockMigration.slice(stockMigration.indexOf('CREATE OR REPLACE FUNCTION public.sincronizar_stock_producto_variantes()'), stockMigration.indexOf('ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY')));
  const oldSale = sql(actor + sale([item(null)])).trim();
  check(`SELECT stock=2 FROM productos WHERE id='${product}'`, 'Reproduce descuento solo del total');
  check(`SELECT sum(stock)=3 FROM producto_variantes WHERE producto_id='${product}'`, 'Reproduce variantes sin descontar');
  sql(`DELETE FROM cuenta_corriente WHERE venta_id='${oldSale}'; DELETE FROM pagos_venta WHERE venta_id='${oldSale}'; DELETE FROM venta_items WHERE venta_id='${oldSale}'; DELETE FROM ventas WHERE id='${oldSale}';`);
  console.log('OK reproducción: la función previa descuenta el total y deja talles disponibles');

  sql(migration('20261015140000_ventas_conservar_variante_stock.sql'));
  const idem = key(), saved = sql(actor + sale([item()], idem)).trim();
  check(`SELECT producto_variante_id='${v2}' FROM venta_items WHERE venta_id='${saved}'`, 'Guarda talle/color');
  check(`SELECT stock=0 FROM producto_variantes WHERE id='${v2}'`, 'Descuenta la última unidad del talle');
  check(`SELECT stock=2 FROM productos WHERE id='${product}'`, 'Total consistente');
  assert.equal(sql(actor + sale([item()], idem)).trim(), saved);
  check(`SELECT stock=2 FROM productos WHERE id='${product}'`, 'Reintento no duplica el descuento');
  fails(actor + sale([item()]), 'Stock insuficiente');
  const before = sql('SELECT count(*) FROM ventas;').trim();
  fails(actor + sale([item(null)]), 'ventas_variante_requerida');
  fails(actor + sale([item(v3)]), 'ventas_variante_no_disponible');
  fails(actor + sale([{ descripcion_manual: 'Manual', producto_variante_id: v1, cantidad: 1, precio_unitario: 100, porcentaje_iva: 0, afecta_stock: false }]), 'ventas_item_invalido');
  assert.equal(sql('SELECT count(*) FROM ventas;').trim(), before, 'Fallos revierten cabecera y pagos');
  sql(`UPDATE productos SET stock=1 WHERE id='${product}';`);
  fails(actor + sale([item(v1)]), 'ventas_stock_variantes_desajustado');
  check(`SELECT stock=1 FROM productos WHERE id='${product}'`, 'No aumenta el stock correcto de Gestión');
  sql(`UPDATE productos SET stock=2 WHERE id='${product}';`);
  sql(actor + `UPDATE venta_items SET producto_variante_id='${v1}' WHERE venta_id='${saved}';`);
  check(`SELECT stock=1 FROM producto_variantes WHERE id='${v1}'`, 'Cambio de talle descuenta el nuevo');
  check(`SELECT stock=1 FROM producto_variantes WHERE id='${v2}'`, 'Cambio de talle repone el anterior');
  check(`SELECT stock=2 FROM productos WHERE id='${product}'`, 'Cambio de talle conserva el total');
  console.log('OK venta normal: variante persistida, última unidad, idempotencia, aislamiento, rollback y protección del stock real');

  sql(`UPDATE comercio_parametrizacion SET parametros=jsonb_set(parametros,'{funciones,multiples_cuit}','true') WHERE comercio_id='${tenant}';`);
  const emisor = sql(actor + `SELECT guardar_emisor_fiscal('${tenant}',${quote({ razon_social: 'Emisor prueba', cuit_emisor: '20111111112', punto_venta: 1, ambiente: 'homologacion', situacion_afip: 'Responsable Inscripto', activo: true, predeterminado: true })});`).trim();
  const emisorSale = sql(actor + `SELECT (registrar_venta_emisor_transaccional('${tenant}','recibo_x',1,'${client}','Prueba','ARS','cta_cte',${quote([item(v2)])},'[]','${key()}','${emisor}','2026-10-15',NULL,0,0,0,0,NULL)).id;`).trim();
  check(`SELECT producto_variante_id='${v2}' FROM venta_items WHERE venta_id='${emisorSale}'`, 'Multi-CUIT conserva variante');
  check(`SELECT stock=0 FROM producto_variantes WHERE id='${v2}'`, 'Multi-CUIT descuenta el talle');
  sql(`UPDATE comercio_parametrizacion SET parametros=jsonb_set(parametros,'{funciones,multiples_cuit}','false') WHERE comercio_id='${tenant}';`);
  sql(actor + `SELECT registrar_venta_manual_transaccional('${tenant}','recibo_x',1,'${client}','Prueba','ARS','cta_cte',${quote([item(v1)])},'[]','${key()}','2026-10-15',NULL,0,0,0,0,'0001-00000100');`);
  check(`SELECT stock=0 FROM productos WHERE id='${product}'`, 'Venta manual agota el producto');
  sql(actor + sale([item(null, 1, plain)]));
  check(`SELECT stock=4 FROM productos WHERE id='${plain}'`, 'Sin variantes conserva el funcionamiento');
  console.log('OK multi-CUIT, numeración manual, agotamiento y productos sin variantes');

  // Usa la definición real de la vista pública con tablas auxiliares mínimas.
  sql(`ALTER TABLE productos ADD COLUMN cod_producto text, ADD COLUMN descripcion text, ADD COLUMN precio_venta numeric DEFAULT 100,
    ADD COLUMN tipo_moneda text DEFAULT 'ARS', ADD COLUMN observaciones text, ADD COLUMN created_at timestamptz DEFAULT now(),
    ADD COLUMN rubro_id uuid, ADD COLUMN marca_id uuid, ADD COLUMN subrubro_id uuid, ADD COLUMN destacado_en_tienda boolean DEFAULT false,
    ADD COLUMN descripcion_tienda_html text, ADD COLUMN visible_en_tienda boolean DEFAULT true;
    CREATE TABLE rubros(id uuid,nombre text); CREATE TABLE marcas(id uuid,nombre text); CREATE TABLE subrubros(id uuid,nombre text);
    CREATE TABLE producto_imagenes(producto_id uuid,storage_path text,orden integer);
    CREATE TABLE producto_colores(id uuid,nombre text); CREATE TABLE producto_talles(id uuid,nombre text);
    CREATE TABLE producto_colores_asignados(producto_id uuid,color_id uuid); CREATE TABLE producto_talles_asignados(producto_id uuid,talle_id uuid);
    ALTER TABLE producto_variantes ADD COLUMN color_id uuid, ADD COLUMN talle_id uuid;`);
  sql(stockMigration.slice(stockMigration.indexOf('CREATE OR REPLACE VIEW public.tienda_productos AS'), stockMigration.indexOf('-- La misma API de la tienda')));
  check(`SELECT count(*)=0 FROM tienda_productos WHERE id='${product}'`, 'La vista real oculta el producto agotado');
  sql(`UPDATE producto_variantes SET stock=1 WHERE id='${v1}';`);
  check(`SELECT stock=1 AND jsonb_array_length(variantes)=1 AND variantes->0->>'id'='${v1}' FROM tienda_productos WHERE id='${product}'`, 'La vista expone solo el talle con stock');
  console.log('OK tienda: vista real actualiza stock y oculta producto o talle agotado');
} finally {
  if (started) command('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
  const resolved = realpathSync(cluster);
  if (!resolved.startsWith(tempRoot + path.sep) || !path.basename(resolved).startsWith('vortex-variantes-test-')) throw Error('Ruta temporal no segura');
  rmSync(resolved, { recursive: true, force: true });
}
