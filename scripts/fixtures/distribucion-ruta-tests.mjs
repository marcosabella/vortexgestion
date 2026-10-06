import { randomUUID } from 'node:crypto';

export function probarRuta({ sql, test, actor, call, fails, check, tenant, other, client, driver, migration }) {
  sql(migration('20261007130000_distribucion_hoja_ruta.sql'));
  const producto = randomUUID();
  sql(`INSERT INTO productos(id,comercio_id,stock) VALUES('${producto}','${tenant}',10);`);
  const pedidos = [1, 2].map(n => sql(actor() + call('pedido', { cliente_id: client, direccion: `Calle ${n} Jovita`, items: [{ producto_id: producto, cantidad: 1 }] })));
  const ruta = sql(actor() + call('reparto', { nombre: 'Ruta ordenada', fecha: '2026-10-09', repartidor_id: driver }));
  const rutaAjena = sql(actor() + call('reparto', { nombre: 'Otra ruta', fecha: '2026-10-09', repartidor_id: driver }));
  for (const pedido of pedidos) sql(actor() + call('preparar', { pedido_id: pedido }) + call('listo', { pedido_id: pedido }) + call('asignar', { reparto_id: ruta, pedido_id: pedido }));
  const paradas = pedidos.map(id => sql(`SELECT id FROM distribucion_paradas WHERE pedido_id='${id}';`));
  const datos = { origen: 'Deposito Jovita', latitud: -34.52, longitud: -63.94, regreso: true, paradas: [
    { id: paradas[1], latitud: -34.53, longitud: -63.95 }, { id: paradas[0], latitud: -34.54, longitud: -63.96 },
  ] };
  const version = () => Number(sql(`SELECT ruta_version FROM distribucion_repartos WHERE id='${ruta}';`));
  const guardar = (data = datos, v = version(), key = randomUUID(), comercio = tenant, route = ruta) => `SELECT distribucion_guardar_ruta('${comercio}','${route}',${v},'${JSON.stringify(data)}','${key}');`;
  test('Ruta exige administracion y tenant', actor(driver) + fails(guardar(), 'administracion') + actor() + fails(guardar(datos, version(), randomUUID(), other), 'administracion'));
  test('Ruta exige todas las paradas sin duplicarlas', actor() + fails(guardar({ ...datos, paradas: datos.paradas.slice(0, 1) }), 'todas las paradas') + fails(guardar({ ...datos, paradas: [datos.paradas[0], datos.paradas[0]] }), 'una sola vez'));
  test('Ruta rechaza paradas ajenas y revierte el origen', actor() + fails(guardar(datos, Number(sql(`SELECT ruta_version FROM distribucion_repartos WHERE id='${rutaAjena}';`)), randomUUID(), tenant, rutaAjena), 'Inclui todas') + fails(guardar({ ...datos, paradas: [{ ...datos.paradas[0], id: randomUUID() }, datos.paradas[1]] }), 'Parada ajena') + check(`SELECT ruta_origen='' FROM distribucion_repartos WHERE id='${ruta}'`, 'origen revertido'));
  test('Ruta rechaza coordenadas invalidas o incompletas', actor() + fails(guardar({ ...datos, latitud: 91 }), 'origen invalidas') + fails(guardar({ ...datos, paradas: [{ ...datos.paradas[0], longitud: null }, datos.paradas[1]] }), 'parada invalidas'));
  const v = version(), key = randomUUID();
  sql(actor() + guardar(datos, v, key) + guardar(datos, v, key));
  test('Ruta guarda orden, ubicaciones y origen sin tocar stock', check(`SELECT orden=1 AND direccion_mapa='Calle 2 Jovita' AND latitud=-34.53 FROM distribucion_paradas WHERE id='${paradas[1]}'`, 'primer cliente') + check(`SELECT orden=2 FROM distribucion_paradas WHERE id='${paradas[0]}'`, 'segundo cliente') + check(`SELECT ruta_origen='Deposito Jovita' AND ruta_regreso FROM distribucion_repartos WHERE id='${ruta}'`, 'salida y regreso') + check(`SELECT stock=10 FROM productos WHERE id='${producto}'`, 'stock intacto') + check(`SELECT count(*)=1 FROM distribucion_eventos WHERE reparto_id='${ruta}' AND tipo='guardar_ruta'`, 'idempotente'));
  test('Ruta rechaza version desactualizada y reutilizacion alterada', actor() + fails(guardar(datos, v), 'reparto cambio') + fails(guardar({ ...datos, regreso: false }, v, key), 'otros datos'));
  test('Repartidor consulta el orden y ubicaciones guardados', actor(driver) + check(`SELECT (value->>'orden')::int=1 AND value->>'direccion_mapa'='Calle 2 Jovita' FROM jsonb_array_elements(distribucion_resumen('${tenant}')->'paradas') WHERE value->>'id'='${paradas[1]}'`, 'ruta visible'));
  sql(actor() + call('emitir_remitos', { reparto_id: ruta }) + call('confirmar_papeles', { reparto_id: ruta }));
  sql(actor() + guardar({ ...datos, paradas: datos.paradas.map(p => ({ id: p.id, latitud: null, longitud: null })) }));
  test('Ruta admite orden manual sin coordenadas y conserva remitos', check(`SELECT count(*)=2 FROM distribucion_paradas WHERE reparto_id='${ruta}' AND latitud IS NULL AND direccion_mapa=''`, 'manual') + check(`SELECT count(*)=2 FROM distribucion_remitos WHERE reparto_id='${ruta}'`, 'papeles conservados'));
  sql(actor() + call('despachar', { reparto_id: ruta }));
  test('Ruta no se cambia despues de despachar', actor() + fails(guardar(), 'antes de despachar') + check(`SELECT stock=10 FROM productos WHERE id='${producto}'`, 'sin descuento de ruta'));
}
