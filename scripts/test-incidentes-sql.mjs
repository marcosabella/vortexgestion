// RLS y RPC reales en PostgreSQL temporal local; no usa Supabase.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
const root = realpathSync(os.tmpdir()), cluster = mkdtempSync(path.join(root, 'vortex-incidentes-sql-')), data = path.join(cluster, 'data');
const pgBin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const command = (name, args, input) => {
  const result = spawnSync(path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')), args, { input, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 30000 });
  if (result.error) throw result.error; if (result.status !== 0) throw Error(result.stderr || result.stdout || name); return result.stdout;
};
const sql = input => command('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
const c1 = '10000000-0000-0000-0000-000000000001', c2 = '10000000-0000-0000-0000-000000000002';
const user = '20000000-0000-0000-0000-000000000001', admin = '20000000-0000-0000-0000-000000000002';
const actor = id => `SET app.test_user='${id}'; SET ROLE authenticated;`;
const report = (comercio = c1, modulo = 'compras', origen = 'guardado') => `SELECT registrar_incidente('${comercio}','${modulo}','/compras/nueva','${origen}','23505','Error de prueba');`;
const fail = (statement, message) => sql(`SELECT test_error($stmt$${statement}$stmt$,'${message}');`);
let started = false;
try {
  command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  command('pg_ctl', ['-D', data, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']); started = true;
  sql(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.test_user',true),'')::uuid $$;
    CREATE TABLE comercio(id uuid PRIMARY KEY);
    CREATE TABLE comercio_usuarios(comercio_id uuid,user_id uuid,activo boolean);
    CREATE TABLE app_admins(user_id uuid);
    CREATE FUNCTION is_app_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM app_admins WHERE user_id=auth.uid()) $$;
    CREATE FUNCTION user_belongs_to_comercio(p uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM comercio_usuarios WHERE comercio_id=p AND user_id=auth.uid() AND activo) $$;
    CREATE FUNCTION test_error(p_sql text,p_message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN IF position(p_message IN SQLERRM)>0 THEN RETURN; END IF; RAISE; END; RAISE EXCEPTION 'Expected rejection: %',p_message; END $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    INSERT INTO auth.users VALUES('${user}'),('${admin}'); INSERT INTO comercio VALUES('${c1}'),('${c2}');
    INSERT INTO comercio_usuarios VALUES('${c1}','${user}',true); INSERT INTO app_admins VALUES('${admin}');`);
  sql(readFileSync('supabase/migrations/20261015120000_incidentes_plataforma.sql', 'utf8'));
  sql(actor(user) + report());
  assert.equal(sql(`SELECT count(*) FROM sistema_incidentes WHERE user_id='${user}' AND comercio_id='${c1}' AND estado='pendiente';`).trim(), '1');
  assert.equal(sql(actor(user) + 'SELECT count(*) FROM sistema_incidentes;').trim(), '0', 'RLS oculta todos los incidentes a comercios');
  fail(actor(user) + report(c2), 'No autorizado');
  fail(`SET ROLE anon;${report()}`, 'permission denied');
  fail(`SET app.test_user='';${report()}`, 'No autorizado');
  fail(actor(user) + `INSERT INTO sistema_incidentes(comercio_id,modulo,ruta,origen,mensaje) VALUES('${c1}','compras','/compras','guardado','forzado');`, 'permission denied');
  fail(actor(user) + `UPDATE sistema_incidentes SET estado='resuelto';`, 'permission denied');
  fail(actor(user) + 'DELETE FROM sistema_incidentes;', 'permission denied');
  fail(actor(user) + report(c1, 'compras?token'), 'inválido');
  fail(actor(user) + report(c1, 'compras', 'arbitrario'), 'inválido');
  const id = sql('SELECT id FROM sistema_incidentes LIMIT 1;').trim();
  fail(actor(user) + `SELECT admin_actualizar_incidente('${id}','resuelto','sin permiso');`, 'Solo el administrador');
  sql(actor(admin) + report(c2));
  assert.equal(sql(actor(admin) + 'SELECT count(*) FROM sistema_incidentes;').trim(), '2');
  sql(actor(admin) + `SELECT admin_actualizar_incidente('${id}','resuelto','Revisado');`);
  assert.equal(sql(`SELECT estado='resuelto' AND notas='Revisado' AND actualizado_por='${admin}' FROM sistema_incidentes WHERE id='${id}';`).trim(), 't');
  fail(actor(admin) + `SELECT admin_actualizar_incidente('${id}','otro','');`, 'inválidos');
  sql(`UPDATE comercio_usuarios SET activo=false WHERE user_id='${user}';`);
  fail(actor(user) + report(), 'No autorizado');
  sql(`UPDATE comercio_usuarios SET activo=true WHERE user_id='${user}';`);
  sql(actor(user) + `DO $$ BEGIN FOR i IN 1..80 LOOP PERFORM registrar_incidente('${c1}','compras','/compras/nueva','guardado','','Prueba límite'); END LOOP; END $$;`);
  assert.equal(sql(`SELECT count(*) FROM sistema_incidentes WHERE user_id='${user}';`).trim(), '60');
  console.log('OK Incidentes SQL: reporte por tenant, pertenencia activa, anónimos bloqueados, lectura solo admin, escritura directa bloqueada, seguimiento y límite de frecuencia. Base local temporal.');
} finally {
  if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  const resolved = realpathSync(cluster);
  if (!resolved.startsWith(root + path.sep) || !path.basename(resolved).startsWith('vortex-incidentes-sql-')) throw Error('Ruta temporal no segura');
  rmSync(resolved, { recursive: true, force: true });
}
