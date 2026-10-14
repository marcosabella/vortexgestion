import test from 'node:test';
import assert from 'node:assert/strict';
import { COMERCIO_ID, EMAIL, HASH_INICIAL, baselineRows, compareEntity, compareArchive, validateSnapshot, snapshotQueries, queryFailure, readRestTable, REST_PAGE_SIZE } from './preparar-bostico-incremental.mjs';

import { safePatch, projectTable, validatePlan, accountFingerprint } from './generar-delta-bostico.mjs';

const mapped = (entity = 'ventas', destination = 'destino') => ({ comercio_id: COMERCIO_ID, entidad: entity, id_origen: '10', id_destino: destination });
const source = data => ({ sourceId: '10', data, warnings: [] });
const baseline = datos => ({ source_id: '10', datos });

test('la equivalencia impide reinsertar una venta existente', () => {
  const rows = compareEntity('ventas', [source({ total: 100 })], [baseline({ total: 100 })], [mapped()], [{ id: 'destino', total: 100 }]);
  assert.equal(rows[0].clasificacion, 'sin_cambios');
});

test('el cambio conserva el UUID y el destino actual para revisión', () => {
  const rows = compareEntity('ventas', [source({ total: 120 })], [baseline({ total: 100 })], [mapped()], [{ id: 'destino', total: 110, cae: 'CAE-PROTEGIDO' }]);
  assert.equal(rows[0].clasificacion, 'modificado');
  assert.equal(rows[0].id_destino, 'destino');
  assert.equal(rows[0].revision_destino_pendiente, true);
  assert.equal(rows[0].destino_actual.cae, 'CAE-PROTEGIDO');
});

test('las reparaciones de Recibos X y notas no son cambios nuevos', () => {
  for (const [code, oldType, type] of [['121', 'recibo_c', 'recibo_x'], ['3', 'factura_a', 'nota_credito_a'], ['7', 'factura_b', 'nota_debito_b']]) {
    const rows = compareEntity('ventas', [source({ comprobante_origen: code, tipo_comprobante: type, tipo_movimiento_cuenta: 'credito' })],
      [baseline({ comprobante_origen: code, tipo_comprobante: oldType })], [mapped()], [{ id: 'destino' }]);
    assert.equal(rows[0].clasificacion, 'sin_cambios');
  }
});

test('IVA derivado y CUIT de ceros no se confunden con cambios del origen', () => {
  const sale = compareEntity('ventas', [source({ total: 100, subtotal: 82.64, total_iva: 17.36, ajuste: -1e-11 })],
    [baseline({ total: 100, subtotal: 100, ajuste: 0 })], [mapped()], [{ id: 'destino' }])[0];
  assert.equal(sale.clasificacion, 'sin_cambios');
  const client = compareEntity('clientes', [source({ cuit: '00000000000' })], [baseline({ cuit: '' })], [mapped('clientes')], [{ id: 'destino' }])[0];
  assert.equal(client.clasificacion, 'sin_cambios');
});

test('excepciones archivadas iguales se conservan sin reinsertar', () => {
  const row = compareEntity('pagos', [source({ monto: 0 })], [baseline({ monto: 0 })], [], [], new Set(['10']))[0];
  assert.equal(row.clasificacion, 'sin_cambios');
  assert.equal(row.conservado_en_archivo, true);
});

test('un ID repetido en Access o con dos UUID se bloquea', () => {
  assert.equal(compareEntity('ventas', [source({}), source({})], [], [], [])[0].clasificacion, 'conflictivo');
  assert.equal(compareEntity('ventas', [source({})], [baseline({})], [mapped(), mapped('ventas', 'otro')], [{ id: 'destino' }, { id: 'otro' }])[0].clasificacion, 'conflictivo');
});

test('dos IDs de origen compartiendo UUID no se actualizan como registros independientes', () => {
  const rows = compareEntity('ventas', [source({ total: 100 })], [baseline({ total: 90 })],
    [mapped(), { ...mapped(), id_origen: '11' }], [{ id: 'destino' }]);
  assert.equal(rows.find(r => r.id_origen === '10').clasificacion, 'conflictivo');
  assert.match(rows.find(r => r.id_origen === '10').motivos.join(' '), /mismo destino/);
});

test('diagnóstico diferencia sandbox, conexión y esquema sin revelar contenido del error', () => {
  assert.match(queryFailure({ code: 1 }, 'EPERM: telemetry.json'), /permisos locales/);
  assert.match(queryFailure({ code: 1 }, 'unexpected login role status 544: Connection terminated due to connection timeout'), /timeout de conexión/);
  assert.match(queryFailure({ code: 1 }, 'ERROR: 42P01: relation missing secret-value'), /42P01/);
  assert.doesNotMatch(queryFailure({ code: 1 }, 'ERROR: 42P01: relation missing secret-value'), /secret-value/);
});

