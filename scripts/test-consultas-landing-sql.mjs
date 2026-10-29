// Prueba la migración en PostgreSQL temporal local, sin acceso a Supabase.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
const root = realpathSync(os.tmpdir()), cluster = mkdtempSync(path.join(root, 'vortex-consultas-sql-')), data = path.join(cluster, 'data');
const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const server = net.createServer();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise(r => server.close(r));
const run = (name, args, input) => {
  const result = spawnSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args, { input, encoding: 'utf8', windowsHide: true, env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(name + ': ' + (result.stderr || result.stdout || `exit ${result.status}`));
  return (result.stdout || '').trim();
};
const sql = input => run('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
const admin = '10000000-0000-0000-0000-000000000001';
const lead = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const send = (n, email = 'CLIENTE@example.com', honey = '') => `SELECT public.enviar_consulta_landing('${lead(n)}',' Persona ',' Complejo ','${email}','123','Consulta de prueba','${honey}');`;
const asAdmin = `SET app.actor='${admin}'; SET ROLE authenticated;`;
let started = false;
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.actor',true),'')::uuid $$;
    CREATE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid()='${admin}'::uuid $$;
    CREATE TABLE public.comercio(id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
  sql(readFileSync('supabase/migrations/20261029120000_consultas_landing.sql', 'utf8'));
  sql('SET ROLE anon;' + send(1));
  assert.equal(sql('SELECT count(*) FROM consultas_landing;'), '1');
  assert.equal(sql('SELECT nombre||\'|\'||negocio||\'|\'||email FROM consultas_landing;'), 'Persona|Complejo|cliente@example.com');
  assert.equal(sql('SELECT comercio_id IS NULL FROM consultas_landing;'), 't');
  sql('SET ROLE anon;' + send(1));
  assert.equal(sql('SELECT count(*) FROM consultas_landing;'), '1', 'Reintentos no duplican');
  assert.throws(() => sql('SET ROLE anon;SELECT * FROM consultas_landing;'), /permission denied/);
  assert.equal(sql('SET ROLE authenticated;SELECT count(*) FROM consultas_landing;'), '0', 'RLS oculta consultas a usuarios comunes');
  assert.throws(() => sql("SET ROLE anon;" + send(2, 'invalido')), /Revis/);
  assert.throws(() => sql("SET ROLE anon;" + send(2, 'cliente@example.com', 'bot')), /Revis/);
  assert.throws(() => sql(`SET ROLE anon;SELECT enviar_consulta_landing('${lead(2)}',repeat('x',151),'Negocio','a@b.com','','Mensaje','');`), /Revis/);
  assert.throws(() => sql(`SET ROLE authenticated;SELECT admin_estado_consulta_landing('${lead(1)}','contactada');`), /No autorizado/);
  assert.throws(() => sql(`SET ROLE anon;SELECT admin_estado_consulta_landing('${lead(1)}','contactada');`), /permission denied/);
  assert.equal(sql(asAdmin + 'SELECT count(*) FROM consultas_landing;'), '1');
  sql(asAdmin + `SELECT admin_estado_consulta_landing('${lead(1)}','contactada');`);
  assert.equal(sql('SELECT estado FROM consultas_landing;'), 'contactada');
  assert.throws(() => sql(asAdmin + `SELECT admin_estado_consulta_landing('${lead(1)}','otro');`), /Estado/);
  assert.throws(() => sql(asAdmin + 'DELETE FROM consultas_landing;'), /permission denied/);
  assert.throws(() => sql(asAdmin + "UPDATE consultas_landing SET estado='archivada';"), /permission denied/);
  assert.throws(() => sql('SET ROLE anon;INSERT INTO consultas_landing(id) VALUES(gen_random_uuid());'), /permission denied/);
  sql('SET ROLE anon;' + send(2) + send(3));
  assert.throws(() => sql('SET ROLE anon;' + send(4)), /mite de env/);
  // Límite global incluso cuando cambian los correos.
  sql(`INSERT INTO consultas_landing(id,nombre,negocio,email,mensaje) SELECT gen_random_uuid(),'Persona','Negocio','otro'||n||'@example.com','Mensaje' FROM generate_series(1,97) n;`);
  assert.throws(() => sql('SET ROLE anon;' + send(5, 'nuevo@example.com')), /mite de env/);
  // Un reintento confirmado sigue funcionando después de llegar al límite.
  sql('SET ROLE anon;' + send(1));
  console.log('OK: envío anónimo, normalización, RLS, privilegios admin, escritura directa bloqueada, validación, honeypot, idempotencia y límites por correo/global. PostgreSQL local.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (started || existsSync(path.join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  const resolved = realpathSync(cluster);
  if (!resolved.startsWith(root + path.sep) || !path.basename(resolved).startsWith('vortex-consultas-sql-')) throw Error('Ruta temporal no segura');
  try { rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); }
  catch (error) { console.error('No se pudo limpiar la carpeta temporal:', resolved, error.code); process.exitCode = 1; }
}
