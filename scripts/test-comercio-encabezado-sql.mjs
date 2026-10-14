// Migraciones reales en PostgreSQL temporal; no accede a producción.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const tempRoot=realpathSync(os.tmpdir()),cluster=mkdtempSync(path.join(tempRoot,'vortex-comercio-encabezado-')),data=path.join(cluster,'data');
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const bin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
const run=(name,args,input)=>{const r=spawnSync(path.join(bin,name+(process.platform==='win32'?'.exe':'')),args,{input,encoding:'utf8',windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'},stdio:name==='pg_ctl'?'ignore':'pipe',timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout||name);return r.stdout;};
const sql=text=>run('psql',['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],text);
const migration=name=>readFileSync('supabase/migrations/'+name,'utf8');
const tenant='a4983b26-4f3d-46e0-8e4f-46bd34fec838',other='10000000-0000-0000-0000-000000000002',user='20000000-0000-0000-0000-000000000001';
let started=false;
try{
run('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);run('pg_ctl',['-D',data,'-l',path.join(cluster,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
sql(`CREATE SCHEMA auth;CREATE ROLE authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE comercio(id uuid PRIMARY KEY,nombre_comercio text,telefono text);CREATE TABLE comercio_usuarios(comercio_id uuid REFERENCES comercio(id),user_id uuid REFERENCES auth.users(id),activo boolean);
INSERT INTO comercio VALUES('${tenant}','Bostico prueba','12345'),('${other}','Otro comercio','67890');INSERT INTO auth.users VALUES('${user}','otra-cuenta@example.com');INSERT INTO comercio_usuarios VALUES('${tenant}','${user}',true);
ALTER TABLE comercio ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON comercio TO authenticated USING(id=nullif(current_setting('app.tenant',true),'')::uuid) WITH CHECK(id=nullif(current_setting('app.tenant',true),'')::uuid);GRANT SELECT,UPDATE ON comercio TO authenticated;`);
sql(migration('20261014150000_comercio_razon_social_con_logo.sql'));
assert.equal(sql('SELECT bool_and(NOT mostrar_razon_social_con_logo) FROM comercio;').trim(),'t');
assert.throws(()=>sql(migration('20261014151000_bostico_razon_social_con_logo.sql')),/No se pudo verificar/);
assert.equal(sql('SELECT bool_and(NOT mostrar_razon_social_con_logo) FROM comercio;').trim(),'t');
sql(`UPDATE auth.users SET email='carlosbostico@hotmail.com' WHERE id='${user}';`);
sql(migration('20261014151000_bostico_razon_social_con_logo.sql'));sql(migration('20261014151000_bostico_razon_social_con_logo.sql'));
assert.equal(sql(`SELECT mostrar_razon_social_con_logo FROM comercio WHERE id='${tenant}';`).trim(),'t');
assert.equal(sql(`SELECT mostrar_razon_social_con_logo FROM comercio WHERE id='${other}';`).trim(),'f');
assert.equal(sql(`SELECT telefono FROM comercio WHERE id='${tenant}';`).trim(),'12345');
assert.equal(sql(`SET app.tenant='${tenant}';SET ROLE authenticated;SELECT count(*) FROM comercio;`).trim(),'1');
sql(`SET app.tenant='${tenant}';SET ROLE authenticated;UPDATE comercio SET mostrar_razon_social_con_logo=true WHERE id='${other}';`);
assert.equal(sql(`SELECT mostrar_razon_social_con_logo FROM comercio WHERE id='${other}';`).trim(),'f');
console.log('OK migraciones: opción desactivada por defecto, activación exclusiva con email verificado, idempotencia y RLS existente conservada.');
}finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);const resolved=realpathSync(cluster);if(!resolved.startsWith(tempRoot+path.sep)||!path.basename(resolved).startsWith('vortex-comercio-encabezado-'))throw Error('Ruta temporal no segura');rmSync(resolved,{recursive:true,force:true});}
