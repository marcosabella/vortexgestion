import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COMERCIO_ID, EMAIL, HASH_INICIAL, validateSnapshot, baselineRows } from './preparar-bostico-incremental.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = resolve(ROOT, 'private-backups/bostico-incremental-20261013');
const SOURCE_HASH = '0616560fc2f7e4625a691b1f830cc0da8ddfe75c97a3ac0c7ea28485d122dc63';
const TABLES = ['rubros', 'marcas', 'proveedores', 'clientes', 'productos', 'ventas', 'venta_items', 'cuenta_corriente', 'cheques', 'historial_legacy', 'migracion_id_map'];
const hash = text => createHash('sha256').update(text).digest('hex');
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return value;
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const cents = value => Math.round(Number(value) * 100);
const round = value => cents(value) / 100;
const string = value => value == null ? '' : String(value).trim();
const cleanCuit = value => /^[_0\s-]*$/.test(string(value)) ? '' : string(value);
const uuid = seed => {
  const h = hash(seed).slice(0, 32).split(''); h[12] = '5'; h[16] = '8';
  const s = h.join(''); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
const key = (entity, source) => `${entity}:${source}`;

export function safePatch(before, desired, current) {
  const patch = {};
  const conflicts = [];
  for (const field of Object.keys(desired)) {
    if (same(before[field], desired[field])) continue;
    if (same(current[field], desired[field])) continue;
    if (!same(current[field], before[field])) conflicts.push(field);
    else patch[field] = desired[field];
  }
  return { patch, conflicts };
}

export function validatePlan(plan, catalog) {
  if (plan.comercio_id !== COMERCIO_ID || plan.email !== EMAIL || plan.source_hash !== SOURCE_HASH) throw new Error('Delta fuera del comercio/base autorizados');
  const rows = new Set();
  const insertMaps = new Set();
  for (const operation of plan.operations) {
    if (!TABLES.includes(operation.table) || !['insert', 'update'].includes(operation.action)) throw new Error('Operación no admitida');
    if (!/^[0-9a-f-]{36}$/.test(operation.id)) throw new Error('UUID inválido');
    const rowKey = `${operation.table}:${operation.id}`;
    if (rows.has(rowKey)) throw new Error('Fila repetida en el delta');
    rows.add(rowKey);
    if (operation.before && (operation.before.id !== operation.id || operation.before.comercio_id !== COMERCIO_ID)) throw new Error('Imagen anterior fuera de comercio');
    if (operation.action === 'update' && !operation.before) throw new Error('Actualización sin imagen anterior');
    const columns = catalog.columns.filter(c => c.table === operation.table);
    for (const field of Object.keys(operation.patch)) {
      const column = columns.find(c => c.name === field);
      if (!column || column.generated !== 'NEVER' || ['id', 'comercio_id', 'created_at', 'updated_at'].includes(field)) throw new Error(`Campo no editable: ${operation.table}.${field}`);
    }
    if (operation.action === 'insert') for (const c of columns.filter(c => c.nullable === 'NO' && !c.default && c.generated === 'NEVER' && c.identity === 'NO' && !['id', 'comercio_id'].includes(c.name))) {
      if (operation.patch[c.name] == null) throw new Error(`Campo obligatorio ausente: ${operation.table}.${c.name}`);
    }
    if (operation.action === 'insert' && operation.table === 'migracion_id_map') {
      const sourceKey = key(operation.patch.entidad, operation.patch.id_origen);
      if (insertMaps.has(sourceKey)) throw new Error('Equivalencia de origen repetida');
      insertMaps.add(sourceKey);
    }
    if (operation.table === 'ventas' && operation.before?.cae) throw new Error('No se modifican ventas existentes con CAE');
  }
}

export function buildPlan(snapshot, proposals, comparison, catalog, { updateSale7210 = true } = {}) {
  validateSnapshot(snapshot);
  if (proposals.source_hash !== SOURCE_HASH || proposals.comercio_id !== COMERCIO_ID || proposals.email !== EMAIL) throw new Error('Propuestas fuera de la base/comercio autorizados');
  const batchId = uuid(`bostico:${SOURCE_HASH}:incremental:${updateSale7210 ? 'actualizar' : 'conservar'}7210:v1`);
  const operations = [];
  const pending = [];
  const preserved = [];
  const sources = [];
  const map = new Map();
  const destinations = new Map(TABLES.filter(t => snapshot[t]).map(t => [t, new Map(snapshot[t].map(r => [r.id, r]))]));
  for (const row of snapshot.migracion_id_map) {
    const sourceKey = key(row.entidad, row.id_origen);
    if (map.has(sourceKey) && map.get(sourceKey) !== row.id_destino) throw new Error(`Equivalencia ambigua: ${sourceKey}`);
    map.set(sourceKey, row.id_destino);
  }
  for (const entity of ['rubros', 'marcas', 'proveedores', 'clientes', 'productos', 'ventas', 'items', 'pagos', 'cheques']) {
    for (const row of comparison[entity]) if (row.clasificacion === 'nuevo') map.set(key(entity, row.id_origen), uuid(`${batchId}:${entity}:${row.id_origen}`));
  }
  const reference = (entity, source) => {
    if (source == null || string(source) === '') return null;
    const id = map.get(key(entity, string(source)));
    if (!id) throw new Error(`Referencia sin equivalencia ${entity}:${source}`);
    return id;
  };
  const emit = (table, id, patch, before = null, origin = null) => {
    if (!Object.keys(patch).length) return;
    const found = operations.find(o => o.table === table && o.id === id);
    if (found) { Object.assign(found.patch, patch); return; }
    operations.push({ table, id, action: before ? 'update' : 'insert', before, patch, origin });
  };
  const addMap = (entity, source, destination) => emit('migracion_id_map', uuid(`${batchId}:map:${entity}:${source}`),
    { migracion_id: batchId, entidad: entity, id_origen: String(source), id_destino: destination, accion: 'insertado' });
  const remember = (entity, row) => sources.push({ entidad: entity, source_id: row.sourceId, data: row.data });
  const originals = new Map(baselineRows(snapshot).map(r => [key(r.modulo, r.source_id), r.datos]));
  const masterProjection = (entity, data) => {
    const result = Object.fromEntries(Object.entries(data).filter(([field]) => catalog.columns.some(c => c.table === entity && c.name === field && c.generated === 'NEVER') && !['id', 'comercio_id', 'created_at', 'updated_at'].includes(field)));
    if (entity === 'clientes' || entity === 'proveedores') result.cuit = cleanCuit(result.cuit);
    if (entity === 'productos') for (const [field, target] of [['proveedor', 'proveedores'], ['rubro', 'rubros'], ['marca', 'marcas']]) result[`${field}_id`] = reference(target, data[`${field}_source_id`]);
    return result;
  };
  for (const entity of ['rubros', 'marcas', 'proveedores', 'clientes', 'productos']) {
    const classifications = new Map(comparison[entity].map(r => [r.id_origen, r]));
    for (const row of proposals.proposed[entity]) {
      const classified = classifications.get(row.sourceId);
      if (!['nuevo', 'modificado'].includes(classified.clasificacion)) continue;
      const id = reference(entity, row.sourceId);
      const desired = masterProjection(entity, row.data);
      const current = destinations.get(entity).get(id);
      if (desired.cuit && snapshot[entity].some(r => r.id !== id && string(r.cuit) === desired.cuit)) {
        preserved.push({ entity, source: row.sourceId, reason: 'CUIT duplicado de origen: se conserva la normalización previa' });
        continue;
      }
      if (!current) {
        const naturalField = entity === 'productos' ? 'cod_producto' : ['rubros', 'marcas'].includes(entity) ? 'nombre' : null;
        if (naturalField && snapshot[entity].some(r => string(r[naturalField]) === string(desired[naturalField]))) throw new Error(`Posible duplicado natural ${entity}:${row.sourceId}`);
        emit(entity, id, desired, null, { entity, source: row.sourceId }); addMap(entity, row.sourceId, id); remember(entity, row);
      } else {
        const baseline = masterProjection(entity, originals.get(key(entity, row.sourceId)));
        const delta = safePatch(baseline, desired, current);
        if (delta.conflicts.length) { pending.push({ entity, source: row.sourceId, fields: delta.conflicts, reason: 'Destino modificado desde la importación' }); continue; }
        emit(entity, id, delta.patch, current, { entity, source: row.sourceId });
        if (Object.keys(delta.patch).length) remember(entity, row);
      }
    }
  }
  const saleRows = new Map(proposals.proposed.ventas.map(r => [r.sourceId, r]));
  const newSaleIds = new Set(comparison.ventas.filter(r => r.clasificacion === 'nuevo').map(r => r.id_origen));
  const newCae = new Map();
  for (const record of proposals.cae) {
    const id = string(record.idVenta);
    if (newSaleIds.has(id)) newCae.set(id, [...(newCae.get(id) || []), record]);
  }
  const fullName = source => {
    const id = reference('clientes', source);
    const client = snapshot.clientes.find(c => c.id === id) || proposals.proposed.clientes.find(c => c.sourceId === source)?.data;
    if (!client) throw new Error('Cliente de venta inexistente');
    return [client.nombre, client.apellido].filter(Boolean).join(' ').trim();
  };
  const saleProjection = row => ({ numero_comprobante: row.sourceId, fecha_venta: row.data.fecha,
    tipo_pago: row.data.tipo_pago, tipo_comprobante: row.data.tipo_comprobante, cliente_id: reference('clientes', row.data.cliente_source_id),
    cliente_nombre: fullName(row.data.cliente_source_id), subtotal: row.data.tipo_comprobante === 'factura_a' ? row.data.subtotal : row.data.total,
    total_iva: row.data.tipo_comprobante === 'factura_a' ? row.data.total_iva : 0, total: row.data.total,
    porcentaje_descuento: row.data.porcentaje_descuento, porcentaje_recargo: row.data.porcentaje_recargo,
    monto_descuento: round(Math.max(0, -row.data.ajuste)), monto_recargo: round(Math.max(0, row.data.ajuste)), moneda: 'ARS',
    observaciones: [row.data.observaciones, `Migrado de Access; comprobante origen ${row.data.comprobante_origen}`].filter(Boolean).join(' | ') });
  for (const source of newSaleIds) {
    const row = saleRows.get(source);
    if ((newCae.get(source) || []).length > 1) throw new Error(`CAE ambiguo en nueva venta ${source}`);
    if (!(row.data.total > 0) || !row.data.fecha) throw new Error(`Venta nueva inválida ${source}`);
    const desired = saleProjection(row);
    if (snapshot.ventas.some(r => r.numero_comprobante === desired.numero_comprobante)) throw new Error(`Comprobante ya existente ${source}`);
    const cae = newCae.get(source)?.[0];
    if (cae) {
      if (!/^\d{14}$/.test(string(cae.cae))) throw new Error(`CAE inválido en venta ${source}`);
      const expiry = string(cae.vtoCae);
      if (!/^\d{8}$/.test(expiry)) throw new Error(`Vencimiento CAE inválido ${source}`);
      const date = `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6)}`;
      if (new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Fecha CAE inválida ${source}`);
      desired.cae = string(cae.cae); desired.cae_vencimiento = date;
    }
    emit('ventas', reference('ventas', source), desired, null, { entity: 'ventas', source });
    addMap('ventas', source, reference('ventas', source)); remember('ventas', row);
  }
  // La venta 7210 conserva su UUID y las tres líneas que coinciden exactamente.
  // Se archiva la equivalencia de sus IDs anteriores y se agregan sólo dos líneas.
  const old7210 = snapshot.ventas.find(r => r.id === reference('ventas', '7210'));
  const reuse = new Map();
  if (updateSale7210) {
    if (!old7210 || old7210.cae || cents(old7210.total) !== 6700001) throw new Error('La venta 7210 cambió o está protegida; revisar');
    const source = saleRows.get('7210');
    if (cents(source.data.total) !== 13800002) throw new Error('La última base de venta 7210 no coincide con la revisión');
    const lines = proposals.proposed.items.filter(r => r.data.venta_source_id === '7210');
    const current = snapshot.venta_items.filter(r => r.venta_id === old7210.id);
    if (lines.length !== 5 || current.length !== 3) throw new Error('Detalle inesperado en venta 7210');
    const used = new Set();
    for (const item of current) {
      const candidates = lines.filter(r => !used.has(r.sourceId) && reference('productos', r.data.producto_source_id) === item.producto_id && r.data.cantidad === item.cantidad && r.data.precio_unitario === item.precio_unitario && cents(r.data.total) === cents(item.total));
      if (candidates.length !== 1) throw new Error('No se puede conservar sin ambigüedad una línea de venta 7210');
      const replacement = candidates[0]; used.add(replacement.sourceId); reuse.set(replacement.sourceId, item.id);
      const oldMaps = snapshot.migracion_id_map.filter(m => m.entidad === 'items' && m.id_destino === item.id);
      if (oldMaps.length !== 1) throw new Error('Equivalencia anterior ambigua en venta 7210');
      emit('migracion_id_map', oldMaps[0].id, { entidad: 'items_origen_anterior' }, oldMaps[0], { entity: 'items', source: oldMaps[0].id_origen });
      addMap('items', replacement.sourceId, item.id); remember('items', replacement);
      map.set(key('items', replacement.sourceId), item.id);
    }
    emit('ventas', old7210.id, { total: 138000.02, subtotal: 138000.02, total_iva: 0 }, old7210, { entity: 'ventas', source: '7210' });
    remember('ventas', source);
    const debits = snapshot.cuenta_corriente.filter(r => r.venta_id === old7210.id);
    if (debits.length !== 1 || debits[0].tipo_movimiento !== 'debito' || cents(debits[0].monto) !== 6700001) throw new Error('Débito inesperado en venta 7210');
    emit('cuenta_corriente', debits[0].id, { monto: 138000.02 }, debits[0], { entity: 'cuenta_ventas', source: '7210' });
  } else pending.push({ entity: 'ventas', source: '7210', reason: 'Conservar venta actual por decisión explícita', difference_cents: 7100001 });
  for (const row of proposals.proposed.items) {
    const classified = comparison.items.find(c => c.id_origen === row.sourceId);
    if (classified.clasificacion !== 'nuevo' || reuse.has(row.sourceId)) continue;
    const saleSource = row.data.venta_source_id;
    if (saleSource === '7210' && !updateSale7210) continue;
    if (!newSaleIds.has(saleSource) && saleSource !== '7210') throw new Error(`Nuevo detalle en otra venta existente: ${row.sourceId}`);
    if (!Number.isInteger(row.data.cantidad) || row.data.cantidad <= 0 || row.data.precio_unitario < 0) throw new Error(`Detalle nuevo inválido ${row.sourceId}`);
    const net = saleRows.get(saleSource).data.tipo_comprobante === 'factura_a';
    const id = reference('items', row.sourceId);
    emit('venta_items', id, { venta_id: reference('ventas', saleSource), producto_id: reference('productos', row.data.producto_source_id), cantidad: row.data.cantidad,
      precio_unitario: row.data.precio_unitario, porcentaje_iva: row.data.porcentaje_iva, subtotal: net ? row.data.subtotal : row.data.total,
      monto_iva: net ? row.data.monto_iva : 0, total: row.data.total, afecta_stock: true }, null, { entity: 'items', source: row.sourceId });
    addMap('items', row.sourceId, id); remember('items', row);
  }
  for (const source of newSaleIds) {
    const row = saleRows.get(source);
    if (row.data.tipo_pago !== 'cta_cte') continue;
    emit('cuenta_corriente', uuid(`${batchId}:cuenta_venta:${source}`), { cliente_id: reference('clientes', row.data.cliente_source_id),
      tipo_movimiento: row.data.tipo_movimiento_cuenta, monto: row.data.total, concepto: `Venta historica ${source}`,
      venta_id: reference('ventas', source), fecha_movimiento: row.data.fecha, observaciones: 'Migrado de Access', moneda: 'ARS' }, null, { entity: 'cuenta_ventas', source });
  }
  for (const row of proposals.proposed.pagos) {
    if (!comparison.pagos.some(r => r.id_origen === row.sourceId && r.clasificacion === 'nuevo')) continue;
    if (!(row.data.monto > 0) || !row.data.fecha) throw new Error(`Nuevo pago requiere decisión específica ${row.sourceId}`);
    const id = reference('pagos', row.sourceId);
    emit('cuenta_corriente', id, { cliente_id: reference('clientes', row.data.cliente_source_id), tipo_movimiento: 'credito', monto: row.data.monto,
      concepto: `Pago historico #${row.sourceId}`, fecha_movimiento: row.data.fecha, moneda: 'ARS',
      observaciones: [row.data.observaciones, `Medio: ${row.data.tipo_pago}`].filter(Boolean).join(' | ') }, null, { entity: 'pagos', source: row.sourceId });
    addMap('pagos', row.sourceId, id); remember('pagos', row);
  }
  for (const type of ['CompraProveedor', 'PagosProveedores', 'CaeXventa']) for (const row of comparison[type]) {
    if (row.clasificacion !== 'nuevo') continue;
    const original = type === 'CaeXventa' ? proposals.cae.find(r => string(r.Id) === row.id_origen) : proposals.cierre.archivo.find(r => r.tipo === type && r.sourceId === row.id_origen)?.data;
    if (!original) throw new Error(`Archivo de origen incompleto ${type}:${row.id_origen}`);
    const data = type === 'CaeXventa' ? { ...original, aplicado: newSaleIds.has(string(original.idVenta)) } : original;
    const closure = proposals.cierre.archivo.find(r => r.tipo === type && r.sourceId === row.id_origen);
    emit('historial_legacy', uuid(`${batchId}:archivo:${type}:${row.id_origen}`), { migracion_id: batchId, tipo: type, source_id: row.id_origen, fecha: closure?.fecha || null, datos: data }, null, { entity: type, source: row.id_origen });
  }
  const plan = { comercio_id: COMERCIO_ID, email: EMAIL, source_hash: SOURCE_HASH, initial_hash: HASH_INICIAL,
    batch_id: batchId, policy: { sale7210: updateSale7210 ? 'ultima_base_conservar_tres_uuid_agregar_dos' : 'conservar_actual', deleted_legacy: 'conservar', cuit_duplicates: 'preservar_normalizacion', historical_stock: 'no_descontar_dos_veces' },
    operations, sources, pending, preserved, created_at: new Date().toISOString() };
  plan.plan_hash = hash(JSON.stringify(canonical({ operations, sources, policy: plan.policy })));
  validatePlan(plan, catalog);
  return plan;
}

export function accountFingerprint(rows) {
  return createHash('md5').update([...rows].sort((a, b) => a.id.localeCompare(b.id)).map(r =>
    `${r.id}|${r.cliente_id}|${r.venta_id || ''}|${r.tipo_movimiento}|${cents(r.monto)}|${r.moneda || 'ARS'};`).join('')).digest('hex');
}

export function projectTable(snapshot, plan, table) {
  const rows = new Map(snapshot[table].map(r => [r.id, { ...r }]));
  for (const op of plan.operations.filter(o => o.table === table)) rows.set(op.id, { ...(rows.get(op.id) || {}), id: op.id, comercio_id: COMERCIO_ID, ...op.patch });
  return [...rows.values()];
}

export function reconcilePlan(snapshot, proposals, plan) {
  const maps = projectTable(snapshot, plan, 'migracion_id_map');
  const clients = new Map(maps.filter(m => m.entidad === 'clientes').map(m => [m.id_origen, m.id_destino]));
  const accounts = projectTable(snapshot, plan, 'cuenta_corriente');
  const expected = new Map(); const actual = new Map();
  const add = (bucket, id, amount) => bucket.set(id, (bucket.get(id) || 0) + amount);
  for (const row of proposals.proposed.ventas) if (row.data.tipo_pago === 'cta_cte') {
    const id = clients.get(row.data.cliente_source_id);
    if (!id) throw new Error(`Cliente de cuenta sin equivalencia: ${row.sourceId}`);
    add(expected, id, cents(row.data.total) * (row.data.tipo_movimiento_cuenta === 'credito' ? -1 : 1));
  }
  for (const row of proposals.proposed.pagos) {
    const id = clients.get(row.data.cliente_source_id);
    if (!id) throw new Error(`Cliente de pago sin equivalencia: ${row.sourceId}`);
    add(expected, id, -cents(row.data.monto));
  }
  const mappedPayments = new Set(maps.filter(m => m.entidad === 'pagos').map(m => m.id_destino));
  const mappedSales = new Set(maps.filter(m => m.entidad === 'ventas').map(m => m.id_destino));
  for (const row of accounts) {
    const amount = cents(row.monto) * (row.tipo_movimiento === 'credito' ? -1 : 1);
    add(actual, row.cliente_id, amount);
    if (!mappedPayments.has(row.id) && !mappedSales.has(row.venta_id)) add(expected, row.cliente_id, amount);
  }
  const differences = [...new Set([...expected.keys(), ...actual.keys()])].map(id => ({ cliente_id: id,
    origen_centavos: expected.get(id) || 0, proyectado_centavos: actual.get(id) || 0,
    diferencia_centavos: (actual.get(id) || 0) - (expected.get(id) || 0) })).filter(r => r.diferencia_centavos !== 0);
  const sales = projectTable(snapshot, plan, 'ventas');
  const items = projectTable(snapshot, plan, 'venta_items');
  const receipt = sales.find(r => r.id === maps.find(m => m.entidad === 'ventas' && m.id_origen === '7210').id_destino);
  const receiptItems = items.filter(r => r.venta_id === receipt.id);
  const sum = rows => rows.reduce((total, r) => total + cents(r.data?.total ?? r.data?.monto ?? r.monto ?? r.total), 0);
  const newSaleSources = new Set(plan.operations.filter(o => o.table === 'ventas' && o.action === 'insert').map(o => o.origin.source));
  const newSales = proposals.proposed.ventas.filter(r => newSaleSources.has(r.sourceId));
  const newPayments = proposals.proposed.pagos.filter(r => plan.operations.some(o => o.origin?.entity === 'pagos' && o.origin.source === r.sourceId && o.table === 'cuenta_corriente'));
  const newSaleChecks = sales.filter(s => newSaleSources.has(plan.operations.find(o => o.table === 'ventas' && o.id === s.id)?.origin?.source)).map(s => {
    const lines = items.filter(i => i.venta_id === s.id);
    const total = sum(lines) + cents(s.monto_recargo) - cents(s.monto_descuento);
    return { id: s.id, items: lines.length, difference_cents: total - cents(s.total) };
  });
  if (newSaleChecks.some(r => !r.items || Math.abs(r.difference_cents) > 1)) throw new Error('No concilia el detalle de las nuevas ventas');
  const budgets = proposals.cierre.presupuestos.map(r => {
    const mapping = maps.filter(m => m.entidad === 'presupuestos' && m.id_origen === r.sourceId);
    const dst = snapshot.presupuestos.find(b => b.id === mapping[0]?.id_destino);
    const desired = proposals.cierre.items.filter(i => i.data.presupuesto_source_id === r.sourceId).map(i => [maps.find(m => m.entidad === 'productos' && m.id_origen === i.data.producto_source_id)?.id_destino, i.data.cantidad, i.data.precio]);
    const current = snapshot.presupuesto_items.filter(i => i.presupuesto_id === dst?.id).map(i => [i.producto_id, i.cantidad, i.precio_unitario]);
    const sorted = arr => [...arr].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const ok = mapping.length === 1 && !!dst && dst.cliente_id === clients.get(r.data.cliente_source_id) && cents(dst.total) === cents(r.data.total) && same(sorted(desired), sorted(current));
    return { source: r.sourceId, ok, items: current.length };
  });
  if (budgets.some(b => !b.ok)) throw new Error('Hay diferencias en presupuestos que requieren revisión');
  const reconciliation = { budgets, new_sale_checks: newSaleChecks, expected_account_cents: [...expected.values()].reduce((s, n) => s + n, 0), projected_account_cents: [...actual.values()].reduce((s, n) => s + n, 0),
    current_account_cents: snapshot.cuenta_corriente.reduce((s, r) => s + cents(r.monto) * (r.tipo_movimiento === 'credito' ? -1 : 1), 0),
    differences, new_sales_total_cents: sum(newSales), new_account_sales_cents: sum(newSales.filter(r => r.data.tipo_pago === 'cta_cte')),
    new_payments_total_cents: sum(newPayments), sale7210: { before_cents: 6700001, after_cents: cents(receipt.total), item_count: receiptItems.length, items_cents: sum(receiptItems), retained_original_uuids: snapshot.venta_items.filter(r => r.venta_id === receipt.id).every(r => receiptItems.some(n => n.id === r.id)) },
    before_counts: Object.fromEntries(['clientes', 'productos', 'ventas', 'venta_items', 'cuenta_corriente', 'cheques', 'presupuestos'].map(t => [t, snapshot[t].length])),
    after_counts: Object.fromEntries(['clientes', 'productos', 'ventas', 'venta_items', 'cuenta_corriente', 'cheques'].map(t => [t, projectTable(snapshot, plan, t).length])),
    account_before_fingerprint: accountFingerprint(snapshot.cuenta_corriente), account_after_fingerprint: accountFingerprint(accounts) };
  if (differences.length) throw new Error(`Conciliación de clientes con ${differences.length} diferencias; no emitir SQL de aplicación`);
  if (receiptItems.length !== 5 || cents(receipt.total) !== sum(receiptItems)) throw new Error('No concilia el detalle de venta 7210');
  return reconciliation;
}

const literal = data => `'${JSON.stringify(data).replaceAll("'", "''")}'::jsonb`;
const quote = name => `"${name.replaceAll('"', '""')}"`;
const digestSQL = `SELECT md5(COALESCE(string_agg(id::text||'|'||cliente_id::text||'|'||COALESCE(venta_id::text,'')||'|'||tipo_movimiento||'|'||round(monto*100)::bigint::text||'|'||moneda::text||';','' ORDER BY id),'')) FROM public.cuenta_corriente WHERE comercio_id='${COMERCIO_ID}'`;

export function precheckSQL(plan, reconciliation) {
  const rows = plan.operations.filter(o => o.before).map(o => `SELECT '${o.table}:${o.id}' AS fila, EXISTS(SELECT 1 FROM public.${quote(o.table)} t WHERE id='${o.id}' AND comercio_id='${COMERCIO_ID}' AND (to_jsonb(t)-'updated_at')=(to_jsonb(jsonb_populate_record(NULL::public.${quote(o.table)},${literal(o.before)}))-'updated_at')) AS coincide`);
  return `SELECT jsonb_build_object('imagenes_anteriores',(SELECT jsonb_agg(t) FROM (${rows.join('\nUNION ALL\n')}) t),'cuenta_coincide',((${digestSQL})='${reconciliation.account_before_fingerprint}')) AS precheck;\n`;
}

export function compileSQL(plan, reconciliation, catalog) {
  validatePlan(plan, catalog);
  if (plan.pending.length || reconciliation.differences.length) throw new Error('No emitir aplicación con conflictos pendientes');
  const order = ['rubros', 'marcas', 'proveedores', 'clientes', 'productos', 'ventas', 'venta_items', 'cuenta_corriente', 'cheques', 'historial_legacy', 'migracion_id_map'];
  const payload = [...plan.operations].sort((a, b) => order.indexOf(a.table) - order.indexOf(b.table) || a.id.localeCompare(b.id));
  const gateFunctions = [...new Map(catalog.triggers.filter(t => /apply_venta_item_stock|set_comercio_id_from_context|prevent_authorized|proteger_cuenta_corriente_venta_cae|validate_same_comercio_references/.test(t.function.match(/FUNCTION\s+([^\s(]+)/)?.[1] || '')).map(t => [t.function.match(/FUNCTION\s+([^\s(]+)/)[1], t.function])).entries()].map(([name, definition]) => ({ name, hash: createHash('md5').update(definition).digest('hex') }));
  const gate = gateFunctions.map(f => `IF md5(pg_get_functiondef('${f.name}()'::regprocedure)) <> '${f.hash}' THEN RAISE EXCEPTION 'Cambió la función ${f.name}; revisar delta'; END IF;`).join('\n');
  const triggerGate = catalog.triggers.map(t => `IF NOT EXISTS(SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${t.table}' AND tg.tgname='${t.name}' AND tg.tgenabled='O' AND md5(pg_get_triggerdef(tg.oid))='${createHash('md5').update(t.definition).digest('hex')}') THEN RAISE EXCEPTION 'Cambió trigger ${t.table}.${t.name}'; END IF;`).join('\n');
  const locks = [...TABLES].sort().map(t => `LOCK TABLE public.${quote(t)} IN SHARE ROW EXCLUSIVE MODE;`).join('\n');
  const bootstrap = `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
SET LOCAL timezone='UTC';
SET LOCAL standard_conforming_strings=on;
SELECT pg_advisory_xact_lock(hashtextextended('bostico-incremental:${COMERCIO_ID}',0));
CREATE TEMP TABLE bostico_delta_20261014 (ord integer, op jsonb) ON COMMIT DROP;
` + payload.map((op, i) => `INSERT INTO pg_temp.bostico_delta_20261014 VALUES (${i},${literal(op)});`).join('\n');
  const apply = `-- SOLO APLICAR TRAS AUTORIZACIÓN EXPRESA. Bostico, base ${SOURCE_HASH}.
-- No ejecuta el importador completo, no elimina filas y no deshabilita triggers.
${bootstrap}
DO $bostico$
DECLARE r record; a jsonb; b jsonb; d jsonb; cols text; sel text; n integer; actor uuid; cae_record record; dest uuid;
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Requiere ejecución administrativa'; END IF;
 SELECT u.id INTO actor FROM auth.users u JOIN public.comercio_usuarios cu ON cu.user_id=u.id WHERE lower(u.email)='${EMAIL}' AND cu.comercio_id='${COMERCIO_ID}' AND cu.activo LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'No coincide el comercio autorizado'; END IF;
 IF EXISTS(SELECT 1 FROM public.migraciones WHERE id='${plan.batch_id}' AND comercio_id='${COMERCIO_ID}' AND estado='completado' AND resumen->>'plan_hash'='${plan.plan_hash}') THEN RAISE NOTICE 'Delta ya aplicado; no se repite'; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.migraciones WHERE id='${plan.batch_id}' OR (comercio_id='${COMERCIO_ID}' AND resumen->>'plan_hash'='${plan.plan_hash}')) THEN RAISE EXCEPTION 'Ejecución previa incompleta, revertida o conflictiva'; END IF;
 IF (SELECT count(DISTINCT resumen->>'tipo') FROM public.migraciones WHERE comercio_id='${COMERCIO_ID}' AND archivo_hash='${HASH_INICIAL}' AND estado='completado' AND resumen->>'tipo' IN ('maestros','operaciones','cierre')) <> 3 THEN RAISE EXCEPTION 'Cambió la línea base original'; END IF;
 ${locks}
 ${gate}
 ${triggerGate}
 IF ((${digestSQL})) <> '${reconciliation.account_before_fingerprint}' THEN RAISE EXCEPTION 'Cambió la cuenta corriente desde la comparación; repetir conciliación'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('app.skip_stock_movements','on',true);
 -- Todos los controles se realizan antes de insertar una fila productiva.
 FOR r IN SELECT * FROM pg_temp.bostico_delta_20261014 ORDER BY ord LOOP
  IF r.op->>'table' NOT IN (${TABLES.map(t => `'${t}'`).join(',')}) THEN RAISE EXCEPTION 'Tabla fuera de alcance'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND comercio_id=$2 FOR UPDATE',r.op->>'table') INTO a USING (r.op->>'id')::uuid,'${COMERCIO_ID}'::uuid;
  IF r.op->>'action'='insert' THEN
   IF a IS NOT NULL THEN RAISE EXCEPTION 'UUID nuevo ya existe: %',r.op->>'id'; END IF;
   IF r.op->>'table'='migracion_id_map' AND EXISTS(SELECT 1 FROM public.migracion_id_map WHERE comercio_id='${COMERCIO_ID}' AND entidad=r.op->'patch'->>'entidad' AND id_origen=r.op->'patch'->>'id_origen') THEN RAISE EXCEPTION 'ID de origen ya migrado'; END IF;
   IF r.op->>'table'='historial_legacy' AND EXISTS(SELECT 1 FROM public.historial_legacy WHERE comercio_id='${COMERCIO_ID}' AND tipo=r.op->'patch'->>'tipo' AND source_id=r.op->'patch'->>'source_id') THEN RAISE EXCEPTION 'Registro histórico ya archivado'; END IF;
   IF r.op->>'table'='productos' AND EXISTS(SELECT 1 FROM public.productos WHERE comercio_id='${COMERCIO_ID}' AND cod_producto=r.op->'patch'->>'cod_producto') THEN RAISE EXCEPTION 'Código de producto ya existe'; END IF;
   IF r.op->>'table'='ventas' AND EXISTS(SELECT 1 FROM public.ventas WHERE comercio_id='${COMERCIO_ID}' AND numero_comprobante=r.op->'patch'->>'numero_comprobante') THEN RAISE EXCEPTION 'Número de venta ya existe'; END IF;
   IF r.op->>'table'='clientes' AND nullif(r.op->'patch'->>'cuit','') IS NOT NULL AND EXISTS(SELECT 1 FROM public.clientes WHERE comercio_id='${COMERCIO_ID}' AND btrim(cuit)=r.op->'patch'->>'cuit') THEN RAISE EXCEPTION 'CUIT ya existe'; END IF;
  ELSIF r.op->>'action'='update' THEN
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::public.%I,$1))',r.op->>'table') INTO b USING r.op->'before';
   IF a IS NULL OR (a-'updated_at') IS DISTINCT FROM (b-'updated_at') THEN RAISE EXCEPTION 'Cambió el destino: %',r.op->>'id'; END IF;
  ELSE RAISE EXCEPTION 'Acción fuera de alcance'; END IF;
 END LOOP;
 INSERT INTO public.migraciones(id,comercio_id,archivo_nombre,archivo_hash,archivo_tamano,estado,creado_por,resumen)
 VALUES('${plan.batch_id}','${COMERCIO_ID}','BDsiagro.mdb','${SOURCE_HASH}',9953280,'importando',actor,jsonb_build_object('tipo','bostico_incremental','plan_hash','${plan.plan_hash}','venta7210','ultima_base','operaciones',${payload.length}));
 FOR r IN SELECT * FROM pg_temp.bostico_delta_20261014 ORDER BY ord LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND comercio_id=$2',r.op->>'table') INTO a USING (r.op->>'id')::uuid,'${COMERCIO_ID}'::uuid;
  d:=r.op->'patch';
  -- El CAE se completa cuando detalle y cuenta corriente ya existen.
  IF r.op->>'table'='ventas' AND r.op->>'action'='insert' THEN d:=d-ARRAY['cae','cae_vencimiento']; END IF;
  IF r.op->>'action'='insert' THEN
   d:=d||jsonb_build_object('id',r.op->>'id','comercio_id','${COMERCIO_ID}');
   SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('x.%I',k),',' ORDER BY k) INTO cols,sel FROM jsonb_object_keys(d) k;
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x',r.op->>'table',cols,sel,r.op->>'table') USING d;
  ELSE
   SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('x.%I',k),',' ORDER BY k) INTO cols,sel FROM jsonb_object_keys(d) k;
   EXECUTE format('UPDATE public.%I t SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x) WHERE id=$2 AND comercio_id=$3',r.op->>'table',cols,sel,r.op->>'table') USING d,(r.op->>'id')::uuid,'${COMERCIO_ID}'::uuid;
  END IF;
  GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Número de filas inesperado'; END IF;
  INSERT INTO public.historial_legacy(comercio_id,migracion_id,tipo,source_id,datos)
  VALUES('${COMERCIO_ID}','${plan.batch_id}','BosticoIncrementalAudit',r.op->>'table'||':'||(r.op->>'id'),jsonb_build_object('table',r.op->>'table','id',r.op->>'id','action',r.op->>'action','before',a,'after',NULL,'ord',r.ord,'origin',r.op->'origin'));
 END LOOP;
 FOR cae_record IN SELECT op FROM pg_temp.bostico_delta_20261014 WHERE op->>'table'='ventas' AND op->>'action'='insert' AND op->'patch' ? 'cae' LOOP
  UPDATE public.ventas SET cae=cae_record.op->'patch'->>'cae',cae_vencimiento=(cae_record.op->'patch'->>'cae_vencimiento')::date WHERE id=(cae_record.op->>'id')::uuid AND comercio_id='${COMERCIO_ID}';
 END LOOP;
 FOR r IN SELECT * FROM pg_temp.bostico_delta_20261014 ORDER BY ord LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND comercio_id=$2',r.op->>'table') INTO a USING (r.op->>'id')::uuid,'${COMERCIO_ID}'::uuid;
  UPDATE public.historial_legacy SET datos=jsonb_set(datos,'{after}',a) WHERE comercio_id='${COMERCIO_ID}' AND migracion_id='${plan.batch_id}' AND tipo='BosticoIncrementalAudit' AND source_id=r.op->>'table'||':'||(r.op->>'id');
 END LOOP;
 ${plan.sources.map(s => `INSERT INTO public.historial_legacy(comercio_id,migracion_id,tipo,source_id,datos) VALUES('${COMERCIO_ID}','${plan.batch_id}','BosticoIncrementalFuente','${s.entidad}:${s.source_id}',${literal(s)});`).join('\n')}
 IF ((${digestSQL})) <> '${reconciliation.account_after_fingerprint}' THEN RAISE EXCEPTION 'No concilia la cuenta corriente después del delta'; END IF;
 IF (SELECT count(*) FROM public.venta_items WHERE comercio_id='${COMERCIO_ID}' AND venta_id=(SELECT id_destino FROM public.migracion_id_map WHERE comercio_id='${COMERCIO_ID}' AND entidad='ventas' AND id_origen='7210' LIMIT 1))<>5 THEN RAISE EXCEPTION 'Detalle de 7210 incompleto'; END IF;
 IF (SELECT round(sum(total)*100)::bigint FROM public.venta_items WHERE comercio_id='${COMERCIO_ID}' AND venta_id=(SELECT id_destino FROM public.migracion_id_map WHERE comercio_id='${COMERCIO_ID}' AND entidad='ventas' AND id_origen='7210' LIMIT 1))<>13800002 THEN RAISE EXCEPTION 'Importe de detalle 7210 inconsistente'; END IF;
 UPDATE public.migraciones SET estado='completado',resumen=resumen||jsonb_build_object('aplicado_at',now(),'sin_eliminaciones',true,'saldo_clientes_centavos',${reconciliation.projected_account_cents}) WHERE id='${plan.batch_id}' AND comercio_id='${COMERCIO_ID}';
END $bostico$;
COMMIT;
SELECT id,estado,resumen FROM public.migraciones WHERE id='${plan.batch_id}' AND comercio_id='${COMERCIO_ID}';
`;
  return apply;
}


export function rollbackSQL(plan, catalog) {
  validatePlan(plan, catalog);
  const fiscal = catalog.triggers.filter(t => /prevent_authorized|proteger_cuenta_corriente_venta_cae/.test(t.function));
  if (fiscal.length !== 3) throw new Error('Protecciones fiscales inesperadas');
  const gates = fiscal.map(t => {
    const name = t.function.match(/FUNCTION\s+([^\s(]+)/)[1];
    return "IF md5(pg_get_functiondef('"+name+"()'::regprocedure)) <> '"+createHash('md5').update(t.function).digest('hex')+"' THEN RAISE EXCEPTION 'Cambió protección fiscal'; END IF;";
  }).join('\n');
  const disable = fiscal.map(t => 'ALTER TABLE public.'+quote(t.table)+' DISABLE TRIGGER '+quote(t.name)+';').join('\n');
  const enable = fiscal.map(t => 'ALTER TABLE public.'+quote(t.table)+' ENABLE TRIGGER '+quote(t.name)+';').join('\n');
  return `-- REQUIERE AUTORIZACIÓN EXPRESA SEPARADA PARA REVERTIR.
-- Rechaza cambios/dependencias posteriores. Conserva auditoría y lote cancelado.
-- Bloquea escrituras en tablas involucradas y suspende únicamente tres triggers
-- fiscales dentro de esta transacción. Un error revierte también su suspensión.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
SET LOCAL timezone='UTC';
SELECT pg_advisory_xact_lock(hashtextextended('bostico-incremental:${COMERCIO_ID}',0));
DO $reverse$
DECLARE r record; f record; a jsonb; b jsonb; d jsonb; cols text; sel text; found_reference boolean; actor uuid;
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Requiere administración'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.migraciones WHERE id='${plan.batch_id}' AND comercio_id='${COMERCIO_ID}' AND estado='completado' AND resumen->>'plan_hash'='${plan.plan_hash}') THEN RAISE EXCEPTION 'Lote no aplicado o ya revertido'; END IF;
 SELECT u.id INTO actor FROM auth.users u JOIN public.comercio_usuarios cu ON cu.user_id=u.id WHERE lower(u.email)='${EMAIL}' AND cu.comercio_id='${COMERCIO_ID}' AND cu.activo LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Comercio no autorizado'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('app.skip_stock_movements','on',true);
 -- Incluir tablas dependientes evita nuevas referencias durante la reversión.
 FOR r IN SELECT DISTINCT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relname IN (${TABLES.map(t=>"'"+t+"'").join(',')}) OR c.oid IN
 (SELECT conrelid FROM pg_constraint WHERE contype='f' AND confrelid IN (SELECT pc.oid FROM pg_class pc JOIN pg_namespace pn ON pn.oid=pc.relnamespace WHERE pn.nspname='public' AND pc.relname IN (${TABLES.map(t=>"'"+t+"'").join(',')})))) ORDER BY name LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',r.name);
 END LOOP;
 ${gates}
 IF (SELECT count(*) FROM public.historial_legacy WHERE comercio_id='${COMERCIO_ID}' AND migracion_id='${plan.batch_id}' AND tipo='BosticoIncrementalAudit') <> ${plan.operations.length} THEN RAISE EXCEPTION 'Auditoría incompleta'; END IF;
 FOR r IN SELECT datos FROM public.historial_legacy WHERE comercio_id='${COMERCIO_ID}' AND migracion_id='${plan.batch_id}' AND tipo='BosticoIncrementalAudit' LOOP
  IF r.datos->>'table' NOT IN (${TABLES.map(t=>"'"+t+"'").join(',')}) OR r.datos->>'action' NOT IN ('insert','update') THEN RAISE EXCEPTION 'Auditoría inválida'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND comercio_id=$2',r.datos->>'table') INTO a USING (r.datos->>'id')::uuid,'${COMERCIO_ID}'::uuid;
  EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::public.%I,$1))',r.datos->>'table') INTO b USING r.datos->'after';
  IF a IS NULL OR (a-'updated_at') IS DISTINCT FROM (b-'updated_at') THEN RAISE EXCEPTION 'Hay cambios posteriores en %; no revertir',r.datos->>'id'; END IF;
  IF r.datos->>'action'='insert' THEN
   IF EXISTS(SELECT 1 FROM public.migracion_id_map WHERE comercio_id='${COMERCIO_ID}' AND id_destino=(r.datos->>'id')::uuid AND migracion_id<>'${plan.batch_id}') THEN RAISE EXCEPTION 'Hay equivalencias posteriores; no revertir'; END IF;
   FOR f IN SELECT k.conrelid::regclass AS relation,c.relname AS tab,k.conkey,k.confkey,sa.attname AS child_column,pa.attname AS parent_column
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    JOIN pg_attribute sa ON sa.attrelid=k.conrelid AND sa.attnum=k.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid=k.confrelid AND pa.attnum=k.confkey[1]
    WHERE k.contype='f' AND k.confrelid=('public.'||(r.datos->>'table'))::regclass LOOP
    IF cardinality(f.conkey)<>1 OR cardinality(f.confkey)<>1 OR f.parent_column<>'id' THEN RAISE EXCEPTION 'Referencia compuesta requiere revisión manual'; END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s child WHERE child.%I=$1 AND NOT EXISTS(SELECT 1 FROM public.historial_legacy h WHERE h.comercio_id=$2 AND h.migracion_id=$3 AND h.tipo=''BosticoIncrementalAudit'' AND h.datos->>''table''=$4 AND h.datos->>''id''=child.id::text AND (h.datos->>''action''=''insert'' OR h.datos->''before''->>$5 IS DISTINCT FROM $1::text)))',f.relation,f.child_column)
    INTO found_reference USING (r.datos->>'id')::uuid,'${COMERCIO_ID}'::uuid,'${plan.batch_id}'::uuid,f.tab,f.child_column;
    IF found_reference THEN RAISE EXCEPTION 'Hay dependencias posteriores en %; no revertir',f.tab; END IF;
   END LOOP;
  END IF;
 END LOOP;
 -- Las tres suspensiones sólo permiten retirar este lote fiscal histórico.
 ${disable}
 FOR r IN SELECT datos FROM public.historial_legacy WHERE comercio_id='${COMERCIO_ID}' AND migracion_id='${plan.batch_id}' AND tipo='BosticoIncrementalAudit' ORDER BY (datos->>'ord')::integer DESC LOOP
  IF r.datos->>'action'='insert' THEN
   EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND comercio_id=$2',r.datos->>'table') USING (r.datos->>'id')::uuid,'${COMERCIO_ID}'::uuid;
  ELSE
   d:=r.datos->'before';
   SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('x.%I',k),',' ORDER BY k) INTO cols,sel
    FROM jsonb_object_keys(d) k JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=r.datos->>'table' AND c.column_name=k
    WHERE c.is_generated='NEVER' AND k NOT IN ('id','comercio_id','updated_at');
   EXECUTE format('UPDATE public.%I SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x) WHERE id=$2 AND comercio_id=$3',r.datos->>'table',cols,sel,r.datos->>'table') USING d,(r.datos->>'id')::uuid,'${COMERCIO_ID}'::uuid;
  END IF;
 END LOOP;
 ${enable}
 UPDATE public.migraciones SET estado='cancelado',resumen=resumen||jsonb_build_object('revertido_at',now(),'auditoria_conservada',true) WHERE id='${plan.batch_id}' AND comercio_id='${COMERCIO_ID}';
END $reverse$;
COMMIT;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [snapshot, proposals, comparison, catalog] = await Promise.all(['snapshot.json', 'propuestas-origen.json', 'comparacion-origen.json', 'catalog.json'].map(async file => JSON.parse(await readFile(resolve(DIRECTORY, file), 'utf8'))));
  const plan = buildPlan(snapshot, proposals, comparison, catalog);
  const reconciliation = reconcilePlan(snapshot, proposals, plan);
  await writeFile(resolve(DIRECTORY, 'delta-plan.json'), JSON.stringify(plan, null, 2));
  await writeFile(resolve(DIRECTORY, 'conciliacion-delta.json'), JSON.stringify(reconciliation, null, 2));
  await writeFile(resolve(DIRECTORY, 'precheck-delta.sql'), precheckSQL(plan, reconciliation));
  await writeFile(resolve(DIRECTORY, 'aplicar-delta.sql'), compileSQL(plan, reconciliation, catalog));
  await writeFile(resolve(DIRECTORY, 'revertir-delta.sql'), rollbackSQL(plan, catalog));
  const counts = {};
  for (const op of plan.operations) { const k = `${op.table}:${op.action}`; counts[k] = (counts[k] || 0) + 1; }
  const report = JSON.parse(await readFile(resolve(DIRECTORY, 'informe.json'), 'utf8'));
  await writeFile(resolve(DIRECTORY, 'informe.json'), JSON.stringify({ ...report, estado: 'delta_preparado_autorizacion_pendiente', aplicable: false, bloqueos: ['Requiere autorización expresa antes de escribir en producción'], delta: { batch: plan.batch_id, plan_hash: plan.plan_hash, counts, policy: plan.policy }, conciliacion_delta: reconciliation }, null, 2));
  console.log(JSON.stringify({ batch: plan.batch_id, counts, differences: reconciliation.differences.length, sales_checked: reconciliation.new_sale_checks.length, budgets_checked: reconciliation.budgets.length, sale7210: reconciliation.sale7210, pending: plan.pending.length }, null, 2));
}
