// Integración real en PostgreSQL temporal local. No conecta a Supabase.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pgBin=process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const tempRoot=realpathSync(os.tmpdir());
const cluster=mkdtempSync(path.join(tempRoot,'vortex-taller-test-'));
const dataDir=path.join(cluster,'data');
const server=net.createServer();
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const port=server.address().port;
await new Promise(resolve=>server.close(resolve));
const command=(name,args,input)=>spawnSync(path.join(pgBin,name+(process.platform==='win32'?'.exe':'')),args,{input,encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,PGCLIENTENCODING:'UTF8'},stdio:name==='pg_ctl'?'ignore':'pipe'});
const checked=result=>{if(result.error)throw result.error;if(result.status!==0)throw new Error(result.stderr || result.stdout);return result.stdout;};
const sql=input=>checked(command('psql',['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input));
const migration=name=>readFileSync(path.join(repo,'supabase/migrations',name),'utf8');
const tenant='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
const user='20000000-0000-0000-0000-000000000001',operator='20000000-0000-0000-0000-000000000002';
const client='30000000-0000-0000-0000-000000000001',foreign='30000000-0000-0000-0000-000000000002';
const product='40000000-0000-0000-0000-000000000001',foreignProduct='40000000-0000-0000-0000-000000000002',variant='50000000-0000-0000-0000-000000000001';
const json=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const actor=`SET app.test_user='${user}'; SET ROLE authenticated;`;
const check=(query,label)=>`SELECT test_assert((${query}), '${label}');`;
const fails=(statement,message)=>`SELECT test_error($stmt$${statement}$stmt$, '${message}');`;
let passed=0,started=false;
const test=(label,statement)=>{sql(statement);passed++;console.log('OK '+label);};
try {
  checked(command('initdb',['-D',dataDir,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']));
  checked(command('pg_ctl',['-D',dataDir,'-l',path.join(cluster,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'])); started=true;
  sql(readFileSync(path.join(repo,'scripts/fixtures/taller-schema.sql'),'utf8'));
  sql(migration('20260609150000_presupuestos.sql'));
  sql(migration('20260921170000_corregir_confirmacion_presupuesto_stock.sql'));
  sql(migration('20260916180000_ventas_desde_orden_permiten_stock_negativo.sql'));
  sql('CREATE TRIGGER stock_insert AFTER INSERT ON venta_items FOR EACH ROW EXECUTE FUNCTION apply_venta_item_stock();');
  sql(migration('20261006100000_vortex_taller.sql'));
  sql('GRANT ALL ON presupuestos,presupuesto_items,presupuesto_pagos TO authenticated;');
  sql(`INSERT INTO comercio VALUES ('${tenant}'),('${other}');
    INSERT INTO comercio_usuarios VALUES ('${tenant}','${user}','admin',true),('${tenant}','${operator}','operador',true);
    INSERT INTO comercio_parametrizacion(comercio_id,parametros) VALUES ('${tenant}','{"modulos":{"taller":true}}'),('${other}','{"modulos":{"taller":true}}');
    INSERT INTO clientes VALUES ('${client}','${tenant}','Cliente','Prueba','30545766678'),('${foreign}','${other}','Ajeno','Prueba',NULL);
    INSERT INTO proveedores VALUES ('${product}','${tenant}'),('${foreignProduct}','${other}');
    INSERT INTO productos(id,comercio_id,stock) VALUES ('${product}','${tenant}',10),('${foreignProduct}','${other}',10);
    INSERT INTO producto_variantes VALUES ('${variant}','${product}',10);
    INSERT INTO bancos VALUES ('${foreignProduct}','${other}');
    INSERT INTO tarjetas_credito VALUES ('${product}','${tenant}');`);
  const vehicleData={cliente_id:client,patente:'AB 123-CD',marca:'Renault',modelo:'Kangoo',kilometraje:1000};
  const saveVehicle=(data=vehicleData,commerce=tenant)=>`SELECT taller_guardar_catalogo('${commerce}','vehiculo',NULL,${json(data)});`;
  test('Modulo apagado no permite operar',`UPDATE comercio_parametrizacion SET parametros='{"modulos":{"taller":false}}' WHERE comercio_id='${tenant}'; ${actor} ${fails(saveVehicle(),'taller_sin_permisos')}`);
  sql(`UPDATE comercio_parametrizacion SET parametros='{"modulos":{"taller":true}}' WHERE comercio_id='${tenant}';`);
  test('Operador no puede administrar',`SET app.test_user='${operator}'; SET ROLE authenticated; ${fails(saveVehicle(),'taller_sin_permisos')}`);
  test('Cliente y comercio ajenos rechazados',actor+fails(saveVehicle({...vehicleData,cliente_id:foreign}),'taller_cliente_otro_comercio')+fails(saveVehicle(vehicleData,other),'taller_sin_permisos'));
  const vehicle=sql(actor+saveVehicle()).trim();
  test('Patente normalizada y unica',actor+check(`SELECT patente='AB123CD' FROM taller_vehiculos WHERE id='${vehicle}'`,'patente')+fails(saveVehicle(),'duplicate key'));
  test('No permite escritura directa de tablas',actor+fails(`UPDATE taller_vehiculos SET marca='Otro' WHERE id='${vehicle}'`,'permission denied'));
  const orderData={vehiculo_id:vehicle,kilometraje:1001,motivo:'Service',turno:'2026-10-10T10:00:00Z'};
  const createOrder=(data=orderData)=>`SELECT taller_guardar_orden('${tenant}',NULL,NULL,${json(data)});`;
  test('No retrocede kilometraje',actor+fails(createOrder({...orderData,kilometraje:999}),'taller_kilometraje_inferior'));
  const order=sql(actor+createOrder()).trim();
  const version=()=>Number(sql(`SELECT version FROM taller_ordenes WHERE id='${order}'`).trim());
  const service={tipo:'mano_obra',descripcion:'Service',cantidad:1.5,precio_unitario:121,porcentaje_iva:21,costo_unitario:20};
  const part={tipo:'repuesto',producto_id:product,producto_variante_id:variant,descripcion:'Filtro',cantidad:2,precio_unitario:121,porcentaje_iva:21,costo_unitario:30};
  const add=(data,ver=version())=>`SELECT taller_guardar_item('${order}',${ver},NULL,${json(data)},false);`;
  test('Rechaza producto y proveedor ajenos',actor+fails(add({...part,producto_id:foreignProduct,producto_variante_id:null}),'taller_producto_otro_comercio')+fails(add({...service,tipo:'servicio_externo',proveedor_id:foreignProduct}),'taller_proveedor_otro_comercio'));
  test('Repuesto requiere variante y cantidad entera',actor+fails(add({...part,producto_variante_id:null}),'taller_variante_requerida')+fails(add({...part,cantidad:1.5}),'check constraint'));
  test('Rechaza NaN y exceso de decimales',actor+fails(add({...service,cantidad:'NaN'}),'check constraint')+fails(add({...service,cantidad:0.00001}),'check constraint'));
  sql(actor+add(service));
  test('Detecta edicion concurrente',actor+fails(add(part,1),'taller_version_desactualizada'));
  sql(actor+add(part));
  const budget=sql(actor+`SELECT taller_generar_presupuesto('${order}',${version()});`).trim();
  test('Presupuesto con horas decimales, IVA y sin mover stock',actor+check(`SELECT total=423.5 AND subtotal=350 AND total_iva=73.5 FROM presupuestos WHERE id='${budget}'`,'totales')+check(`SELECT cantidad=1.5 FROM presupuesto_items WHERE presupuesto_id='${budget}' AND producto_id IS NULL`,'horas')+check(`SELECT stock=10 FROM producto_variantes WHERE id='${variant}'`,'stock presupuesto'));
  test('Generar presupuesto es idempotente',actor+check(`SELECT taller_generar_presupuesto('${order}',1)='${budget}'::uuid`,'idempotencia presupuesto'));
  test('Detalle aprobado protegido',actor+fails(add(service),'taller_detalle_congelado')+fails(`UPDATE presupuesto_items SET precio_unitario=1 WHERE presupuesto_id='${budget}'`,'taller_presupuesto_protegido'));
  test('No confirma antes de estar lista; revierte stock y venta',actor+fails(`SELECT confirmar_presupuesto('${budget}')`,'taller_orden_no_lista')+check('SELECT count(*)=0 FROM ventas','sin venta parcial')+check(`SELECT stock=10 FROM producto_variantes WHERE id='${variant}'`,'stock rollback'));
  const state=(next,detail='')=>`SELECT taller_cambiar_estado('${order}',${version()},'${next}','${detail}');`;
  test('Requiere aprobacion y respeta transiciones',actor+fails(state('aprobado'),'taller_motivo_requerido')+fails(state('entregado'),'taller_transicion_invalida'));
  sql(actor+state('aprobado','Aprobado en mostrador')); sql(actor+state('en_reparacion'));
  test('Requiere describir trabajo terminado',actor+fails(state('listo'),'taller_trabajo_realizado_requerido'));
  sql(actor+`SELECT taller_guardar_orden('${tenant}','${order}',${version()},${json({trabajo_realizado:'Cambio de filtro y service',turno:'',proximo_service:'2027-01-05',proximo_service_km:2000})});`);
  sql(actor+state('listo'));
  const pay=[{tipo_pago:'cta_cte',monto:423.5}];
  const invoice=(payments=pay)=>`SELECT taller_facturar_orden('${order}','factura_c',${json(payments)});`;
  test('Pagos invalidos no crean venta',actor+fails(invoice([{tipo_pago:'cta_cte',monto:1}]),'taller_pagos_no_coinciden'));
  test('Banco ajeno rechazado atomicamente',actor+fails(invoice([{tipo_pago:'transferencia',monto:423.5,banco_id:foreignProduct}]),'banco pertenece a otro comercio')+check('SELECT count(*)=0 FROM ventas','sin venta')+check(`SELECT tipo_pago='cta_cte' FROM presupuesto_pagos WHERE presupuesto_id='${budget}'`,'pago anterior intacto'));
  const sale=sql(actor+invoice()).trim();
  test('Venta integrada con stock y cuenta corriente',actor+check(`SELECT venta_id='${sale}'::uuid FROM taller_ordenes WHERE id='${order}'`,'venta vinculada')+check(`SELECT stock=8 FROM producto_variantes WHERE id='${variant}'`,'stock consumido')+check(`SELECT sum(monto)=423.5 FROM cuenta_corriente WHERE venta_id='${sale}'`,'cuenta corriente')+check(`SELECT count(*)=2 FROM venta_items WHERE venta_id='${sale}'`,'detalle'));
  test('Reintento no duplica venta, stock ni deuda',actor+check(`SELECT taller_facturar_orden('${order}','factura_c',${json(pay)})='${sale}'::uuid`,'idempotencia venta')+check('SELECT count(*)=1 FROM ventas','venta unica')+check(`SELECT stock=8 FROM producto_variantes WHERE id='${variant}'`,'stock una vez')+check('SELECT count(*)=1 FROM cuenta_corriente','deuda unica'));
  test('Detalle facturado protegido, CAE permitido',actor+fails(`UPDATE venta_items SET cantidad=3 WHERE venta_id='${sale}'`,'taller_venta_protegida')+`UPDATE ventas SET cae='86406153097333',numero_comprobante='0003-00000128',punto_venta=3,numero_secuencial=128 WHERE id='${sale}';`);
  sql(actor+state('entregado'));
  test('Entrega conserva historial y proximo servicio',actor+check(`SELECT estado='entregado' AND entregado_at IS NOT NULL AND proximo_service='2027-01-05' FROM taller_ordenes WHERE id='${order}'`,'entrega')+check(`SELECT count(*)>=6 FROM taller_orden_eventos WHERE orden_id='${order}'`,'historial'));
  test('RLS oculta datos de comercios ajenos',`SET app.test_user='${foreign}'; SET ROLE authenticated; ${check('SELECT count(*)=0 FROM taller_ordenes','RLS ordenes')}${check('SELECT count(*)=0 FROM taller_orden_items','RLS items')}`);
  test('Funciones internas y anon no expuestos',check("SELECT NOT has_function_privilege('authenticated','taller_exigir_admin(uuid)','EXECUTE')",'privada')+check("SELECT NOT has_function_privilege('anon','taller_facturar_orden(uuid,tipo_comprobante,jsonb)','EXECUTE')",'anon'));
  sql(migration('20261006110000_taller_marcas_modelos.sql'));
  sql(migration('20261006111000_taller_catalogar_vehiculos_existentes.sql'));
  test('Catalogacion conserva vehiculos y unifica nombres', actor+check(`SELECT marca_id IS NOT NULL AND modelo_id IS NOT NULL AND marca='RENAULT' AND modelo='KANGOO' FROM taller_vehiculos WHERE id='${vehicle}'`,'catalogado'));
  const brand=sql(actor+`SELECT taller_guardar_marca_modelo('${tenant}','marca','  CITROËN  ',NULL);`).trim();
  test('Marcas duplicadas por espacios, mayusculas o acentos reutilizan ID',actor+check(`SELECT taller_guardar_marca_modelo('${tenant}','marca','citroen',NULL)='${brand}'::uuid`,'marca unica'));
  const model=sql(actor+`SELECT taller_guardar_marca_modelo('${tenant}','modelo',' C3 ','${brand}');`).trim();
  test('Modelos duplicados reutilizan ID dentro de marca',actor+check(`SELECT taller_guardar_marca_modelo('${tenant}','modelo','c3','${brand}')='${model}'::uuid`,'modelo unico'));
  const anotherBrand=sql(actor+`SELECT taller_guardar_marca_modelo('${tenant}','marca','OTRA',NULL);`).trim();
  test('Mismo nombre de modelo en otra marca conserva identidad distinta',actor+check(`SELECT taller_guardar_marca_modelo('${tenant}','modelo','C3','${anotherBrand}')<>'${model}'::uuid`,'marca distinta'));
  test('Catalogos rechazan operadores y comercio ajeno',`SET app.test_user='${operator}'; SET ROLE authenticated; `+fails(`SELECT taller_guardar_marca_modelo('${tenant}','marca','NUEVA',NULL);`,'taller_sin_permisos'));
  test('Catalogos rechazan escritura directa y nombres vacios',actor+fails(`INSERT INTO taller_marcas(comercio_id,nombre) VALUES('${tenant}','NUEVA');`,'permission denied')+fails(`SELECT taller_guardar_marca_modelo('${tenant}','marca',' ',NULL);`,'taller_nombre_invalido'));
  const foreignBrand=sql(`INSERT INTO taller_marcas(comercio_id,nombre) VALUES('${other}','AJENA') RETURNING id;`).trim();
  test('Catalogos RLS oculta marcas ajenas y rechaza su modelo',actor+check(`SELECT count(*)=0 FROM taller_marcas WHERE comercio_id='${other}'`,'rls marcas')+fails(`SELECT taller_guardar_marca_modelo('${tenant}','modelo','C3','${foreignBrand}');`,'taller_marca_otro_comercio'));
  test('Vehiculo rechaza modelo de otra marca',actor+fails(saveVehicle({...vehicleData,patente:'CD234EF',marca_id:anotherBrand,modelo_id:model}),'taller_marca_modelo_inconsistente'));
  const mapped=sql(actor+saveVehicle({...vehicleData,patente:'CD234EF',marca:'Texto ignorado',modelo:'Texto ignorado',marca_id:brand,modelo_id:model})).trim();
  test('Vehiculo toma nombres canonicos desde IDs',actor+check(`SELECT marca_id='${brand}' AND modelo_id='${model}' AND modelo='C3' FROM taller_vehiculos WHERE id='${mapped}'`,'canonicos'));
  test('Formulario anterior compatible con catalogos',actor+check(`SELECT taller_guardar_catalogo('${tenant}','vehiculo','${mapped}',${json({...vehicleData,patente:'CD234EF',marca:'  renault ',modelo:' kangoo '})})='${mapped}'::uuid`,'compatibilidad')+check(`SELECT marca='RENAULT' AND modelo='KANGOO' AND marca_id IS NOT NULL AND modelo_id IS NOT NULL FROM taller_vehiculos WHERE id='${mapped}'`,'canonicos anteriores'));
  sql(migration('20261006120000_taller_vehiculo_presupuesto.sql'));
  sql(migration('20261006121000_taller_vehiculo_presupuestos_existentes.sql'));
  test('Presupuesto existente incorpora datos del vehiculo sin cambiar importes',actor+check(`SELECT taller_vehiculo->>'patente'='AB123CD' AND taller_vehiculo->>'marca'='RENAULT' AND (taller_vehiculo->>'kilometraje')::integer=1001 AND total=423.5 AND estado='confirmado' FROM presupuestos WHERE id='${budget}'`,'vehiculo presupuesto existente'));
  const anotherOrder=sql(actor+createOrder({...orderData,vehiculo_id:mapped,kilometraje:1005})).trim();
  sql(actor+`SELECT taller_guardar_item('${anotherOrder}',1,NULL,${json(service)},false);`);
  const anotherBudget=sql(actor+`SELECT taller_generar_presupuesto('${anotherOrder}',2);`).trim();
  test('Presupuesto nuevo conserva patente marca modelo y kilometraje de ingreso',actor+check(`SELECT taller_vehiculo->>'patente'='CD234EF' AND taller_vehiculo->>'modelo'='KANGOO' AND (taller_vehiculo->>'kilometraje')::integer=1005 FROM presupuestos WHERE id='${anotherBudget}'`,'vehiculo presupuesto nuevo'));
  sql(actor+`SELECT taller_guardar_catalogo('${tenant}','vehiculo','${mapped}',${json({...vehicleData,patente:'EF345GH',marca_id:brand,modelo_id:model,kilometraje:1006})});`);
  test('Cambiar vehiculo no modifica datos del presupuesto emitido',actor+check(`SELECT taller_vehiculo->>'patente'='CD234EF' AND taller_vehiculo->>'marca'='RENAULT' AND (taller_vehiculo->>'kilometraje')::integer=1005 FROM presupuestos WHERE id='${anotherBudget}'`,'datos congelados')+fails(`UPDATE presupuestos SET taller_vehiculo='{}' WHERE id='${anotherBudget}';`,'taller_presupuesto_protegido'));
  test('Proteccion del presupuesto restaurada tras reparacion',check(`SELECT tgenabled='O' FROM pg_trigger WHERE tgname='taller_presupuesto_protegido'`,'trigger activo'));
  sql(migration('20261022120000_taller_flujo_flexible.sql'));
  const flexible=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
  const flexVersion=()=>Number(sql(`SELECT version FROM taller_ordenes WHERE id='${flexible}'`).trim());
  const flexState=next=>`SELECT taller_cambiar_estado('${flexible}',${flexVersion()},'${next}','');`;
  const flexAdd=(data=service)=>`SELECT taller_guardar_item('${flexible}',${flexVersion()},NULL,${json(data)},false);`;
  test('Ingresa directo a reparacion sin diagnostico ni presupuesto',actor+flexState('en_reparacion')+check(`SELECT estado='en_reparacion' AND presupuesto_id IS NULL AND aprobacion_cliente IS NULL FROM taller_ordenes WHERE id='${flexible}'`,'flujo directo'));
  test('Permite cargar mano de obra durante reparacion',actor+flexAdd());
  test('Mantiene control de version y tenant en flujo flexible',actor+fails(`SELECT taller_guardar_item('${flexible}',1,NULL,${json(service)},false);`,'taller_version_desactualizada')+fails(flexAdd({...part,producto_id:foreignProduct,producto_variante_id:null}),'taller_producto_otro_comercio'));
  sql(actor+`SELECT taller_guardar_orden('${tenant}','${flexible}',${flexVersion()},${json({trabajo_realizado:'Service directo'})});`);
  sql(actor+flexState('listo'));
  test('Permite agregar repuestos al finalizar antes de facturar',actor+flexAdd(part));
  const directSale=sql(actor+`SELECT taller_facturar_orden('${flexible}','recibo_x',${json(pay)});`).trim();
  test('Factura sin presupuesto previo con stock y deuda correctos',actor+check(`SELECT venta_id='${directSale}' AND estado='listo' FROM taller_ordenes WHERE id='${flexible}'`,'venta directa')+check(`SELECT total=423.5 FROM ventas WHERE id='${directSale}'`,'total final')+check(`SELECT stock=6 FROM producto_variantes WHERE id='${variant}'`,'stock directo')+check(`SELECT sum(monto)=423.5 FROM cuenta_corriente WHERE venta_id='${directSale}'`,'deuda directa')+fails(flexAdd(),'taller_detalle_congelado'));
  test('Reintento de venta directa no duplica stock',actor+check(`SELECT taller_facturar_orden('${flexible}','recibo_x',${json(pay)})='${directSale}'`,'reintento directo')+check(`SELECT stock=6 FROM producto_variantes WHERE id='${variant}'`,'stock idempotente'));
  sql(actor+flexState('entregado'));
  // La orden presupuestada anterior sigue abierta: cambiar conceptos debe
  // actualizar totales y pagos, sin permitir edicion directa del comprobante.
  const quoteVersion=()=>Number(sql(`SELECT version FROM taller_ordenes WHERE id='${anotherOrder}'`).trim());
  sql(actor+`SELECT taller_cambiar_estado('${anotherOrder}',${quoteVersion()},'aprobado','Cliente por telefono');`);
  const external={...service,tipo:'servicio_externo',proveedor_id:product,descripcion:'Rectificacion'};
  const extra=sql(actor+`SELECT taller_guardar_item('${anotherOrder}',${quoteVersion()},NULL,${json(external)},false);`).trim();
  test('Agregar servicio externo actualiza presupuesto e invalida aprobacion',actor+check(`SELECT total=363 AND subtotal=300 AND total_iva=63 FROM presupuestos WHERE id='${anotherBudget}'`,'presupuesto actualizado')+check(`SELECT estado='presupuestado' AND aprobacion_cliente IS NULL FROM taller_ordenes WHERE id='${anotherOrder}'`,'aprobacion invalidada')+check(`SELECT sum(monto)=363 FROM presupuesto_pagos WHERE presupuesto_id='${anotherBudget}'`,'pagos actualizados')+fails(`UPDATE presupuesto_items SET precio_unitario=1 WHERE presupuesto_id='${anotherBudget}';`,'taller_presupuesto_protegido'));
  sql(actor+`SELECT taller_cambiar_estado('${anotherOrder}',${quoteVersion()},'en_reparacion','');`);
  sql(actor+`SELECT taller_guardar_item('${anotherOrder}',${quoteVersion()},'${extra}',${json({...external,cantidad:2})},false);`);
  test('Editar y eliminar conceptos funciona con presupuesto durante reparacion',actor+check(`SELECT total=423.5 FROM presupuestos WHERE id='${anotherBudget}'`,'edicion presupuesto')+`SELECT taller_guardar_item('${anotherOrder}',${quoteVersion()},'${extra}','{}',true);`+check(`SELECT total=181.5 FROM presupuestos WHERE id='${anotherBudget}'`,'eliminacion presupuesto'));
  const noCharge=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
  sql(actor+`SELECT taller_cambiar_estado('${noCharge}',1,'en_reparacion',''); SELECT taller_guardar_orden('${tenant}','${noCharge}',2,${json({trabajo_realizado:'Revision sin cargo'})}); SELECT taller_cambiar_estado('${noCharge}',3,'listo',''); SELECT taller_cambiar_estado('${noCharge}',4,'entregado','');`);
  test('Finaliza y entrega sin conceptos ni comprobantes obligatorios',actor+check(`SELECT estado='entregado' AND venta_id IS NULL AND presupuesto_id IS NULL AND entregado_at IS NOT NULL FROM taller_ordenes WHERE id='${noCharge}'`,'sin cargo')+fails(`SELECT taller_guardar_item('${noCharge}',5,NULL,${json(service)},false);`,'taller_detalle_congelado'));
  sql(migration('20261022123000_taller_finalizar_desde_modal.sql'));
  const modalOrder=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
  const finish=(ver,work='  Revision y cambio de filtro  ',detail='Control final correcto')=>`SELECT taller_finalizar_orden('${modalOrder}',${ver},${json(work)} #>> '{}',${json(detail)} #>> '{}');`;
  test('Finalizar en estado invalido revierte tambien el trabajo realizado',actor+fails(finish(1),'taller_transicion_invalida')+check(`SELECT estado='recibido' AND trabajo_realizado='' AND version=1 FROM taller_ordenes WHERE id='${modalOrder}'`,'finalizacion atomica'));
  sql(actor+`SELECT taller_cambiar_estado('${modalOrder}',1,'en_reparacion','');`);
  test('Modal requiere trabajo realizado y conserva version ante errores',actor+fails(finish(2,'  '),'taller_trabajo_realizado_requerido')+fails(finish(1),'taller_version_desactualizada')+check(`SELECT trabajo_realizado='' AND version=2 FROM taller_ordenes WHERE id='${modalOrder}'`,'sin cambios parciales'));
  test('Finalizar desde modal rechaza operador y otro comercio',`SET app.test_user='${operator}'; SET ROLE authenticated; `+fails(finish(2),'taller_sin_permisos')+`SET app.test_user='${foreign}'; `+fails(finish(2),'taller_sin_permisos'));
  sql(actor+finish(2));
  test('Finalizar guarda descripcion e historial sin perder otros datos',actor+check(`SELECT estado='listo' AND trabajo_realizado='Revision y cambio de filtro' AND version=3 AND turno='2026-10-10T10:00:00Z' AND motivo='Service' FROM taller_ordenes WHERE id='${modalOrder}'`,'datos finalizacion')+check(`SELECT count(*)=1 FROM taller_orden_eventos WHERE orden_id='${modalOrder}' AND estado_nuevo='listo' AND detalle='Control final correcto'`,'historial finalizacion'));
  test('Reintento desactualizado no sobrescribe trabajo terminado',actor+fails(finish(2,'Otro trabajo'),'taller_version_desactualizada')+check(`SELECT trabajo_realizado='Revision y cambio de filtro' AND version=3 FROM taller_ordenes WHERE id='${modalOrder}'`,'sin sobrescritura')+check("SELECT NOT has_function_privilege('anon','taller_finalizar_orden(uuid,integer,text,text)','EXECUTE')",'finalizar privado anon'));
  sql(migration('20261022130000_taller_facturar_orden_entregada.sql'));
  for (const withQuote of [false,true]) {
    const label=withQuote?'con presupuesto':'sin presupuesto previo';
    const delivered=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
    const deliveredVersion=()=>Number(sql(`SELECT version FROM taller_ordenes WHERE id='${delivered}'`).trim());
    sql(actor+`SELECT taller_guardar_item('${delivered}',1,NULL,${json(service)},false);`);
    sql(actor+`SELECT taller_guardar_item('${delivered}',2,NULL,${json(part)},false);`);
    if(withQuote)sql(actor+`SELECT taller_generar_presupuesto('${delivered}',${deliveredVersion()});`);
    sql(actor+`SELECT taller_cambiar_estado('${delivered}',${deliveredVersion()},'en_reparacion','');`);
    sql(actor+`SELECT taller_finalizar_orden('${delivered}',${deliveredVersion()},'Service terminado','');`);
    sql(actor+`SELECT taller_cambiar_estado('${delivered}',${deliveredVersion()},'entregado','');`);
    const deliveryDate=sql(`SELECT entregado_at::text FROM taller_ordenes WHERE id='${delivered}'`).trim();
    const previousStock=Number(sql(`SELECT stock FROM producto_variantes WHERE id='${variant}'`).trim());
    const previousSales=Number(sql('SELECT count(*) FROM ventas').trim());
    const previousBudgets=Number(sql('SELECT count(*) FROM presupuestos').trim());
    const deliveredInvoice=payments=>`SELECT taller_facturar_orden('${delivered}','recibo_x',${json(payments)});`;
    test(`Entrega ${label}: pagos invalidos revierten la operacion completa`,actor+fails(deliveredInvoice([{tipo_pago:'cta_cte',monto:1}]),'taller_pagos_no_coinciden')+fails(deliveredInvoice([{tipo_pago:'transferencia',monto:423.5,banco_id:foreignProduct}]),'banco pertenece a otro comercio')+check(`SELECT count(*)=${previousSales} FROM ventas`,'sin venta parcial entregada')+check(`SELECT count(*)=${previousBudgets} FROM presupuestos`,'sin presupuesto parcial entregada')+check(`SELECT stock=${previousStock} FROM producto_variantes WHERE id='${variant}'`,'sin stock parcial entregada'));
    test(`Entrega ${label}: operador y otro comercio no facturan`,`SET app.test_user='${operator}'; SET ROLE authenticated; `+fails(deliveredInvoice(pay),'taller_sin_permisos')+`SET app.test_user='${foreign}'; `+fails(deliveredInvoice(pay),'taller_sin_permisos'));
    const deliveredSale=sql(actor+deliveredInvoice(pay)).trim();
    test(`Factura orden entregada ${label} sin cambiar su entrega`,actor+check(`SELECT estado='entregado' AND entregado_at='${deliveryDate}'::timestamptz AND venta_id='${deliveredSale}' FROM taller_ordenes WHERE id='${delivered}'`,'entrega conservada')+check(`SELECT total=423.5 FROM ventas WHERE id='${deliveredSale}'`,'total entregada')+check(`SELECT stock=${previousStock-2} FROM producto_variantes WHERE id='${variant}'`,'stock entregada')+check(`SELECT sum(monto)=423.5 FROM cuenta_corriente WHERE venta_id='${deliveredSale}'`,'deuda entregada')+check(`SELECT count(*)=1 FROM taller_orden_eventos WHERE orden_id='${delivered}' AND estado_anterior='entregado' AND estado_nuevo='entregado' AND detalle LIKE 'Venta vinculada:%'`,'historial entregada'));
    test(`Reintento ${label} no duplica venta ni stock`,actor+check(`SELECT taller_facturar_orden('${delivered}','recibo_x',${json(pay)})='${deliveredSale}'`,'venta unica entregada')+check(`SELECT count(*)=${previousSales+1} FROM ventas`,'cantidad ventas entregada')+check(`SELECT stock=${previousStock-2} FROM producto_variantes WHERE id='${variant}'`,'stock unico entregada')+fails(`SELECT taller_guardar_item('${delivered}',${deliveredVersion()},NULL,${json(service)},false);`,'taller_detalle_congelado')+fails(`UPDATE venta_items SET cantidad=3 WHERE venta_id='${deliveredSale}';`,'taller_venta_protegida'));
  }
  test('Facturar sigue rechazando ordenes sin finalizar',actor+fails(`SELECT taller_facturar_orden('${anotherOrder}','recibo_x',${json(pay)});`,'taller_orden_no_lista'));
  sql(actor+`SELECT taller_cambiar_estado('${anotherOrder}',${quoteVersion()},'cancelado','Cancelado por el cliente');`);
  test('Facturar sigue rechazando ordenes canceladas',actor+fails(`SELECT taller_facturar_orden('${anotherOrder}','recibo_x',${json(pay)});`,'taller_orden_no_lista'));
  sql(`INSERT INTO bancos VALUES ('${product}','${tenant}'); INSERT INTO cheques VALUES ('${product}','${tenant}'),('${foreignProduct}','${other}');`);
  for (const [method,payments,debt] of [
    ['contado',[{tipo_pago:'contado',monto:181.5}],0],
    ['transferencia',[{tipo_pago:'transferencia',monto:181.5,banco_id:product}],0],
    ['cheque',[{tipo_pago:'cheque',monto:181.5,cheque_id:product}],0],
    ['tarjeta',[{tipo_pago:'tarjeta',monto:181.5,tarjeta_id:product,cuotas:1}],0],
    ['mixto',[{tipo_pago:'contado',monto:100},{tipo_pago:'cta_cte',monto:81.5}],81.5],
  ]) {
    const paidOrder=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
    sql(actor+`SELECT taller_guardar_item('${paidOrder}',1,NULL,${json(service)},false); SELECT taller_cambiar_estado('${paidOrder}',2,'en_reparacion',''); SELECT taller_finalizar_orden('${paidOrder}',3,'Service terminado','');`);
    if(method==='cheque')test('Cobro de taller rechaza cheque de otro comercio',actor+fails(`SELECT taller_facturar_orden('${paidOrder}','recibo_x',${json([{tipo_pago:'cheque',monto:181.5,cheque_id:foreignProduct}])});`,'cheque pertenece a otro comercio'));
    const paidSale=sql(actor+`SELECT taller_facturar_orden('${paidOrder}','recibo_x',${json(payments)});`).trim();
    test(`Venta de taller con pago ${method} conserva el medio elegido`,actor+check(`SELECT count(*)=${payments.length} AND sum(monto)=181.5 FROM pagos_venta WHERE venta_id='${paidSale}'`,'pagos completos')+payments.map(payment=>check(`SELECT count(*)=1 FROM pagos_venta WHERE venta_id='${paidSale}' AND tipo_pago='${payment.tipo_pago}' AND monto=${payment.monto}${payment.banco_id?` AND banco_id='${payment.banco_id}'`:''}${payment.cheque_id?` AND cheque_id='${payment.cheque_id}'`:''}`,'medio correcto')).join('')+check(`SELECT coalesce(sum(monto),0)=${debt} FROM cuenta_corriente WHERE venta_id='${paidSale}'`,'solo deuda elegida'));
  }
  sql(migration('20261022140000_taller_venta_directa_sin_presupuesto.sql'));
  const financialFingerprint=`md5(jsonb_build_object('ventas',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ventas t),'pagos',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM pagos_venta t),'deuda',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM cuenta_corriente t),'ordenes',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM taller_ordenes t),'stock',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM producto_variantes t))::text)`;
  const fingerprint=sql(`SELECT ${financialFingerprint}`).trim();
  sql(migration('20261022141000_taller_clasificar_presupuestos_automaticos.sql'));
  test('Identifica documentos automaticos sin modificar ventas, deuda, stock ni ordenes',check(`SELECT ${financialFingerprint}='${fingerprint}'`,'datos financieros conservados')+check(`SELECT p.origen_taller_automatico FROM presupuestos p JOIN taller_ordenes o ON o.presupuesto_id=p.id WHERE o.id='${flexible}'`,'automatico identificado')+check(`SELECT NOT origen_taller_automatico FROM presupuestos WHERE id='${budget}'`,'presupuesto emitido conservado'));
  const marked=Number(sql('SELECT count(*) FROM presupuestos WHERE origen_taller_automatico').trim());
  sql(migration('20261022141000_taller_clasificar_presupuestos_automaticos.sql'));
  test('Clasificacion historica es idempotente',check(`SELECT count(*)=${marked} FROM presupuestos WHERE origen_taller_automatico`,'clasificacion estable'));
  for(const [method,payments,debt] of [
    ['contado',[{tipo_pago:'contado',monto:181.5}],0],
    ['transferencia',[{tipo_pago:'transferencia',monto:181.5,banco_id:product}],0],
    ['cheque',[{tipo_pago:'cheque',monto:181.5,cheque_id:product}],0],
    ['tarjeta con recargo',[{tipo_pago:'tarjeta',monto:199.65,recargo_cuotas:18.15,tarjeta_id:product,cuotas:3}],0],
    ['cuenta corriente',[{tipo_pago:'cta_cte',monto:181.5}],181.5],
    ['mixto',[{tipo_pago:'contado',monto:100},{tipo_pago:'cta_cte',monto:81.5}],81.5],
  ]) {
    const direct=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
    sql(actor+`SELECT taller_guardar_item('${direct}',1,NULL,${json(service)},false); SELECT taller_cambiar_estado('${direct}',2,'en_reparacion',''); SELECT taller_finalizar_orden('${direct}',3,'Service terminado','');`);
    if(method!=='contado')sql(actor+`SELECT taller_cambiar_estado('${direct}',4,'entregado','');`);
    const beforeBudgets=Number(sql('SELECT count(*) FROM presupuestos').trim());
    test(`Venta directa ${method}: errores no crean presupuesto ni venta`,actor+fails(`SELECT taller_facturar_orden('${direct}','recibo_x',${json([{tipo_pago:'cta_cte',monto:1}])});`,'taller_pagos_no_coinciden')+fails(`SELECT taller_facturar_orden('${direct}','recibo_x',${json([{tipo_pago:'transferencia',monto:181.5,banco_id:foreignProduct}])});`,'banco pertenece a otro comercio')+check(`SELECT venta_id IS NULL AND presupuesto_id IS NULL FROM taller_ordenes WHERE id='${direct}'`,'sin comprobantes parciales'));
    const saleId=sql(actor+`SELECT taller_facturar_orden('${direct}','recibo_x',${json(payments)});`).trim();
    const finalTotal=payments.reduce((sum,p)=>sum+p.monto,0);
    test(`Venta directa ${method} sin generar ni confirmar presupuesto`,actor+check(`SELECT count(*)=${beforeBudgets} FROM presupuestos`,'sin presupuesto nuevo')+check(`SELECT presupuesto_id IS NULL AND venta_id='${saleId}' AND estado='${method==='contado'?'listo':'entregado'}' FROM taller_ordenes WHERE id='${direct}'`,'orden directa')+check(`SELECT total=${finalTotal} FROM ventas WHERE id='${saleId}'`,'total directo')+check(`SELECT count(*)=${payments.length} AND sum(monto)=${finalTotal} FROM pagos_venta WHERE venta_id='${saleId}'`,'pagos directos')+check(`SELECT coalesce(sum(monto),0)=${debt} FROM cuenta_corriente WHERE venta_id='${saleId}'`,'deuda directa correcta')+check(`SELECT count(*)=0 FROM taller_orden_eventos WHERE orden_id='${direct}' AND detalle='Presupuesto integrado generado'`,'historial sin presupuesto ficticio'));
    test(`Venta directa ${method}: reintento conserva la venta y la deuda`,actor+check(`SELECT taller_facturar_orden('${direct}','recibo_x',${json(payments)})='${saleId}'`,'reintento nueva venta directa')+check(`SELECT coalesce(sum(monto),0)=${debt} FROM cuenta_corriente WHERE venta_id='${saleId}'`,'deuda no duplicada'));
  }
  const directParts=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
  const stockBefore=Number(sql(`SELECT stock FROM producto_variantes WHERE id='${variant}'`).trim());
  sql(actor+`SELECT taller_guardar_item('${directParts}',1,NULL,${json(part)},false); SELECT taller_cambiar_estado('${directParts}',2,'en_reparacion',''); SELECT taller_finalizar_orden('${directParts}',3,'Cambio de filtro','');`);
  const partsSale=sql(actor+`SELECT taller_facturar_orden('${directParts}','recibo_x',${json([{tipo_pago:'contado',monto:242}])});`).trim();
  test('Venta directa conserva variante, descuento de stock y proteccion de la venta',actor+check(`SELECT producto_variante_id='${variant}' AND afecta_stock FROM venta_items WHERE venta_id='${partsSale}'`,'variante directa')+check(`SELECT stock=${stockBefore-2} FROM producto_variantes WHERE id='${variant}'`,'stock directo sin presupuesto')+fails(`UPDATE venta_items SET cantidad=3 WHERE venta_id='${partsSale}';`,'taller_venta_protegida')+check("SELECT NOT has_function_privilege('authenticated','taller_facturar_directa(uuid,tipo_comprobante,jsonb)','EXECUTE')",'helper privado'));
  const quoted=sql(actor+createOrder({...orderData,kilometraje:1006})).trim();
  sql(actor+`SELECT taller_guardar_item('${quoted}',1,NULL,${json(service)},false);`);
  const explicitBudget=sql(actor+`SELECT taller_generar_presupuesto('${quoted}',2);`).trim();
  sql(actor+`SELECT taller_cambiar_estado('${quoted}',3,'en_reparacion',''); SELECT taller_finalizar_orden('${quoted}',4,'Service con presupuesto',''); SELECT taller_facturar_orden('${quoted}','recibo_x',${json([{tipo_pago:'contado',monto:181.5}])});`);
  test('Conserva confirmacion de presupuestos emitidos explicitamente',actor+check(`SELECT estado='confirmado' AND venta_id IS NOT NULL AND NOT origen_taller_automatico FROM presupuestos WHERE id='${explicitBudget}'`,'presupuesto verdadero'));
  console.log(`${passed} pruebas PostgreSQL locales correctas.`);
} finally {
  if(started)checked(command('pg_ctl',['-D',dataDir,'-m','immediate','-w','stop']));
  const resolved=path.resolve(cluster);
  assert.ok(resolved.startsWith(tempRoot+path.sep) && path.basename(resolved).startsWith('vortex-taller-test-'));
  rmSync(resolved,{recursive:true,force:true});
}
