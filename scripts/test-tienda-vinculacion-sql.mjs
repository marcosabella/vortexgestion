// PostgreSQL temporal local: no lee credenciales ni conecta a Supabase.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = realpathSync(os.tmpdir());
const cluster = mkdtempSync(path.join(root, 'vortex-tienda-vinculo-'));
const data = path.join(cluster, 'data');
const pgBin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const command = (name, args, input) => {
  const result = spawnSync(path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')), args, {
    input, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || result.stdout || name);
  return result.stdout;
};
const sql = input => command('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input).trim();
const c1 = '0987ef9c-c602-40cf-84c3-64d2f644428d', c2 = '30e79cd0-360d-4a03-b634-bb7414ee505b';
const id = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = n => `SET request.jwt.claim.sub='${id(n)}'; SET ROLE authenticated;`;
const signup = (n, commerce = c1, email = `${n}@test.invalid`, confirmed = true) => sql(`INSERT INTO auth.users VALUES('${id(n)}','${email}',${confirmed ? 'now()' : 'NULL'},'${JSON.stringify({ comercio_id: commerce, nombre: 'Martin', apellido: 'Abella', direccion: 'Calle', numero: '123' })}');`);
const checkout = (n, email = `${n}@test.invalid`, product = id(90)) => sql(actor(n) + `SELECT crear_pedido_online('${JSON.stringify({ nombre: 'Martin Abella', telefono: '123', email })}','[{"producto_id":"${product}","cantidad":1}]')->>'cliente_id';`);
const countLinks = n => sql(`SELECT count(*) FROM cliente_usuarios WHERE user_id='${id(n)}';`);
let started = false;
try {
  command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  command('pg_ctl', ['-D', data, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  sql(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION user_belongs_to_comercio(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.merchant',true)='yes' $$;
    CREATE FUNCTION current_comercio_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN new.updated_at=now(); RETURN new; END $$;
    CREATE TABLE comercio(id uuid PRIMARY KEY);
    CREATE TABLE comercio_parametrizacion(comercio_id uuid PRIMARY KEY REFERENCES comercio(id),parametros jsonb);
    CREATE TABLE clientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid REFERENCES comercio(id),nombre text,apellido text,cuit text,calle text,numero text,codigo_postal text,localidad text,provincia text,telefono text,email text,situacion_afip text,tipo_persona text,created_at timestamptz DEFAULT now());
    CREATE TABLE productos(id uuid PRIMARY KEY,comercio_id uuid REFERENCES comercio(id),descripcion text,precio_venta numeric,stock integer,visible_en_tienda boolean);
    CREATE TABLE producto_variantes(id uuid PRIMARY KEY,producto_id uuid REFERENCES productos(id),stock integer,color_id uuid,talle_id uuid);
    CREATE TABLE producto_colores(id uuid PRIMARY KEY,nombre text);
    CREATE TABLE producto_talles(id uuid PRIMARY KEY,nombre text);
    INSERT INTO comercio VALUES('${c1}'),('${c2}');
    INSERT INTO comercio_parametrizacion SELECT id,'{"modulos":{"pedidos_online":true}}' FROM comercio;
    INSERT INTO productos VALUES('${id(90)}','${c1}','Producto',100,20,true),('${id(91)}','${c2}','Producto 2',100,20,true);
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`);
  sql(readFileSync('supabase/migrations/20260818200000_pedidos_online.sql', 'utf8'));
  sql(readFileSync('supabase/migrations/20260818202000_vincular_usuarios_clientes.sql', 'utf8'));
  sql(`ALTER TABLE pedido_online_items ADD COLUMN producto_variante_id uuid REFERENCES producto_variantes(id);
    ALTER TABLE cliente_usuarios DROP CONSTRAINT cliente_usuarios_metodo_check;
    ALTER TABLE cliente_usuarios ADD CHECK(metodo IN ('email_verificado','creado_pedido','manual','registro_tienda'));`);
  // Incluye la validacion real de tenant que tambien corre en SECURITY DEFINER.
  sql(readFileSync('supabase/migrations/20260908180000_fix_set_comercio_context_optional_cliente_email.sql', 'utf8'));
  sql(`CREATE TRIGGER tenant_cliente BEFORE INSERT ON clientes FOR EACH ROW EXECUTE FUNCTION set_comercio_id_from_context();`);
  sql(readFileSync('supabase/migrations/20261103120000_vinculacion_clientes_tienda_multicomercio.sql', 'utf8'));
  sql(`CREATE TRIGGER crear_cliente_tienda_al_registrar AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION registrar_cliente_tienda_desde_auth();`);
  const cancellation = readFileSync('supabase/migrations/20260914160000_stock_por_talle_color.sql', 'utf8').match(/CREATE OR REPLACE FUNCTION public\.actualizar_estado_pedido_online[\s\S]*?END; \$\$;/)[0];
  sql(cancellation + 'GRANT EXECUTE ON FUNCTION actualizar_estado_pedido_online(uuid,text) TO authenticated;');

  signup(1); signup(2, c2);
  assert.equal(countLinks(1), '1', 'Euforia vincula al registrarse');
  assert.equal(countLinks(2), '1', 'Mate King conserva su alta');
  assert.equal(sql(`SELECT nombre||' '||apellido||' '||numero FROM clientes WHERE id=(SELECT cliente_id FROM cliente_usuarios WHERE user_id='${id(1)}');`), 'Martin Abella 123');
  // Simula la omision historica del registro, luego reintenta checkout.
  sql(`DELETE FROM cliente_usuarios WHERE user_id='${id(1)}';`);
  const cliente = checkout(1);
  assert.ok(cliente);
  assert.equal(countLinks(1), '1');
  assert.equal(checkout(1), cliente, 'El reintento usa la misma ficha');
  assert.equal(sql(`SELECT count(*) FROM clientes WHERE comercio_id='${c1}' AND email='1@test.invalid';`), '1');
  assert.equal(sql(`SELECT stock FROM productos WHERE id='${id(90)}';`), '20', 'Checkout no descuenta stock');
  // Reproduce la cancelacion de un pedido cuyo pago ya descuento una unidad.
  sql(`UPDATE productos SET stock=stock-1 WHERE id='${id(90)}'; SET test.merchant='yes'; SELECT actualizar_estado_pedido_online((SELECT id FROM pedidos_online ORDER BY numero LIMIT 1),'cancelado');`);
  assert.equal(countLinks(1), '1', 'Cancelar conserva la cuenta');
  assert.equal(sql(`SELECT stock FROM productos WHERE id='${id(90)}';`), '20');
  const pedido = sql('SELECT id FROM pedidos_online ORDER BY numero LIMIT 1;');
  const repair = pedidoId => sql(readFileSync('scripts/reparar-vinculacion-euforia.sql', 'utf8').replaceAll(":'pedido_id'", `'${pedidoId}'`));
  sql(`DELETE FROM cliente_usuarios WHERE user_id='${id(1)}';`);
  const beforeRepair = sql('SELECT jsonb_agg(to_jsonb(p) ORDER BY numero) FROM pedidos_online p;');
  repair(pedido); repair(pedido);
  assert.equal(countLinks(1), '1', 'Reparacion historica idempotente de pedido cancelado');
  assert.equal(sql('SELECT jsonb_agg(to_jsonb(p) ORDER BY numero) FROM pedidos_online p;'), beforeRepair, 'Reparacion no altera pedidos ni pagos');
  assert.equal(sql(`SELECT stock FROM productos WHERE id='${id(90)}';`), '20');
  checkout(2, '2@test.invalid', id(91));
  const otroPedido = sql(`SELECT id FROM pedidos_online WHERE comercio_id='${c2}' LIMIT 1;`);
  assert.throws(() => repair(otroPedido), /debe pertenecer a Euforia/);
  sql(`UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${id(1)}';`);
  assert.throws(() => repair(pedido), /sin correo confirmado/);
  sql(`UPDATE auth.users SET email_confirmed_at=now() WHERE id='${id(1)}';`);

  // El email de checkout no puede reclamar la ficha de otra cuenta.
  signup(3);
  sql(`DELETE FROM cliente_usuarios WHERE user_id='${id(3)}'; DELETE FROM clientes WHERE email='3@test.invalid';`);
  const propio = checkout(3, '1@test.invalid');
  assert.notEqual(propio, cliente);
  assert.equal(sql(`SELECT email FROM clientes WHERE id='${propio}';`), '3@test.invalid');
  // Duplicados, correo sin confirmar y ficha ya vinculada no se resuelven al azar.
  sql(`SET test.merchant='yes'; INSERT INTO clientes(comercio_id,email) VALUES('${c1}','duplicado@test.invalid'),('${c1}','duplicado@test.invalid'),('${c1}','sinconfirmar@test.invalid');`);
  signup(4, c1, 'duplicado@test.invalid');
  signup(5, c1, 'sinconfirmar@test.invalid', false);
  signup(6, c1, '1@test.invalid');
  for (const n of [4, 5, 6]) assert.equal(countLinks(n), '0');
  assert.equal(sql(`SELECT motivo FROM cliente_vinculaciones_pendientes WHERE user_id='${id(4)}';`), 'email_duplicado');
  assert.equal(sql(`SELECT motivo FROM cliente_vinculaciones_pendientes WHERE user_id='${id(5)}';`), 'email_no_verificado');
  sql(`UPDATE auth.users SET email_confirmed_at=now() WHERE id='${id(5)}';`);
  assert.ok(checkout(5));
  assert.equal(countLinks(5), '1');
  assert.equal(sql(`SELECT count(*) FROM cliente_vinculaciones_pendientes WHERE user_id='${id(5)}';`), '0');
  // Otro tenant con el mismo email no comparte clientes ni cuentas.
  signup(7, c2, '1@test.invalid');
  assert.notEqual(sql(`SELECT cliente_id FROM cliente_usuarios WHERE user_id='${id(7)}';`), cliente);
  sql(`INSERT INTO auth.users VALUES('${id(8)}','8@test.invalid',now(),'{"comercio_id":"invalido"}');`);
  assert.equal(countLinks(8), '0');
  assert.throws(() => sql(actor(1) + `SELECT resolver_cliente_cuenta_tienda('${c2}','${id(2)}','{}','creado_pedido');`), /permission denied/);
  assert.throws(() => sql(`SET ROLE anon; SELECT crear_pedido_online('{}','[]');`), /permission denied/);
  assert.throws(() => sql(actor(1) + `SELECT crear_pedido_online('{"nombre":"Martin","telefono":"123","email":"x@test.invalid"}','[{"producto_id":"${id(90)}","cantidad":1},{"producto_id":"${id(91)}","cantidad":1}]');`), /Producto no disponible/);
  console.log('OK SQL local: registro Euforia/Mate King, checkout y reintento, cancelacion conserva cuenta, email de Auth, duplicados, confirmacion, aislamiento por comercio y permisos.');
} finally {
  if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  const resolved = realpathSync(cluster);
  if (!resolved.startsWith(root + path.sep) || !path.basename(resolved).startsWith('vortex-tienda-vinculo-')) throw Error('Ruta temporal no segura');
  rmSync(resolved, { recursive: true, force: true });
}
