// PostgreSQL temporal local. No usa Supabase ni credenciales reales.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const root=realpathSync(os.tmpdir()),cluster=mkdtempSync(path.join(root,'vortex-usuarios-test-')),dir=path.join(cluster,'data');
const bin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const run=(name,args,input)=>{const r=spawnSync(path.join(bin,name+'.exe'),args,{input,encoding:'utf8',windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'},stdio:name==='pg_ctl'?'ignore':'pipe',timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout||name);return(r.stdout||'').trim();};
const sql=s=>run('psql',['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],s);
const migration=n=>readFileSync('supabase/migrations/'+n,'utf8');
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const [admin,legacy,driver,other,reader,tenant,foreign]=[1,2,3,4,5,10,11].map(id);
const actor=(u=admin,r='/rpc/vortex_guardar_usuario',method='POST')=>`SET app.test_user='${u}';SET request.path='${r}';SET request.method='${method}';SET ROLE authenticated;`;
const json=x=>`'${JSON.stringify(x)}'::jsonb`;
const save=(u,p,opts={})=>`SELECT vortex_guardar_usuario('${opts.tenant||tenant}','${u}','Persona','${opts.rol||'operador'}',${opts.activo!==false},'personalizado',${json(p)},${opts.version||0},${opts.nuevo===true});`;
const check=(q,label)=>`SELECT test_assert((${q}),'${label}');`;
const fail=(q,msg)=>`SELECT test_error($query$${q}$query$,'${msg}');`;
let started=false,passed=0;
try{
 run('initdb',['-D',dir,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);run('pg_ctl',['-D',dir,'-l',path.join(cluster,'pg.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 sql(readFileSync('scripts/fixtures/taller-schema.sql','utf8'));
 sql(`CREATE ROLE service_role;CREATE ROLE authenticator;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
 ALTER TABLE comercio_usuarios ADD COLUMN solo_restaurante boolean NOT NULL DEFAULT false,ADD UNIQUE(comercio_id,user_id);
 CREATE FUNCTION comercio_acceso_vigente(target_comercio_id uuid) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM comercio WHERE id=target_comercio_id)$$;
 DROP FUNCTION user_belongs_to_comercio(uuid);
 CREATE FUNCTION user_belongs_to_comercio(target_comercio_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM comercio_usuarios WHERE comercio_id=target_comercio_id AND user_id=auth.uid() AND activo AND NOT solo_restaurante)$$;
 ALTER FUNCTION user_is_comercio_admin(uuid) SECURITY DEFINER;
 CREATE TABLE restaurante_sectores(id uuid PRIMARY KEY,comercio_id uuid,nombre text,activo boolean);
 CREATE TABLE restaurante_permisos(comercio_id uuid,usuario_id uuid,nombre text,roles text[],sector_id uuid,permisos text[],activo boolean,PRIMARY KEY(comercio_id,usuario_id));
 CREATE FUNCTION restaurante_habilitado(p_comercio uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM comercio_usuarios WHERE comercio_id=p_comercio AND user_id=auth.uid() AND activo)$$;
 GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
 ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON clientes TO authenticated USING(user_belongs_to_comercio(comercio_id)) WITH CHECK(user_belongs_to_comercio(comercio_id));
 ALTER TABLE productos ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON productos TO authenticated USING(user_belongs_to_comercio(comercio_id)) WITH CHECK(user_belongs_to_comercio(comercio_id));
 ALTER TABLE comercio ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON comercio TO authenticated USING(user_belongs_to_comercio(id));
 ALTER TABLE comercio_usuarios ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON comercio_usuarios TO authenticated USING(user_id=auth.uid() OR user_is_comercio_admin(comercio_id));
 ALTER TABLE comercio_parametrizacion ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON comercio_parametrizacion TO authenticated USING(user_belongs_to_comercio(comercio_id));
 INSERT INTO auth.users(id,email) SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'user'||n||'@example.test' FROM generate_series(1,8) n;
 INSERT INTO comercio VALUES('${tenant}'),('${foreign}');
 INSERT INTO comercio_usuarios(comercio_id,user_id,rol,activo) VALUES('${tenant}','${admin}','admin',true),('${tenant}','${legacy}','operador',true),('${foreign}','${other}','admin',true);
 INSERT INTO comercio_parametrizacion(comercio_id,parametros) VALUES('${tenant}','{"modulos":{"transporte":true,"restaurante":false}}'),('${foreign}','{}');
 INSERT INTO clientes VALUES('${id(20)}','${tenant}','Cliente','Local',NULL),('${id(21)}','${foreign}','Ajeno','',NULL);
 INSERT INTO productos(id,comercio_id,stock) VALUES('${id(30)}','${tenant}',10);
 UPDATE auth.users SET raw_app_meta_data=jsonb_build_object('vortex_alta_comercio','${tenant}','vortex_alta_actor','${admin}') WHERE id IN ('${driver}','${reader}');`);
 const source=migration('20261008160000_restaurante_usuarios_roles.sql');
 sql(source.slice(source.indexOf('CREATE FUNCTION public.restaurante_guardar_usuario('),source.indexOf('REVOKE ALL ON FUNCTION public.restaurante_mi_acceso')));
 sql(`ALTER TABLE proveedores ADD nombre text DEFAULT '',ADD apellido text DEFAULT '',ADD razon_social text DEFAULT '';
 ALTER TABLE ventas ADD idempotency_key uuid,ADD idempotency_payload jsonb;CREATE UNIQUE INDEX ON ventas(comercio_id,idempotency_key);
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE TABLE gastos_egresos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid,fecha date,categoria text,concepto text,proveedor_id uuid,monto numeric,medio_pago text,estado text,numero_comprobante text,observaciones text);
 GRANT SELECT ON gastos_egresos TO authenticated;
 UPDATE auth.users SET raw_app_meta_data=jsonb_build_object('vortex_alta_comercio','${tenant}','vortex_alta_actor','${admin}') WHERE id='${id(6)}';`);
 sql(migration('20260609150000_presupuestos.sql'));
 sql(migration('20260921170000_corregir_confirmacion_presupuesto_stock.sql'));
 sql(migration('20260908130000_venta_items_precio_iva_decimal.sql'));
 sql(migration('20261110100000_vortex_transporte.sql'));
 sql(`CREATE TABLE campo_operarios(id uuid PRIMARY KEY,comercio_id uuid,user_id uuid,nombre text,activo boolean);
 CREATE TABLE campo_gps_sesiones(id uuid PRIMARY KEY,comercio_id uuid);
 CREATE FUNCTION campo_gps_metricas_sesion(p_sesion_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN RETURN (SELECT to_jsonb(s) FROM campo_gps_sesiones s WHERE id=p_sesion_id);END$$;
 ALTER TABLE campo_operarios ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON campo_operarios TO authenticated USING(user_belongs_to_comercio(comercio_id)) WITH CHECK(user_is_comercio_admin(comercio_id));
 ALTER TABLE campo_gps_sesiones ENABLE ROW LEVEL SECURITY;CREATE POLICY tenant ON campo_gps_sesiones TO authenticated USING(user_belongs_to_comercio(comercio_id));
 GRANT SELECT,INSERT,UPDATE,DELETE ON campo_operarios,campo_gps_sesiones TO authenticated;
 INSERT INTO campo_operarios VALUES('${id(70)}','${tenant}',NULL,'Operario',true);
 INSERT INTO campo_gps_sesiones VALUES('${id(71)}','${tenant}');`);
 sql(migration('20260907140000_campo_gestion_operadores.sql'));
 sql(migration('20261110120000_usuarios_permisos_generales.sql'));
 sql(migration('20261110121000_integrar_permisos_modulos.sql'));
 sql(`CREATE FUNCTION test_escritura_sin_rls(c uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN INSERT INTO clientes VALUES(gen_random_uuid(),c,'No autorizado','',NULL);END$$;
 ALTER TABLE afip_config ADD id uuid DEFAULT gen_random_uuid(),ADD cuit_emisor text,ADD ambiente text,ADD certificado_crt text,ADD certificado_key text;
 INSERT INTO afip_config(comercio_id,punto_venta,activo,cuit_emisor,ambiente,certificado_crt,certificado_key) VALUES('${tenant}',3,true,'20123456789','homologacion','CERTIFICADO-FICTICIO','CLAVE-FICTICIA');`);
 const test=(name,body)=>{sql(`BEGIN;${actor()}${body}ROLLBACK;`);passed++;console.log('OK '+name);};
 test('Administrador lista usuarios sin habilitar módulos adicionales',check(`jsonb_array_length(vortex_listar_usuarios('${tenant}'))=2`,'listado núcleo'));
 test('No cambia automáticamente accesos existentes',actor(legacy,'/clientes','GET')+check(`SELECT count(*)=1 FROM clientes`,'legacy conserva lectura')+check(`(vortex_mi_acceso('${tenant}')->>'configurado')::boolean=false`,'sin conversión'));
 test('Alta chofer independiente de Restaurante',save(driver,{transporte:['consultar','operar']},{nuevo:true})+actor(driver,'/rpc/transporte_datos')+check(`vortex_permiso('${tenant}','transporte','operar')`,'chofer autorizado')+check(`NOT vortex_permiso('${tenant}','clientes','consultar')`,'sin administración genérica'));
 test('Permisos por tabla se aplican en RLS y por API',save(reader,{clientes:['consultar']},{nuevo:true})+actor(reader,'/clientes','GET')+check(`SELECT count(*)=1 FROM clientes`,'lectura propia')+fail(`INSERT INTO clientes VALUES('${id(40)}','${tenant}','No','','');`,'row-level security')+actor(reader,'/productos','GET')+check(`SELECT count(*)=0 FROM productos`,'producto oculto')+fail('SELECT vortex_validar_solicitud();','No tenés permiso'));
 test('No gestiona usuarios ni obtiene correos sin administración',save(reader,{clientes:['consultar']},{nuevo:true})+actor(reader)+fail(`SELECT vortex_listar_usuarios('${tenant}');`,'Solo el administrador')+fail(save(legacy,{clientes:['consultar']}),'Solo el administrador'));
 test('Aislamiento de comercios en administración',fail(`SELECT vortex_listar_usuarios('${foreign}');`,'Solo el administrador')+fail(save(other,{clientes:['consultar']}),'Usuario no disponible'));
 test('No incorpora identidades ajenas sin alta controlada',fail(save(other,{clientes:['consultar']},{nuevo:true}),'Usuario no disponible'));
 test('Rechaza permisos desconocidos y módulos deshabilitados',fail(save(legacy,{inexistente:['consultar']}),'Permisos inválidos')+fail(save(legacy,{clientes:['administrar']}),'Permisos inválidos')+fail(save(legacy,{restaurante:['consultar','operar']}),'no está habilitado'));
 test('Bloquea retirar administración propia',fail(save(admin,{}, {rol:'operador'}),'No podés quitar tu propio acceso')+fail(save(admin,{}, {rol:'admin',activo:false}),'No podés quitar tu propio acceso'));
 test('Desactivación conserva historial y niega permisos',save(legacy,{clientes:['consultar']},{activo:false})+actor(legacy,'/clientes','GET')+check(`SELECT count(*)=0 FROM clientes`,'sin datos')+check(`NOT vortex_permiso('${tenant}','clientes','consultar')`,'acceso revocado'));
 test('Versionado rechaza cambios concurrentes sin sobrescribir',save(legacy,{clientes:['consultar']})+fail(save(legacy,{productos:['consultar']}),'El acceso cambió')+check(`SELECT permisos='{"clientes":["consultar"]}'::jsonb FROM comercio_usuario_accesos WHERE user_id='${legacy}'`,'permiso original'));
 test('Auditoría de cambios y escritura directa protegida',save(legacy,{clientes:['consultar']})+check(`SELECT count(*)=1 FROM comercio_usuario_eventos`,'evento guardado')+fail('DELETE FROM comercio_usuario_accesos;','permission denied')+check(`NOT has_function_privilege('authenticated','vortex_permiso_servicio(uuid,uuid,text,text)','EXECUTE')`,'no suplanta identidad'));
 test('RPC desconocida denegada aunque esté habilitada por PostgreSQL',save(reader,{clientes:['consultar']},{nuevo:true})+actor(reader,'/rpc/funcion_futura')+fail('SELECT vortex_validar_solicitud();','No tenés permiso'));
 test('Identidad mínima disponible para iniciar sesión con usuario restringido',save(reader,{clientes:['consultar']},{nuevo:true})+actor(reader,'/comercio','GET')+check(`SELECT count(*)=1 FROM comercio`,'comercio propio')+actor(reader,'/rpc/vortex_mi_acceso')+`SELECT vortex_validar_solicitud();`+check(`(vortex_mi_acceso('${tenant}')->>'configurado')::boolean`,'permisos cargados'));
 test('Pre-request no interrumpe consultas anónimas',`RESET ROLE;SET ROLE anon;SELECT vortex_validar_solicitud();`);
 test('No se puede eliminar el último administrador desde acceso directo',`RESET ROLE;`+fail(`UPDATE comercio_usuarios SET activo=false WHERE user_id='${admin}' AND comercio_id='${tenant}';`,'conservar un administrador'));
 test('Chofer ve Transporte y no puede dar altas administrativas',save(driver,{transporte:['consultar','operar']},{nuevo:true})+actor(driver,'/rpc/transporte_datos')+`SELECT vortex_validar_solicitud();`+check(`(transporte_datos('${tenant}')->>'admin')::boolean=false`,'operador sin administración')+check(`jsonb_array_length(transporte_datos('${tenant}')->'usuarios')=0`,'directorio privado')+actor(driver,'/rpc/transporte_operar')+fail(`SELECT transporte_operar('${tenant}','unidad',NULL,NULL,'{"nombre":"No autorizado"}');`,'No tenés permiso'));
 test('Coordinador puede gestionar Transporte sin administrar usuarios ni facturar',save(id(6),{transporte:['consultar','crear','editar','operar','administrar']},{nuevo:true})+actor(id(6),'/rpc/transporte_operar')+
 `SELECT transporte_operar('${tenant}','unidad',NULL,NULL,'{"nombre":"Grúa","patente":"AA123AA","tipo":"grua","kilometraje":0,"horas":0}');`+
 actor(id(6),'/rpc/transporte_datos')+check(`(transporte_datos('${tenant}')->>'admin')::boolean`,'coordinador')+check(`transporte_datos('${tenant}')->'usuarios'->0 ? 'email'`,'selector con correo')+
 fail(`SELECT vortex_listar_usuarios('${tenant}');`,'Solo el administrador')+actor(id(6),'/rpc/transporte_operar')+fail(`SELECT transporte_operar('${tenant}','facturar',NULL,NULL,'{}');`,'No tenés permiso'));
 const venta=`SELECT registrar_venta_transaccional(p_comercio_id=>'${tenant}',p_tipo_comprobante=>'recibo_x',p_punto_venta=>1,p_cliente_id=>'${id(20)}',p_cliente_nombre=>'Cliente',p_moneda=>'ARS',p_modalidad=>'cta_cte',p_items=>'[{"descripcion_manual":"Servicio","cantidad":1,"precio_unitario":121,"porcentaje_iva":21,"afecta_stock":false}]',p_pagos=>'[]',p_idempotency_key=>'${id(50)}');`;
 test('Vendedor registra venta con la función real sin volverse administrador',save(id(6),{ventas:['consultar','crear'],clientes:['consultar']},{nuevo:true})+actor(id(6),'/rpc/registrar_venta_transaccional')+`SELECT vortex_validar_solicitud();`+venta+check(`SELECT total=121 FROM ventas WHERE comercio_id='${tenant}'`,'venta real')+check(`NOT user_is_comercio_admin('${tenant}')`,'no elevación global'));
 test('La integración no amplía permisos de operadores legacy',actor(legacy,'/rpc/registrar_venta_transaccional')+fail(venta,'ventas_no_disponible'));
 test('Solo consulta no puede ejecutar venta ni suplantar permisos de servicio',save(reader,{ventas:['consultar']},{nuevo:true})+actor(reader,'/rpc/registrar_venta_transaccional')+fail(`SELECT vortex_validar_solicitud();`,'No tenés permiso')+fail(venta,'ventas_no_disponible')+fail(`SELECT vortex_permiso_asignado_servicio('${admin}','${tenant}','ventas','crear');`,'permission denied'));
 test('Administrar otro comercio no habilita escrituras SECURITY DEFINER en este',save(reader,{clientes:['consultar']},{nuevo:true})+`RESET ROLE;INSERT INTO comercio_usuarios(comercio_id,user_id,rol,activo) VALUES('${foreign}','${reader}','admin',true);`+actor(reader,'/rpc/test_escritura_sin_rls')+`SELECT vortex_validar_solicitud();`+fail(`SELECT test_escritura_sin_rls('${tenant}');`,'No tenés permiso para escribir'));
 test('Vendedor no emite notas de crédito sin permiso de anulación',save(id(6),{ventas:['consultar','crear']},{nuevo:true})+actor(id(6),'/rpc/registrar_venta_transaccional')+fail(venta.replace("p_tipo_comprobante=>'recibo_x'","p_tipo_comprobante=>'nota_credito_a'"),'No tenés permiso para emitir notas'));
 test('Metadatos fiscales no exponen certificados ni claves',save(reader,{ventas:['consultar']},{nuevo:true})+actor(reader,'/rpc/vortex_config_fiscal_publica')+`SELECT vortex_validar_solicitud();`+check(`vortex_config_fiscal_publica('${tenant}')->>'punto_venta'='3'`,'punto de venta')+check(`NOT vortex_config_fiscal_publica('${tenant}') ? 'certificado_key' AND NOT vortex_config_fiscal_publica('${tenant}') ? 'certificado_crt'`,'sin secretos')+fail(`SELECT vortex_config_fiscal_publica('${foreign}');`,'Sin acceso'));
 const rest=()=>`RESET ROLE;UPDATE comercio_parametrizacion SET parametros=jsonb_set(parametros,'{modulos,restaurante}','true') WHERE comercio_id='${tenant}';`+actor()+`SELECT vortex_guardar_usuario('${tenant}','${reader}','Mozo','operador',true,'personalizado','{"restaurante":["consultar","operar"]}',0,true,ARRAY['mozo'],NULL,false);`;
 test('Desactivar cuenta de Restaurante conserva roles e impide operar',rest()+`SELECT vortex_guardar_usuario('${tenant}','${reader}','Mozo','operador',false,'personalizado','{"restaurante":["consultar","operar"]}',1,false,ARRAY['mozo'],NULL,false);`+check(`SELECT NOT activo AND roles=ARRAY['mozo'] FROM restaurante_permisos WHERE usuario_id='${reader}'`,'roles conservados')+actor(reader,'/rpc/restaurante_operar')+check(`NOT restaurante_habilitado('${tenant}')`,'revocado'));
 test('Una cuenta con otro comercio no elude permiso de Restaurante',rest()+`RESET ROLE;INSERT INTO comercio_usuarios(comercio_id,user_id,rol,activo) VALUES('${foreign}','${reader}','admin',true);`+actor()+`SELECT vortex_guardar_usuario('${tenant}','${reader}','Mozo','operador',true,'personalizado','{"restaurante":["consultar"]}',1,false,ARRAY['mozo'],NULL,false);`+actor(reader,'/rpc/restaurante_operar')+`SELECT vortex_validar_solicitud();`+check(`NOT restaurante_habilitado('${tenant}')`,'rol ajeno no autoriza'));
 test('El backend rechaza vincular un chofer con una cuenta sin Transporte',save(reader,{clientes:['consultar']},{nuevo:true})+actor(admin,'/rpc/transporte_operar')+fail(`SELECT transporte_operar('${tenant}','chofer',NULL,NULL,'{"nombre":"No autorizado","user_id":"${reader}"}');`,'El usuario no tiene acceso a Transporte'));
 test('Chofer de solo consulta no adjunta archivos aunque vea el servicio',save(driver,{transporte:['consultar']},{nuevo:true})+actor(admin,'/rpc/transporte_operar')+
 `DO $$DECLARE unidad uuid;chofer uuid;servicio uuid;BEGIN
 unidad:=transporte_operar('${tenant}','unidad',NULL,NULL,'{"nombre":"Grúa","patente":"AA123AA","tipo":"grua","kilometraje":0,"horas":0}');
 chofer:=transporte_operar('${tenant}','chofer',NULL,NULL,'{"nombre":"Chofer","user_id":"${driver}"}');
 servicio:=transporte_operar('${tenant}','servicio',NULL,NULL,jsonb_build_object('tipo','auxilio','cliente_id','${id(20)}','origen','Ruta','destino','Taller','carga','Auto','precio_manual',121,'iva',21,'unidad_id',unidad,'chofer_id',chofer));
 PERFORM set_config('app.test_servicio',servicio::text,true);END$$;`+actor(driver,'','POST')+
 check(`transporte_archivo_autorizado('${tenant}/'||current_setting('app.test_servicio')||'/foto.jpg')`,'puede consultar servicio')+
 fail(`INSERT INTO storage.objects(bucket_id,name) VALUES('transporte','${tenant}/'||current_setting('app.test_servicio')||'/foto.jpg');`,'row-level security'));
 test('Usuario puede crear clientes sin obtener edición o eliminación',save(reader,{clientes:['consultar','crear']},{nuevo:true})+actor(reader,'/clientes','POST')+
 `SELECT vortex_validar_solicitud();INSERT INTO clientes VALUES('${id(80)}','${tenant}','Nuevo','',NULL);`+
 actor(reader,'/clientes','PATCH')+`UPDATE clientes SET nombre='No autorizado' WHERE id='${id(80)}';`+actor(reader,'/clientes','DELETE')+`DELETE FROM clientes WHERE id='${id(80)}';`+
 actor(reader,'/clientes','GET')+check(`SELECT nombre='Nuevo' FROM clientes WHERE id='${id(80)}'`,'crear sin modificar ni borrar'));
 test('Campo vincula usuarios desde la cuenta central y filtra perfiles ajenos',`RESET ROLE;UPDATE comercio_parametrizacion SET parametros=jsonb_set(parametros,'{modulos,campo}','true') WHERE comercio_id='${tenant}';`+actor()+save(reader,{campo:['consultar','operar']},{nuevo:true})+save(driver,{transporte:['consultar','operar']},{nuevo:true})+
 `SELECT campo_vincular_operador('${tenant}','${reader}','${id(70)}');`+check(`SELECT user_id='${reader}' FROM campo_operarios WHERE id='${id(70)}'`,'vínculo real')+
 check(`SELECT count(*)=1 FROM campo_listar_operadores_comercio('${tenant}') WHERE user_id='${reader}'`,'operario elegible')+check(`SELECT count(*)=0 FROM campo_listar_operadores_comercio('${tenant}') WHERE user_id='${driver}'`,'chofer no listado')+
 actor(reader,'/rpc/campo_crear_parte')+`SELECT vortex_validar_solicitud();`+check(`vortex_solicitud_permitida('${tenant}')`,'puede operar partes')+actor(reader,'/rpc/campo_confirmar_parte')+fail('SELECT vortex_validar_solicitud();','No tenés permiso'));
 test('Campo protege lecturas privilegiadas identificadas por sesión',save(reader,{clientes:['consultar']},{nuevo:true})+`RESET ROLE;INSERT INTO comercio_usuarios(comercio_id,user_id,rol,activo) VALUES('${foreign}','${reader}','admin',true);`+
 actor(reader,'/rpc/campo_gps_metricas_sesion')+`SELECT vortex_validar_solicitud();`+fail(`SELECT campo_gps_metricas_sesion('${id(71)}');`,'Sin permiso para esta sesión de Campo'));
 sql(actor()+save(legacy,{clientes:['consultar']}));
 const args=['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
 const child=spawn(path.join(bin,'psql.exe'),args,{windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}});
 let errors='';child.stderr.on('data',d=>errors+=d);
 const locked=new Promise((resolve,reject)=>{child.on('error',reject);child.stdout.on('data',d=>{if(String(d).includes('locked'))resolve();});child.on('exit',code=>{if(code!==0)reject(Error(errors));});});
 const done=new Promise(resolve=>child.on('exit',resolve));
 child.stdin.end(`BEGIN;${actor()}${save(legacy,{clientes:['consultar','crear']},{version:1})}SELECT 'locked';SELECT pg_sleep(0.5);COMMIT;`);
 await locked;
 const second=spawnSync(path.join(bin,'psql.exe'),args,{input:actor()+save(legacy,{productos:['consultar']},{version:1}),encoding:'utf8',windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'},timeout:30000});
 assert.notEqual(second.status,0);assert.match(second.stderr,/El acceso cambió/);assert.equal(await done,0,errors);
 sql(check(`SELECT version=2 AND permisos->'clientes' ? 'crear' FROM comercio_usuario_accesos WHERE user_id='${legacy}'`,'sin sobrescribir cambio concurrente'));
 passed++;console.log('OK Dos sesiones simultáneas no sobrescriben permisos con una versión vieja');
 console.log(passed+' pruebas de usuarios correctas en PostgreSQL temporal.');
}finally{if(started)run('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);const target=realpathSync(cluster);assert.equal(path.dirname(target),root);assert.ok(path.basename(target).startsWith('vortex-usuarios-test-'));rmSync(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
