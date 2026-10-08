export function prepareUsuariosTests({ sql, tenant, migration }) {
  sql(`UPDATE comercio_parametrizacion SET parametros='{"modulos":{"restaurante":true}}' WHERE comercio_id='${tenant}';
    DROP FUNCTION public.user_belongs_to_comercio(uuid);
    CREATE FUNCTION public.comercio_acceso_vigente(target_comercio_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM comercio WHERE id=target_comercio_id) $$;
    ALTER TABLE comercio_usuarios ADD CONSTRAINT test_miembro_unico UNIQUE(comercio_id,user_id);
    ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY test_productos ON productos TO authenticated USING(true) WITH CHECK(true);`);
  sql(migration('20261008160000_restaurante_usuarios_roles.sql'));
  sql(`ALTER TABLE clientes ADD COLUMN telefono text, ADD COLUMN calle text, ADD COLUMN numero text, ADD COLUMN localidad text;
    ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY test_clientes ON clientes TO authenticated USING(user_belongs_to_comercio(comercio_id));
    CREATE POLICY restaurante_aislamiento ON clientes AS RESTRICTIVE TO authenticated USING(restaurante_gestion_permitida(comercio_id));`);
  sql(migration('20261008170000_restaurante_clientes.sql'));
  sql(migration('20261008180000_restaurante_cierre_mesas_rendicion.sql'));
}
export function runUsuariosTests({ sql, test, actor, fails, check, tenant, other, admin, driver, stranger }) {
  sql(`UPDATE comercio_parametrizacion SET parametros='{"modulos":{"restaurante":true}}' WHERE comercio_id='${tenant}';`);
  const empleado = '30000000-0000-0000-0000-000000000010';
  const sector = sql(`INSERT INTO restaurante_sectores(comercio_id,nombre) VALUES('${tenant}','Barra de prueba') RETURNING id;`);
  sql(`INSERT INTO auth.users VALUES('${empleado}','moza@prueba.local');`);
  const guardar = (id, roles, sectorId = 'NULL', activo = true, nuevo = false) => `SELECT restaurante_guardar_usuario('${tenant}','${id}','Ana',ARRAY[${roles.map(r => `'${r}'`).join(',')}],${sectorId},false,${activo},${nuevo});`;
  test('Administrador incorpora cuenta exclusiva de restaurante',actor(admin)+guardar(empleado,['mozo'],'NULL',true,true)+check(`EXISTS(SELECT 1 FROM comercio_usuarios WHERE user_id='${empleado}' AND solo_restaurante AND rol='operador')`,'membresía restringida'));
  test('Moza entra al salón sin permisos administrativos',actor(empleado)+`SELECT test_assert(restaurante_permiso('${tenant}','salon'),'salón'); SELECT test_assert(NOT user_belongs_to_comercio('${tenant}'),'sin gestión'); SELECT test_assert(NOT restaurante_permiso('${tenant}','configuracion'),'sin configuración');`);
  const mesa = sql(`INSERT INTO restaurante_mesas(comercio_id,nombre,capacidad) VALUES('${tenant}','Mesa nueva del personal',2) RETURNING id;`);
  test('Moza consulta clientes del comercio mediante Restaurante sin abrir gestión', actor(empleado)+`SELECT test_assert(jsonb_array_length(restaurante_clientes('${tenant}'))=1,'un cliente propio'); SELECT test_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(restaurante_clientes('${tenant}')) c WHERE c->>'comercio_id' IS NOT NULL),'campos limitados'); SELECT test_assert((SELECT count(*) FROM clientes)=0,'sin lectura general');`+fails(`SELECT restaurante_clientes('${other}');`,'Sin permiso'));
  test('Moza crea mesa sin configuración guardada ni datos opcionales', `BEGIN; RESET ROLE; DELETE FROM restaurante_config WHERE comercio_id='${tenant}';`+actor(empleado)+`SELECT restaurante_operar('${tenant}','pedido',jsonb_build_object('modalidad','mesa','mesa_id','${mesa}','cliente_id','','cliente_nombre','','telefono','','comensales',1,'prometido_at',null),gen_random_uuid());`+check(`EXISTS(SELECT 1 FROM restaurante_pedidos WHERE creado_por='${empleado}' AND cliente_nombre='Consumidor Final' AND telefono='' AND prometido_at IS NULL)`,'mesa con opcionales vacíos')+`ROLLBACK;`);
  test('Moza crea una cuenta de mesa con identidad individual',actor(empleado)+`SELECT restaurante_operar('${tenant}','pedido',jsonb_build_object('modalidad','mesa','mesa_id','${mesa}','cliente_nombre','Mesa de Ana','comensales',2),gen_random_uuid());`+check(`EXISTS(SELECT 1 FROM restaurante_pedidos WHERE comercio_id='${tenant}' AND creado_por='${empleado}')`,'autoría individual'));
  const pedidoMoza = sql(`SELECT id FROM restaurante_pedidos WHERE creado_por='${empleado}' ORDER BY created_at DESC LIMIT 1;`);
  const cartaMoza = sql(`SELECT id FROM restaurante_carta WHERE comercio_id='${tenant}' AND NOT afecta_stock LIMIT 1;`);
  const operarMesa = (accion, extra = {}, usuario = empleado) => {
    const version = Number(sql(`SELECT version FROM restaurante_pedidos WHERE id='${pedidoMoza}';`));
    return actor(usuario)+`SELECT restaurante_operar('${tenant}','${accion}',jsonb_build_object('pedido_id','${pedidoMoza}','version',${version}) || '${JSON.stringify(extra)}'::jsonb,gen_random_uuid());`;
  };
  sql(operarMesa('agregar',{items:[{carta_id:cartaMoza,cantidad:1}]}));
  sql(operarMesa('enviar'));
  // Preparación ya cubierta por las pruebas de cocina; aquí se prueba cierre/rendición.
  sql(`UPDATE restaurante_items SET estado='entregada' WHERE pedido_id='${pedidoMoza}';`);
  sql(operarMesa('solicitar_cuenta'));
  const totalMoza = Number(sql(`SELECT restaurante_total('${pedidoMoza}');`));
  test('Moza registra cobro en su mesa sin acceso administrativo',`BEGIN;`+operarMesa('cobro',{monto:1,medio:'contado'})+check(`EXISTS(SELECT 1 FROM restaurante_cobros WHERE pedido_id='${pedidoMoza}' AND usuario_id='${empleado}' AND recibido_por='${empleado}')`,'moza cobra')+`ROLLBACK;`);
  test('Pago recibido directamente en caja no se atribuye a la moza',`BEGIN;`+operarMesa('cobro',{monto:1,medio:'contado',recibido_por:admin},admin)+check(`EXISTS(SELECT 1 FROM restaurante_cobros c WHERE pedido_id='${pedidoMoza}' AND restaurante_responsable_cobro(c.id)='${admin}')`,'caja cobra')+`ROLLBACK;`);
  test('Receptor de otro comercio rechazado',actor(admin)+fails(operarMesa('cobro',{monto:totalMoza,medio:'contado',recibido_por:'30000000-0000-0000-0000-000000000099'},admin).replace(actor(admin),''),'mismo comercio'));
  sql(operarMesa('cobro',{monto:totalMoza,medio:'contado',recibido_por:empleado},admin));
  const cobroMoza = sql(`SELECT id FROM restaurante_cobros WHERE pedido_id='${pedidoMoza}';`);
  test('Rendición corresponde a la moza aunque administración registró el cobro', actor(admin)+`SELECT test_assert((SELECT c->>'responsable_id' FROM jsonb_array_elements(restaurante_resumen('${tenant}')->'cobros') c WHERE c->>'id'='${cobroMoza}')='${empleado}','responsable');`+check(`SELECT usuario_id='${admin}' FROM restaurante_cobros WHERE id='${cobroMoza}'`,'autoría conservada'));
  test('Cobro anterior sin receptor mantiene responsabilidad de la moza',`BEGIN; RESET ROLE; UPDATE restaurante_cobros SET recibido_por=NULL WHERE id='${cobroMoza}';`+actor(admin)+`SELECT test_assert((SELECT c->>'responsable_id' FROM jsonb_array_elements(restaurante_resumen('${tenant}')->'cobros') c WHERE c->>'id'='${cobroMoza}')='${empleado}','compatibilidad'); ROLLBACK;`);
  const rendirMoza = usuario => `SELECT restaurante_operar('${tenant}','rendir',jsonb_build_object('usuario_id','${usuario}','cobro_ids',jsonb_build_array('${cobroMoza}'),'recibido',${totalMoza}),gen_random_uuid());`;
  test('No recibe rendición de mesa antes de cerrarla en cuentas y cobros',actor(admin)+fails(rendirMoza(empleado),'Cerrá la mesa'));
  sql(operarMesa('cerrar',{tipo_comprobante:'recibo_x'},admin));
  test('El registrador del cobro no puede rendir como responsable de la mesa ajena',actor(admin)+fails(rendirMoza(admin),'ya rendidos'));
  test('Mesa cerrada genera venta y luego admite la rendición de su moza',actor(admin)+rendirMoza(empleado)+check(`SELECT p.cuenta='cerrada' AND p.venta_id IS NOT NULL AND r.usuario_id='${empleado}' AND r.esperado=${totalMoza} FROM restaurante_pedidos p JOIN restaurante_cobros c ON c.pedido_id=p.id JOIN restaurante_rendiciones r ON r.id=c.rendicion_id WHERE p.id='${pedidoMoza}'`,'cierre y rendición'));
  test('Cobro de mesa rendido no se vuelve a rendir',actor(admin)+fails(rendirMoza(empleado),'ya rendidos'));
  test('Cuenta exclusiva no lee productos del comercio aunque exista política permisiva',actor(empleado)+`SELECT test_assert((SELECT count(*) FROM productos WHERE comercio_id='${tenant}')=0,'RLS restrictiva');`);
  test('Empleado no puede listar ni dar de alta usuarios',actor(empleado)+fails(`SELECT restaurante_listar_usuarios('${tenant}');`,'Sin acceso')+fails(guardar(stranger,['mozo']),'Sin acceso'));
  test('Sector de otro comercio rechazado',actor(admin)+fails(guardar(empleado,['barra'],`'${other}'`),'Sector no disponible'));
  test('Cocina no puede combinarse con roles que expongan otros sectores',actor(admin)+fails(guardar(empleado,['barra','mozo'],`'${sector}'`),'un único rol'));
  test('Barra ve solamente sus items y comandas',actor(admin)+guardar(empleado,['barra'],`'${sector}'`)+actor(empleado)+`SELECT test_assert((SELECT count(*) FROM jsonb_array_elements(restaurante_resumen('${tenant}')->'items'))=0,'items del sector'); SELECT test_assert(restaurante_permiso('${tenant}','cocina'),'preparación'); SELECT test_assert(NOT restaurante_permiso('${tenant}','salon'),'sin salón');`);
  test('Barra no accede al selector de clientes',actor(empleado)+fails(`SELECT restaurante_clientes('${tenant}');`,'Sin permiso'));
  test('No se puede modificar el administrador desde roles de personal',actor(admin)+fails(guardar(admin,['mozo']),'administrador conserva'));
  test('Actualización no vincula usuarios de otro comercio',actor(admin)+fails(guardar('30000000-0000-0000-0000-000000000099',['mozo']),'Usuario de otro comercio'));
  test('Desactivar conserva identidad e historial y revoca acceso inmediato',actor(admin)+guardar(empleado,['barra'],`'${sector}'`,false)+actor(empleado)+`SELECT test_assert(NOT restaurante_acceso('${tenant}'),'revocación'); SELECT test_assert((restaurante_mi_acceso('${tenant}')->'permisos')='[]'::jsonb,'sin permisos');`+fails(`SELECT restaurante_resumen('${tenant}');`,'sin permisos'));
  test('Cuentas existentes conservan acceso general',actor(admin)+guardar(driver,['repartidor'])+actor(driver)+`SELECT test_assert(user_belongs_to_comercio('${tenant}'),'compatibilidad'); SELECT test_assert(restaurante_permiso('${tenant}','envios'),'envíos');`);
  test('No se admiten nombres nulos',actor(admin)+fails(`SELECT restaurante_guardar_usuario('${tenant}','${empleado}',NULL,ARRAY['mozo'],NULL,false,true,false);`,'Datos de usuario inválidos'));
}
