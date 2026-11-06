import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
export const idApicola = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const literalSql = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
export async function iniciarApicolaPg() {
  const root = realpathSync(os.tmpdir()), cluster = mkdtempSync(path.join(root, 'vortex-apicola-ui-')), dir = path.join(cluster, 'data');
  const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r));
  const run = (name, args, input) => { const r = spawnSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args, { input, encoding: 'utf8', windowsHide: true, env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 30000 }); if (r.error) throw r.error; if (r.status !== 0) throw Error(r.stderr || r.stdout || name); return (r.stdout || '').trim(); };
  const sql = value => run('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], value);
  let started = false;
  const stop = () => {
    if (started) { run('pg_ctl', ['-D', dir, '-m', 'immediate', '-w', 'stop']); started = false; }
    const resolved = realpathSync(cluster); if (!resolved.startsWith(root + path.sep) || !path.basename(resolved).startsWith('vortex-apicola-ui-')) throw Error('Ruta temporal insegura');
    try { rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (error) { if (!['EBUSY', 'EPERM'].includes(error.code)) throw error; }
  };
  try {
    run('initdb', ['-D', dir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']); run('pg_ctl', ['-D', dir, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']); started = true;
    sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.actor',true),'')::uuid$$;
      CREATE TABLE comercio(id uuid PRIMARY KEY,activo boolean DEFAULT true);
      CREATE TABLE comercio_usuarios(comercio_id uuid,user_id uuid,rol text,activo boolean DEFAULT true);
      CREATE TABLE comercio_parametrizacion(comercio_id uuid PRIMARY KEY,parametros jsonb);
      INSERT INTO auth.users VALUES('${idApicola(1)}'),('${idApicola(2)}');INSERT INTO comercio VALUES('${idApicola(10)}',true);
      INSERT INTO comercio_usuarios VALUES('${idApicola(10)}','${idApicola(1)}','admin',true),('${idApicola(10)}','${idApicola(2)}','operador',true);
      INSERT INTO comercio_parametrizacion VALUES('${idApicola(10)}','{"modulos":{"apicola":true}}');GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
    for (const migration of ['20261106130000_apicola_cuaderno_estructura.sql', '20261106130100_apicola_cuaderno_operaciones.sql']) sql(readFileSync('supabase/migrations/' + migration, 'utf8'));
    return { sql, stop };
  } catch (error) { stop(); throw error; }
}
