import { runTests } from "./fixtures/restaurante-tests.mjs";
// Integración en PostgreSQL temporal local. Nunca usa Supabase ni datos remotos.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgBin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const tempRoot = realpathSync(os.tmpdir());
const cluster = mkdtempSync(path.join(tempRoot, 'vortex-restaurante-test-'));
const dataDir = path.join(cluster, 'data');
const server = net.createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const command = (name, args, input) => spawnSync(path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')), args, {
  input, encoding: 'utf8', windowsHide: true, timeout: 30000,
  env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
});
const checked = result => { if (result.error) throw result.error; if (result.status !== 0) throw new Error(result.stderr || result.stdout); return (result.stdout || '').replaceAll('\r', '').trim(); };
const psqlArgs = ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = input => checked(command('psql', psqlArgs, input));
const asyncSql = input => {
  const child = spawn(path.join(pgBin, process.platform === 'win32' ? 'psql.exe' : 'psql'), psqlArgs, { windowsHide: true, env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
  let output = '', error = '';
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  child.stdout.on('data', chunk => { output += chunk; if (output.includes('READY')) readyResolve(); });
  child.stderr.on('data', chunk => { error += chunk; });
  const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve({ code, output, error })); });
  child.stdin.end(input);
  return { ready, completion };
};
const migration = name => readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8');
const functionSQL = (name, file) => {
  const source = migration(file);
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`) >= 0 ? source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`) : source.indexOf(`CREATE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('$$;', source.indexOf('AS $$', start)) + 3);
};
const tenant = '10000000-0000-0000-0000-000000000001', other = '10000000-0000-0000-0000-000000000002';
const admin = '20000000-0000-0000-0000-000000000001', driver = '20000000-0000-0000-0000-000000000002', stranger = '20000000-0000-0000-0000-000000000003';
const client = '30000000-0000-0000-0000-000000000001', foreignClient = '30000000-0000-0000-0000-000000000002';
const product = '40000000-0000-0000-0000-000000000001', foreignProduct = '40000000-0000-0000-0000-000000000002';
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const actor = (id = admin) => `SET app.test_user='${id}'; SET ROLE authenticated;`;
const call = (action, data, key = randomUUID(), commerce = tenant) => `SELECT restaurante_operar('${commerce}','${action}',${json(data)},'${key}');`;
// Las aserciones inspeccionan el estado como dueño del clúster; las operaciones usan authenticated.
const check = (condition, label) => `RESET ROLE; SELECT test_assert((${condition}),'${label}');`;
const fails = (statement, message) => `SELECT test_error($stmt$${statement}$stmt$,'${message}');`;
let started = false, passed = 0;
const test = (label, statement) => { sql(statement); passed++; console.log('OK ' + label); };
try {
  checked(command('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']));
  checked(command('pg_ctl', ['-D', dataDir, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])); started = true;
  sql(readFileSync(path.join(repo, 'scripts/fixtures/taller-schema.sql'), 'utf8'));
  sql(`CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    ALTER TABLE productos ADD COLUMN descripcion text DEFAULT 'Bebida', ADD COLUMN cod_producto text DEFAULT 'B01', ADD COLUMN precio_venta numeric DEFAULT 100.1234, ADD COLUMN porcentaje_iva numeric DEFAULT 21;
    ALTER TABLE ventas ADD COLUMN idempotency_key uuid,ADD COLUMN idempotency_payload jsonb;
    CREATE UNIQUE INDEX test_idempotencia ON ventas(comercio_id,idempotency_key);
    ALTER TABLE cuenta_corriente ADD COLUMN observaciones text,ADD COLUMN cheque_id uuid;
    CREATE TYPE estado_cheque AS ENUM('en_cartera','depositado','rechazado','endosado','emitido');
    ALTER TABLE cheques ADD COLUMN numero_cheque text,ADD COLUMN banco_emisor text,ADD COLUMN monto numeric,ADD COLUMN fecha_emision date,ADD COLUMN fecha_vencimiento date,ADD COLUMN emisor_nombre text,ADD COLUMN emisor_cuit text,ADD COLUMN cliente_id uuid,ADD COLUMN estado estado_cheque,ADD COLUMN observaciones text,ADD COLUMN tipo_cheque text,ADD COLUMN cuenta_corriente_id uuid,ADD COLUMN venta_id uuid;
    INSERT INTO comercio VALUES('${tenant}'),('${other}');
    INSERT INTO auth.users VALUES('${admin}','admin@prueba.local'),('${driver}','repartidor@prueba.local'),('${stranger}','otro@prueba.local');
    INSERT INTO comercio_usuarios VALUES('${tenant}','${admin}','admin',true),('${tenant}','${driver}','operador',true),('${tenant}','${stranger}','operador',true);
    INSERT INTO comercio_parametrizacion(comercio_id,parametros) VALUES('${tenant}','{"modulos":{"restaurante":true}}'),('${other}','{"modulos":{"restaurante":true}}');
    INSERT INTO clientes VALUES('${client}','${tenant}','Cliente','Prueba',NULL),('${foreignClient}','${other}','Ajeno','Prueba',NULL);
    INSERT INTO productos(id,comercio_id,stock) VALUES('${product}','${tenant}',20),('${foreignProduct}','${other}',20);
    INSERT INTO afip_config VALUES('${tenant}',3,true);`);
  sql(functionSQL('registrar_venta_transaccional', '20260908130000_venta_items_precio_iva_decimal.sql'));
  sql(functionSQL('registrar_pagos_cliente_multi_documento', '20261002100000_cobros_cliente_multi_comprobante.sql'));
  sql(migration('20260916180000_ventas_desde_orden_permiten_stock_negativo.sql'));
  sql('CREATE TRIGGER stock_insert AFTER INSERT ON venta_items FOR EACH ROW EXECUTE FUNCTION apply_venta_item_stock();');
  for (const file of ["20261008100000_restaurante_estructura.sql","20261008110000_restaurante_operaciones.sql","20261008120000_restaurante_consultas.sql"]) sql(migration(file));
  await runTests({sql,test,actor,call,check,fails,asyncSql,tenant,other,admin,driver,stranger,client,foreignClient,product,foreignProduct,json});
  console.log(passed + ' pruebas PostgreSQL locales correctas.');
} catch(error) { console.error(error); process.exitCode=1; }
finally {
  if(started) command('pg_ctl',['-D',dataDir,'-m','immediate','-w','stop']);
  const target=realpathSync(cluster);
  if(path.dirname(target)===tempRoot && path.basename(target).startsWith('vortex-restaurante-test-')) rmSync(target,{recursive:true,force:true});
}
