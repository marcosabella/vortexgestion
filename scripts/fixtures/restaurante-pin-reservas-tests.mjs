import { randomUUID } from 'node:crypto';

export function runPinReservasTests({ sql, test, actor, check, fails, tenant, other, admin, driver, migration, json }) {
  sql(`CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO service_role;`);
  sql(migration('20261008190000_restaurante_reservas.sql'));
  sql(migration('20261008200000_restaurante_pin.sql'));
  const empleado = '30000000-0000-0000-0000-000000000010';
  sql(actor(admin) + `SELECT restaurante_guardar_usuario('${tenant}','${empleado}','Ana',ARRAY['mozo'],NULL,false,true,false);`);
  const hash = 'a'.repeat(64), salt = 'b'.repeat(64), token = 'c'.repeat(64);
  const guardar = (user = empleado, commerce = tenant) => `SELECT restaurante_pin_guardar('${commerce}','${user}','${hash}','${salt}');`;
  test('Empleado no asigna PIN ni habilita terminal', actor(empleado) + fails(guardar(), 'Sin acceso') + fails(`SELECT restaurante_terminal_crear('${tenant}','Salón','${token}');`, 'Sin acceso'));
  test('PIN rechaza cuenta con acceso general y comercio ajeno', actor(admin) + fails(guardar(driver), 'exclusivos') + fails(guardar(empleado, other), 'Sin acceso'));
  test('Administrador asigna PIN sin exponer hashes al operador', actor(admin) + guardar() + actor(empleado) + fails('SELECT * FROM restaurante_pines;', 'permission denied') + fails(`SELECT restaurante_terminal_info('${token}');`, 'permission denied') + fails(`SELECT restaurante_pin_verificar('${token}','${empleado}','${hash}');`, 'permission denied'));
  const terminal = sql(actor(admin) + `SELECT restaurante_terminal_crear('${tenant}','Salón','${token}');`);
  test('Administrador consulta terminales sin sus secretos', actor(admin) + `SELECT test_assert((restaurante_terminales_listar('${tenant}')->'usuarios') ? '${empleado}','PIN asignado'); SELECT test_assert(NOT ((restaurante_terminales_listar('${tenant}')->'terminales'->0) ? 'token_hash'),'sin secreto');`);
  const service = 'RESET ROLE; SET ROLE service_role;';
  const verificar = (candidate = hash) => `SELECT restaurante_pin_verificar('${token}','${empleado}','${candidate}')`;
  test('Terminal autorizada lista nombres sin PIN ni email', service + `SELECT test_assert(jsonb_array_length(restaurante_terminal_info('${token}')->'usuarios')=1,'un empleado'); SELECT test_assert(NOT (restaurante_terminal_info('${token}')->'usuarios'->0 ? 'email'),'sin email');`);
  test('PIN correcto conserva identidad individual', service + `SELECT test_assert((${verificar()}->>'usuario_id')='${empleado}','identidad');` + check(`EXISTS(SELECT 1 FROM restaurante_eventos WHERE accion='ingreso_pin' AND usuario_id='${empleado}')`, 'auditoría'));
  test('Cinco PIN incorrectos bloquean también el PIN correcto', service + Array.from({ length: 5 }, () => `SELECT test_assert((${verificar('d'.repeat(64))}) IS NULL,'PIN rechazado');`).join('') + `SELECT test_assert((${verificar()}) IS NULL,'bloqueo');`);
  sql(`UPDATE restaurante_pines SET ventana=now()-interval '16 minutes' WHERE usuario_id='${empleado}'; UPDATE restaurante_terminales SET ventana=now()-interval '16 minutes';`);
  test('PIN vuelve a permitir ingreso al terminar el bloqueo', service + `SELECT test_assert((${verificar()}) IS NOT NULL,'desbloqueo');`);
  test('Otra membresía impide usar PIN en cuenta compartida entre empresas', `BEGIN; INSERT INTO comercio_usuarios(comercio_id,user_id,rol,activo) VALUES('${other}','${empleado}','operador',true);` + service + `SELECT test_assert((${verificar()}) IS NULL,'otra empresa'); ROLLBACK;`);
  test('Desactivar empleado impide nuevos ingresos por PIN', `BEGIN; UPDATE restaurante_permisos SET activo=false WHERE usuario_id='${empleado}';` + service + `SELECT test_assert((${verificar()}) IS NULL,'desactivado'); ROLLBACK;`);
  test('Terminal vencida rechaza listado e ingreso', `BEGIN; UPDATE restaurante_terminales SET vence_at=now()-interval '1 second';` + service + `SELECT test_assert(restaurante_terminal_info('${token}') IS NULL,'vencida'); SELECT test_assert((${verificar()}) IS NULL,'sin ingreso'); ROLLBACK;`);
  test('Revocar terminal impide nuevos ingresos', actor(admin) + `SELECT restaurante_terminal_revocar('${tenant}','${terminal}');` + service + `SELECT test_assert(restaurante_terminal_info('${token}') IS NULL,'revocada'); SELECT test_assert((${verificar()}) IS NULL,'sin ingreso');`);
  test('Deshabilitar PIN elimina credencial', actor(admin) + `SELECT restaurante_pin_guardar('${tenant}','${empleado}',NULL,NULL);` + check(`NOT EXISTS(SELECT 1 FROM restaurante_pines WHERE usuario_id='${empleado}')`, 'PIN eliminado'));

  const mesa = sql(`INSERT INTO restaurante_mesas(comercio_id,nombre,capacidad) VALUES('${tenant}','Reservas',4) RETURNING id;`);
  const ajena = sql(`INSERT INTO restaurante_mesas(comercio_id,nombre,capacidad) VALUES('${other}','Ajena',4) RETURNING id;`);
  const reserva = { mesa_id: mesa, nombre: 'Reserva Ana', comensales: 2, inicio: sql("SELECT now()+interval '1 day';"), fin: sql("SELECT now()+interval '1 day 2 hours';"), telefono: '123', observaciones: '' };
  const operar = (action, data, key = randomUUID()) => `SELECT restaurante_reserva_operar('${tenant}','${action}',${json(data)},'${key}');`;
  test('Reservas rechazan mesa de otra empresa y exceso de comensales', actor(empleado) + fails(operar('reserva_guardar', { ...reserva, mesa_id: ajena }), 'Mesa no disponible') + fails(operar('reserva_guardar', { ...reserva, comensales: 5 }), 'capacidad'));
  const key = randomUUID();
  const id = sql(actor(empleado) + operar('reserva_guardar', reserva, key));
  test('Reintento de reserva no duplica registros', actor(empleado) + operar('reserva_guardar', reserva, key) + check(`(SELECT count(*) FROM restaurante_reservas WHERE mesa_id='${mesa}')=1`, 'idempotencia'));
  test('Reservas superpuestas son rechazadas', actor(empleado) + fails(operar('reserva_guardar', reserva), 'ya tiene una reserva'));
  test('Agenda de otro comercio está protegida', actor(empleado) + fails(`SELECT restaurante_reservas_listar('${other}',now(),now()+interval '2 days');`, 'Sin permiso'));
  test('Reserva con versión antigua no puede editarse', actor(empleado) + fails(operar('reserva_guardar', { ...reserva, id, version: 0 }), 'La reserva cambió'));
  test('No se marca ausencia antes del horario', actor(empleado) + fails(operar('reserva_ausente', { id, version: 1, motivo: 'No vino' }), 'Todavía no llegó'));
  const pedido = sql(actor(empleado) + operar('reserva_recibir', { id, version: 1 }));
  test('Recibir cliente vincula reserva y cuenta con autoría individual', check(`EXISTS(SELECT 1 FROM restaurante_reservas r JOIN restaurante_pedidos p ON p.id=r.pedido_id WHERE r.id='${id}' AND r.estado='atendida' AND p.id='${pedido}' AND p.creado_por='${empleado}')`, 'cuenta abierta'));
  test('Reserva atendida no vuelve a abrir cuenta', actor(empleado) + fails(operar('reserva_recibir', { id, version: 2 }), 'ya está finalizada'));
  const siguiente = sql(actor(empleado) + operar('reserva_guardar', reserva));
  test('Mesa ocupada no admite recepción y conserva la reserva', actor(empleado) + fails(operar('reserva_recibir', { id: siguiente, version: 1 }), 'ocupada') + check(`EXISTS(SELECT 1 FROM restaurante_reservas WHERE id='${siguiente}' AND estado='confirmada' AND pedido_id IS NULL)`, 'recepción atómica'));
  test('Cancelar reserva libera horario conservando motivo', actor(empleado) + operar('reserva_cancelar', { id: siguiente, version: 1, motivo: 'Cambio de planes' }) + check(`EXISTS(SELECT 1 FROM restaurante_reservas WHERE id='${siguiente}' AND estado='cancelada' AND motivo='Cambio de planes')`, 'cancelación'));
}