test('registro previo sin mapa y destino ausente no se clasifican como nuevos', () => {
  assert.equal(compareEntity('pagos', [source({ monto: 0 })], [baseline({ monto: 0 })], [], [])[0].clasificacion, 'conflictivo');
  assert.equal(compareEntity('ventas', [source({})], [], [mapped()], [])[0].clasificacion, 'conflictivo');
  assert.equal(compareEntity('pagos', [source({ monto: -15 })], [], [], [], new Set(['10']))[0].clasificacion, 'conflictivo');
});

test('eliminaciones en origen se conservan', () => {
  const row = compareEntity('ventas', [], [baseline({ total: 100 })], [mapped()], [{ id: 'destino' }])[0];
  assert.equal(row.clasificacion, 'eliminado_en_origen');
  assert.equal(row.decision, 'conservar');
});

test('compras y pagos a proveedores se comparan como archivo, sin crear deudas operativas', () => {
  const rows = compareArchive('PagosProveedores', [{ sourceId: '10', data: { importe: 20 } }],
    [{ tipo: 'PagosProveedores', source_id: '10', datos: { importe: 10 } }]);
  assert.equal(rows[0].clasificacion, 'modificado');
  assert.equal(rows[0].destino, 'historial_legacy');
  assert.equal(rows[0].cuenta_operativa, false);
  assert.equal(compareArchive('PagosProveedores', [], [{ tipo: 'PagosProveedores', source_id: '10', datos: {} }])[0].decision, 'conservar');
});

test('fechas Access de archivo coinciden con su representación JSON', () => {
  const row = compareArchive('CompraProveedor', [{ sourceId: '1', data: { fecha: new Date('2026-09-22T00:00:00Z') } }],
    [{ tipo: 'CompraProveedor', source_id: '1', datos: { fecha: '2026-09-22T00:00:00.000Z' } }])[0];
  assert.equal(row.clasificacion, 'sin_cambios');
});

test('fechas equivalentes y referencias auxiliares no producen modificaciones', () => {
  const row = compareEntity('productos', [source({ comercio_id: COMERCIO_ID, source_id: '10', fecha: '2026-09-22T03:00:00.000Z', proveedor_referencia: 'Proveedor' })],
    [baseline({ fecha: '2026-09-22T03:00:00+00:00' })], [mapped('productos')], [{ id: 'destino' }])[0];
  assert.equal(row.clasificacion, 'sin_cambios');
});

function validSnapshot() {
  const tables = ['migraciones', 'migracion_id_map', 'migracion_staging_maestros', 'migracion_staging_operaciones', 'historial_legacy',
    'rubros', 'marcas', 'proveedores', 'productos', 'clientes', 'ventas', 'venta_items', 'cuenta_corriente', 'cheques', 'presupuestos', 'presupuesto_items', 'cuenta_corriente_proveedores'];
  const snapshot = { comercio_id: COMERCIO_ID, email: EMAIL, usuario_verificado: true, counts: {}, ...Object.fromEntries(tables.map(t => [t, []])) };
  snapshot.migraciones = ['maestros', 'operaciones', 'cierre'].map(tipo => ({ comercio_id: COMERCIO_ID, estado: 'completado', archivo_hash: HASH_INICIAL, resumen: { tipo } }));
  snapshot.counts = Object.fromEntries(tables.map(t => [t, snapshot[t].length]));
  return snapshot;
}

test('snapshot completo exige identidad, corte original y aislamiento del comercio', () => {
  const snapshot = validSnapshot();
  assert.doesNotThrow(() => validateSnapshot(snapshot));
  assert.throws(() => validateSnapshot({ ...snapshot, email: 'otro@example.com' }));
  assert.throws(() => validateSnapshot({ ...snapshot, usuario_verificado: false }));
  assert.throws(() => validateSnapshot({ ...snapshot, counts: { ...snapshot.counts, productos: 1 } }));
  assert.throws(() => validateSnapshot({ ...snapshot, productos: [{ comercio_id: 'otro' }], counts: { ...snapshot.counts, productos: 1 } }));
  assert.throws(() => validateSnapshot({ ...snapshot, migraciones: snapshot.migraciones.map(m => ({ ...m, archivo_hash: 'otra-base' })) }));
});

test('extracción acotada y SELECT sin instrucciones de mutación', () => {
  const queries = snapshotQueries();
  for (const sql of [queries.metadata, queries.page('ventas', 0), queries.page('productos', 500)]) {
    assert.match(sql, /^SELECT /);
    assert.match(sql, new RegExp(COMERCIO_ID));
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|CALL)\b/i);
  }
  assert.throws(() => queries.page('auth.users', 0));
  assert.throws(() => queries.page('ventas', -1));
});

