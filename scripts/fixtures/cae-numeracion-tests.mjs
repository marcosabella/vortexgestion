import assert from 'node:assert/strict';

// Se ejecuta sobre el PostgreSQL temporal del test multi-CUIT, con triggers e indices reales.
export function testCaeNumeracion({ sql, migration, tenant, foreignTenant, emisor, otroEmisor }) {
  const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
  const a = '70000000-0000-0000-0000-000000000001';
  const b = '70000000-0000-0000-0000-000000000002';
  const c = '70000000-0000-0000-0000-000000000003';
  sql('DROP TABLE afip_cae_intentos;');
  const cache = migration('20261005140000_cache_wsaa_y_registro_intentos_cae.sql');
  sql(cache.slice(cache.indexOf('CREATE TABLE public.afip_cae_intentos'), cache.indexOf('-- La reserva se mantiene')));
  sql(migration('20261027130000_cae_numeracion_atomica.sql'));
  sql('CREATE TABLE caja_movimientos(id uuid PRIMARY KEY,venta_id uuid);');
  sql(migration('20260609120000_protect_ventas_with_cae.sql'));
  const makeSale = (id, issuer, number) => `INSERT INTO ventas(id,comercio_id,emisor_fiscal_id,tipo_comprobante,numero_comprobante,punto_venta,numero_secuencial,fecha_venta,total,subtotal,total_iva)
    VALUES('${id}','${tenant}','${issuer}','factura_c','0001-${String(number).padStart(8,'0')}',1,${number},'2026-10-27T12:00:00Z',102000,102000,0);`;
  sql(makeSale(a,emisor,4) + makeSale(b,emisor,5) + makeSale(c,otroEmisor,5));
  const solicitud = number => ({ FeCabReq: { PtoVta: 1, CbteTipo: 11 },
    FeDetReq: { FECAEDetRequest: { ImpTotal: 102000, CbteFch: '20261027', CbteDesde: number, CbteHasta: number } } });
  const intento = (id=a, number=5) => ({ venta_id:id,comercio_id:tenant,cuit_emisor:'20111111112',ambiente:'homologacion',
    punto_venta:1,tipo_comprobante:11,numero_secuencial:number,solicitud:solicitud(number) });
  const reserve = value => `SELECT afip_reservar_cae(${quote(value)});`;
  const asService = 'SET ROLE service_role;';
  const fails = (statement, error) => sql(`SELECT test_expect_error($stmt$${statement}$stmt$,'${error}');`);
  const number = id => sql(`SELECT numero_secuencial FROM ventas WHERE id='${id}';`).trim();
  fails('SET ROLE authenticated;' + reserve(intento()), 'permission denied');
  fails('SET ROLE anon;' + reserve(intento()), 'permission denied');
  fails(asService + reserve({...intento(),comercio_id:foreignTenant}), 'afip_intento_venta_comercio_invalido');
  fails(asService + reserve({...intento(),cuit_emisor:'20999999999'}), 'cae_emisor_no_coincide');
  assert.equal(sql('SELECT count(*) FROM afip_cae_intentos;').trim(),'0');
  sql(asService + reserve(intento()));
  assert.equal(number(a),'5');
  assert.equal(number(b),'6');
  assert.equal(number(c),'5','Otro emisor conserva su numeracion');
  assert.equal(sql(`SELECT ultimo_numero FROM ventas_numeradores_emisores WHERE comercio_id='${tenant}' AND emisor_fiscal_id='${emisor}' AND tipo_comprobante='factura_c';`).trim(),'6');
  fails(asService + reserve(intento()),'duplicate key');
  sql(`UPDATE afip_cae_intentos SET cae='86439607672572',cae_vencimiento='2026-11-06' WHERE venta_id='${a}';`);
  sql(asService + `SELECT afip_guardar_cae('${a}','${tenant}');`);
  assert.equal(sql(`SELECT cae||':'||cae_vencimiento FROM ventas WHERE id='${a}';`).trim(),'86439607672572:2026-11-06');
  console.log('OK CAE: reserva atomica, renumeracion solo de venta sin intento, otro emisor intacto, permisos y recuperacion');

  // El numero fiscal ocupado nunca se desplaza: toda la reserva se revierte.
  fails(asService + reserve(intento(b,5)), 'duplicate key');
  assert.equal(number(b),'6');
  assert.equal(sql(`SELECT count(*) FROM afip_cae_intentos WHERE venta_id='${b}';`).trim(),'0');
  const d='70000000-0000-0000-0000-000000000004';
  sql(makeSale(d,emisor,7));
  sql(asService + reserve(intento(d,7)));
  fails(asService + reserve(intento(b,7)), 'duplicate key');
  assert.equal(number(d),'7');
  assert.equal(sql(`SELECT count(*) FROM afip_cae_intentos WHERE venta_id='${b}';`).trim(),'0');

  // Recupera tambien un CAE viejo conservado antes de esta correccion.
  const saved = intento(b,8);
  sql(`INSERT INTO afip_cae_intentos(venta_id,comercio_id,ambiente,cuit_emisor,punto_venta,tipo_comprobante,numero_secuencial,solicitud,cae,cae_vencimiento)
    VALUES('${b}','${tenant}','homologacion','20111111112',1,11,8,${quote(saved.solicitud)},'86439238516050','2026-11-03');`);
  const e='70000000-0000-0000-0000-000000000005';
  sql(makeSale(e,emisor,8));
  sql(asService + `SELECT afip_guardar_cae('${b}','${tenant}');`);
  assert.equal(number(b),'8');
  assert.equal(number(e),'9');
  assert.equal(sql(`SELECT cae FROM ventas WHERE id='${b}';`).trim(),'86439238516050');
  sql(`UPDATE afip_cae_intentos SET rechazado=true WHERE venta_id='${d}';
    UPDATE ventas SET numero_comprobante='0001-00000010',numero_secuencial=10 WHERE id='${d}';`);
  sql(asService + reserve(intento(e,10)));
  assert.equal(number(e),'10');
  assert.equal(number(d),'11');
  assert.equal(sql(`SELECT rechazado FROM afip_cae_intentos WHERE venta_id='${d}';`).trim(),'t');
  console.log('OK CAE: colisiones con CAE/intento bloqueadas antes de emitir y recuperacion historica sin duplicar autorizaciones');
}
