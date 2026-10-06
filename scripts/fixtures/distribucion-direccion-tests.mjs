import { randomUUID } from 'node:crypto';

export function probarDireccion({ sql, test, actor, call, check, tenant, other, driver, migration }) {
  sql(`ALTER TABLE clientes ADD COLUMN calle text,ADD COLUMN numero text,ADD COLUMN localidad text;`);
  sql(migration('20261007140000_distribucion_direccion_cliente.sql'));
  const cliente = randomUUID(), producto = randomUUID();
  sql(`INSERT INTO clientes(id,comercio_id,nombre,apellido,calle,numero,localidad) VALUES('${cliente}','${tenant}','Direccion','Prueba','Calle Uno','123','Jovita'); INSERT INTO productos(id,comercio_id,stock) VALUES('${producto}','${tenant}',10);`);
  const crear = direccion => sql(actor() + call('pedido', { cliente_id: cliente, direccion, items: [{ producto_id: producto, cantidad: 1 }] }));
  const pendiente = crear('Calle Uno 123 Jovita'), alternativo = crear('Deposito alternativo'), papel = crear('Calle Uno 123 Jovita');
  const reparto = sql(actor() + call('reparto', { nombre: 'Direcciones', fecha: '2026-10-09', repartidor_id: driver }));
  const impreso = sql(actor() + call('reparto', { nombre: 'Papel conservado', fecha: '2026-10-09', repartidor_id: driver }));
  for (const p of [pendiente, papel]) sql(actor() + call('preparar', { pedido_id: p }) + call('listo', { pedido_id: p }));
  sql(actor() + call('asignar', { reparto_id: reparto, pedido_id: pendiente }) + call('asignar', { reparto_id: impreso, pedido_id: papel }) + call('emitir_remitos', { reparto_id: impreso }));
  sql(`UPDATE distribucion_paradas SET latitud=-34,longitud=-63,direccion_mapa='Calle Uno 123 Jovita' WHERE pedido_id='${pendiente}';`);
  test('Pedido identifica direccion del cliente y respeta entrega alternativa', check(`SELECT direccion_cliente FROM distribucion_pedidos WHERE id='${pendiente}'`, 'fuente cliente') + check(`SELECT NOT direccion_cliente FROM distribucion_pedidos WHERE id='${alternativo}'`, 'alternativa'));
  sql(actor() + `RESET ROLE; UPDATE clientes SET calle='Calle Dos',numero='456' WHERE id='${cliente}' AND comercio_id='${tenant}';`);
  test('Cambiar cliente actualiza pedido planificado y borra coordenadas anteriores', check(`SELECT direccion='Calle Dos 456 Jovita' AND version=4 FROM distribucion_pedidos WHERE id='${pendiente}'`, 'direccion actual') + check(`SELECT latitud IS NULL AND longitud IS NULL AND direccion_mapa='' FROM distribucion_paradas WHERE pedido_id='${pendiente}'`, 'mapa invalidado'));
  test('Cambiar cliente conserva direccion alternativa y remito impreso', check(`SELECT direccion='Deposito alternativo' FROM distribucion_pedidos WHERE id='${alternativo}'`, 'otra entrega') + check(`SELECT direccion='Calle Uno 123 Jovita' FROM distribucion_pedidos WHERE id='${papel}'`, 'pedido impreso') + check(`SELECT direccion='Calle Uno 123 Jovita' FROM distribucion_remitos WHERE reparto_id='${impreso}'`, 'remito original'));
  test('Direccion no cambia cantidades ni stock y conserva auditoria', check(`SELECT stock=10 FROM productos WHERE id='${producto}'`, 'stock') + check(`SELECT cantidad=1 FROM distribucion_pedido_items WHERE pedido_id='${pendiente}'`, 'cantidades') + check(`SELECT count(*)=1 FROM distribucion_eventos WHERE tipo='actualizar_direccion_cliente' AND datos->>'pedido_id'='${pendiente}'`, 'auditoria'));
  const ajeno = randomUUID();
  sql(`INSERT INTO clientes(id,comercio_id,nombre,calle,numero,localidad) VALUES('${ajeno}','${other}','Ajeno','Ajena','1','Otra'); UPDATE clientes SET calle='Ajena modificada' WHERE id='${ajeno}';`);
  test('Cambio de direccion ajena no afecta pedidos del comercio', check(`SELECT direccion='Calle Dos 456 Jovita' FROM distribucion_pedidos WHERE id='${pendiente}'`, 'tenant'));
  sql(actor() + call('emitir_remitos', { reparto_id: reparto }) + call('confirmar_papeles', { reparto_id: reparto }) + call('despachar', { reparto_id: reparto }));
  sql(`UPDATE clientes SET calle='Calle Tres',numero='789' WHERE id='${cliente}';`);
  test('Reparto despachado conserva su direccion de entrega', check(`SELECT direccion='Calle Dos 456 Jovita' FROM distribucion_pedidos WHERE id='${pendiente}'`, 'entrega en curso') + check(`SELECT direccion='Calle Dos 456 Jovita' FROM distribucion_remitos WHERE reparto_id='${reparto}'`, 'papel en reparto'));
}