test('REST recupera más de una página y siempre filtra Bostico', async () => {
  const dataset = Array.from({ length: 501 }, (_, id) => ({ id: String(id), comercio_id: COMERCIO_ID }));
  const paths = [];
  const get = async (path, headers) => {
    paths.push(path);
    assert.match(path, new RegExp(`comercio_id=eq.${COMERCIO_ID}`));
    const offset = Number(new URL('https://example.invalid' + path).searchParams.get('offset'));
    assert.equal(headers.Prefer, offset === 0 ? 'count=exact' : undefined);
    return { data: dataset.slice(offset, offset + REST_PAGE_SIZE), range: `${offset}-${Math.min(offset + REST_PAGE_SIZE - 1, 500)}/${offset === 0 ? '501' : '*'}` };
  };
  assert.equal((await readRestTable(get, 'ventas')).length, 501);
  assert.equal(paths.length, Math.ceil(501 / REST_PAGE_SIZE));
});

test('REST rechaza truncamiento, filas ajenas, IDs duplicados y tablas no previstas', async () => {
  await assert.rejects(readRestTable(async () => ({ data: [], range: '*/1' }), 'ventas'), /vacía/);
  await assert.rejects(readRestTable(async () => ({ data: [{ id: 'x', comercio_id: 'otro' }], range: '0-0/1' }), 'ventas'), /fuera de comercio/);
  await assert.rejects(readRestTable(async () => ({ data: [{ id: 'x', comercio_id: COMERCIO_ID }, { id: 'x', comercio_id: COMERCIO_ID }], range: '0-1/2' }), 'ventas'), /duplicados/);
  await assert.rejects(readRestTable(async () => { throw new Error('No debe llamarse'); }, 'auth.users'), /no autorizada/);
});


test('cambios del cliente posteriores a la importación se bloquean sin sobrescribir', () => {
  assert.deepEqual(safePatch({ stock: 100 }, { stock: 102 }, { stock: 103 }), { patch: {}, conflicts: ['stock'] });
  assert.deepEqual(safePatch({ stock: 100 }, { stock: 102 }, { stock: 100 }), { patch: { stock: 102 }, conflicts: [] });
  assert.deepEqual(safePatch({ stock: 100 }, { stock: 102 }, { stock: 102 }), { patch: {}, conflicts: [] });
});

test('la siguiente comparación usa sólo deltas completados y mantiene duplicados de staging visibles', () => {
  const s = validSnapshot();
  s.migracion_staging_maestros = [1, 2].map(() => ({ migracion_id: 'original', modulo: 'productos', source_id: '10', datos: { stock: 100 } }));
  s.migraciones.push({ id: 'original', estado: 'completado', archivo_hash: HASH_INICIAL }, { id: 'delta', estado: 'completado' }, { id: 'revertido', estado: 'cancelado' });
  assert.equal(baselineRows(s).length, 2);
  s.historial_legacy = [
    { migracion_id: 'delta', tipo: 'BosticoIncrementalFuente', datos: { entidad: 'productos', source_id: '10', data: { stock: 102 } }, created_at: '2026-10-14' },
    { migracion_id: 'revertido', tipo: 'BosticoIncrementalFuente', datos: { entidad: 'productos', source_id: '10', data: { stock: 0 } }, created_at: '2026-10-15' }
  ];
  assert.deepEqual(baselineRows(s).map(r => r.datos.stock), [102]);
});

test('la proyección conserva filas ajenas al delta y los UUID de filas modificadas', () => {
  const rows = projectTable({ productos: [{ id: 'viejo', stock: 100 }, { id: 'nativo', stock: 7 }] },
    { operations: [{ table: 'productos', id: 'viejo', patch: { stock: 102 } }, { table: 'productos', id: 'nuevo', patch: { stock: 4 } }] }, 'productos');
  assert.equal(rows.find(r => r.id === 'nativo').stock, 7);
  assert.equal(rows.find(r => r.id === 'viejo').stock, 102);
  assert.equal(rows.length, 3);
});

test('la firma de cuenta detecta cambios de monto aunque el conteo sea igual', () => {
  const row = { id: 'a', cliente_id: 'cliente', tipo_movimiento: 'debito', monto: 67000.01 };
  assert.notEqual(accountFingerprint([row]), accountFingerprint([{ ...row, monto: 138000.02 }]));
});

test('no se emite un plan de otro comercio, con borrados o con CAE existente', () => {
  const plan = { comercio_id: COMERCIO_ID, email: EMAIL, source_hash: '0616560fc2f7e4625a691b1f830cc0da8ddfe75c97a3ac0c7ea28485d122dc63', operations: [] };
  assert.throws(() => validatePlan({ ...plan, comercio_id: 'otro' }, { columns: [] }));
  const op = { table: 'ventas', id: '11111111-1111-4111-8111-111111111111', action: 'delete', patch: {} };
  assert.throws(() => validatePlan({ ...plan, operations: [op] }, { columns: [] }));
  assert.throws(() => validatePlan({ ...plan, operations: [{ ...op, action: 'update', before: { id: op.id, comercio_id: COMERCIO_ID, cae: '12345678901234' } }] }, { columns: [] }));
});
