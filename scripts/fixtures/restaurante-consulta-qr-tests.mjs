import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export function runConsultaQrTests({ sql, test, actor, call, fails, tenant, other, stranger, migration }) {
  sql(`ALTER TABLE comercio ADD COLUMN nombre_comercio text DEFAULT 'Restaurante de prueba';
    UPDATE comercio_parametrizacion SET parametros='{"modulos":{"restaurante":true}}' WHERE comercio_id IN ('${tenant}','${other}');
    CREATE OR REPLACE FUNCTION public.comercio_acceso_vigente(target_comercio_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.comercio WHERE id=target_comercio_id) $$;`);
  sql(migration('20261013100000_restaurante_consulta_qr.sql'));
  const sector = sql(actor() + call('sector', { nombre: 'Carta QR' }));
  const producto = randomUUID();
  sql(`INSERT INTO productos(id,comercio_id,stock,descripcion,precio_venta,porcentaje_iva) VALUES('${producto}','${tenant}',10,'Producto QR',123.4567,21);`);
  const carta = sql(actor() + call('carta', { producto_id: producto, sector_id: sector, afecta_stock: false }));
  const mesas = [1, 2, 3].map(n => sql(actor() + call('mesa', { nombre: `Mesa QR ${n}`, capacidad: 4 })));
  const qrs = JSON.parse(sql(actor() + `SELECT restaurante_qr_mesas('${tenant}');`));
  const qr = mesa => qrs.find(row => row.mesa_id === mesa).qr_token;
  const publico = (mesa, token = null) => JSON.parse(sql(`RESET ROLE; SET ROLE anon; SELECT restaurante_consulta_publica('${qr(mesa)}',${token ? `'${token}'` : 'NULL'});`));
  const pedido = mesa => sql(actor() + call('pedido', { modalidad: 'mesa', mesa_id: mesa }));
  const op = (id, action, props = {}) => {
    const version = Number(sql(`RESET ROLE; SELECT version FROM restaurante_pedidos WHERE id='${id}';`));
    return sql(actor() + call(action, { pedido_id: id, version, ...props }));
  };
  const acceso = mesa => JSON.parse(sql(actor() + `SELECT restaurante_qr_apertura('${tenant}','${mesa}');`)).apertura_token;
  const registrar = id => { op(id, 'agregar', { items: [{ carta_id: carta, cantidad: 2 }] }); op(id, 'enviar'); };

  test('QR: anónimo sólo ejecuta consulta y no lee tokens ni modifica operaciones', `RESET ROLE; SET ROLE anon;`
    + fails('SELECT * FROM restaurante_mesa_qr;', 'permission denied')
    + fails('SELECT * FROM restaurante_consulta_aperturas;', 'permission denied')
    + fails(`SELECT restaurante_qr_mesas('${tenant}');`, 'permission denied')
    + fails(`SELECT restaurante_qr_apertura('${tenant}','${mesas[0]}');`, 'permission denied')
    + fails(call('pedido', { modalidad: 'mesa', mesa_id: mesas[0] }), 'permission denied'));
  test('QR: personal sin permisos y comercio ajeno no obtienen credenciales', actor(stranger)
    + fails(`SELECT restaurante_qr_mesas('${tenant}');`, 'Sin permiso')
    + fails(`SELECT restaurante_qr_apertura('${tenant}','${mesas[0]}');`, 'Sin permiso')
    + actor() + fails(`SELECT restaurante_qr_mesas('${other}');`, 'Sin permiso')
    + fails(`SELECT restaurante_qr_apertura('${other}','${mesas[0]}');`, 'Sin permiso'));
  assert.equal(publico(mesas[0]).estado_consulta, 'sin_apertura');
  const first = pedido(mesas[0]); const token = acceso(mesas[0]);
  registrar(first);
  test('QR: consulta sin credencial no devuelve consumo', `RESET ROLE; SET ROLE anon; SELECT test_assert(restaurante_consulta_publica('${qr(mesas[0])}')->'consumo'='null'::jsonb,'sin consumo');`);
  let response = publico(mesas[0], token);
  assert.equal(response.estado_consulta, 'vigente'); assert.equal(response.consumo.total, 246.91);
  assert.deepEqual(Object.keys(response.consumo).sort(), ['items', 'total']);
  assert.deepEqual(Object.keys(response.consumo.items[0]).sort(), ['adicionales', 'cantidad', 'descripcion', 'id', 'precio', 'subtotal']);
  test('QR: total redondeado, sólo datos públicos, sin historial ni contactos', `RESET ROLE; SET ROLE anon; SELECT test_assert((restaurante_consulta_publica('${qr(mesas[0])}','${token}')->'consumo'->>'total')::numeric=246.91,'total');`);
  const second = pedido(mesas[1]); const secondToken = acceso(mesas[1]);
  assert.equal(publico(mesas[1], token).consumo, null);
  assert.equal(publico(mesas[0], secondToken).consumo, null);
  assert.equal(publico(mesas[0], randomUUID()).estado_consulta, 'vencida');
  test('QR: credenciales no se reutilizan en otra mesa', `RESET ROLE; SET ROLE anon; SELECT test_assert(restaurante_consulta_publica('${qr(mesas[1])}','${token}')->'consumo'='null'::jsonb,'otra mesa');`);
  op(first, 'agregar', { items: [{ carta_id: carta, cantidad: 1 }] });
  assert.equal(publico(mesas[0], token).consumo.items.length, 1);
  const canceled = sql(`RESET ROLE; SELECT id FROM restaurante_items WHERE pedido_id='${first}' AND estado='pendiente';`);
  op(first, 'cancelar_item', { item_id: canceled, motivo: 'Prueba QR' });
  assert.equal(publico(mesas[0], token).consumo.total, 0);
  test('QR: borradores y productos cancelados no integran consumo', `RESET ROLE; SET ROLE anon; SELECT test_assert(jsonb_array_length(restaurante_consulta_publica('${qr(mesas[0])}','${token}')->'consumo'->'items')=0,'sin borrador ni cancelado');`);
  op(first, 'mover_mesa', { mesa_id: mesas[2] });
  assert.equal(publico(mesas[0], token).consumo, null);
  assert.equal(publico(mesas[2], token).consumo, null);
  const movedToken = acceso(mesas[2]);
  const reopened = pedido(mesas[0]); const freshToken = acceso(mesas[0]); registrar(reopened);
  assert.notEqual(freshToken, token); assert.equal(publico(mesas[0], token).consumo, null);
  test('QR: mover y reabrir no permite seguir la cuenta desde el QR anterior', `RESET ROLE; SET ROLE anon; SELECT test_assert(restaurante_consulta_publica('${qr(mesas[0])}','${token}')->'consumo'='null'::jsonb,'token anterior');`);
  op(first, 'unir', { destino_id: second, destino_version: Number(sql(`RESET ROLE; SELECT version FROM restaurante_pedidos WHERE id='${second}';`)) });
  assert.equal(publico(mesas[2], movedToken).consumo, null);
  assert.equal(publico(mesas[1], secondToken).consumo, null);
  const mergedToken = acceso(mesas[1]); assert.notEqual(mergedToken, secondToken);
  assert.equal(publico(mesas[1], mergedToken).estado_consulta, 'vigente');
  test('QR: unir revoca accesos de ambas cuentas y exige credencial nueva', `RESET ROLE; SET ROLE anon; SELECT test_assert(restaurante_consulta_publica('${qr(mesas[1])}','${secondToken}')->'consumo'='null'::jsonb,'unión privada');`);
  // Cierre por el circuito de negocio existente, con productos servidos y pago completo.
  sql(`RESET ROLE; UPDATE restaurante_items SET estado='entregada' WHERE pedido_id='${reopened}' AND estado='pendiente';`);
  op(reopened, 'solicitar_cuenta'); op(reopened, 'cobro', { monto: 246.91, medio: 'transferencia' });
  op(reopened, 'cerrar', { tipo_comprobante: 'recibo_x' });
  assert.equal(publico(mesas[0], freshToken).consumo, null);
  const next = pedido(mesas[0]); registrar(next); const nextToken = acceso(mesas[0]);
  assert.notEqual(nextToken, freshToken); assert.equal(publico(mesas[0], freshToken).consumo, null);
  assert.equal(publico(mesas[0], nextToken).consumo.total, 246.91);
  test('QR: cierre real invalida sesión y la siguiente apertura tiene otro acceso', `RESET ROLE; SET ROLE anon; SELECT test_assert(restaurante_consulta_publica('${qr(mesas[0])}','${freshToken}')->'consumo'='null'::jsonb,'cerrada y reabierta');`);
  op(next, 'cancelar', { motivo: 'Prueba consulta' }); assert.equal(publico(mesas[0], nextToken).consumo, null);
  test('QR: cancelar revoca consulta sin depender del navegador', `RESET ROLE; SET ROLE anon; SELECT test_assert(restaurante_consulta_publica('${qr(mesas[0])}','${nextToken}')->'consumo'='null'::jsonb,'cancelación');`);
  sql(`RESET ROLE; UPDATE restaurante_carta SET activo=false WHERE id='${carta}';`);
  assert.ok(!publico(mesas[0]).carta.some(item => item.id === carta));
  sql(`RESET ROLE; UPDATE restaurante_carta SET activo=true WHERE id='${carta}'; UPDATE restaurante_sectores SET activo=false WHERE id='${sector}';`);
  assert.ok(!publico(mesas[0]).carta.some(item => item.id === carta));
  test('QR: carta y sectores inactivos se excluyen en el servidor', `RESET ROLE; SET ROLE anon; SELECT test_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(restaurante_consulta_publica('${qr(mesas[0])}')->'carta') c WHERE c->>'id'='${carta}'),'carta activa');`);
  sql(`RESET ROLE; UPDATE restaurante_mesas SET activo=false WHERE id='${mesas[0]}';`);
  test('QR: desactivar mesa invalida incluso la carta pública', `SET ROLE anon;` + fails(`SELECT restaurante_consulta_publica('${qr(mesas[0])}');`, 'QR no disponible'));
  sql(`RESET ROLE; UPDATE comercio_parametrizacion SET parametros='{"modulos":{"restaurante":false}}' WHERE comercio_id='${tenant}';`);
  test('QR: deshabilitar módulo corta todo acceso público', `SET ROLE anon;` + fails(`SELECT restaurante_consulta_publica('${qr(mesas[1])}','${mergedToken}');`, 'QR no disponible'));
}
