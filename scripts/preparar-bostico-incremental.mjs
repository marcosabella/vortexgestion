// Preparación local y consultas SELECT. No contiene una vía de aplicación.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COMERCIO_ID = 'a4983b26-4f3d-46e0-8e4f-46bd34fec838';
export const EMAIL = 'carlosbostico@hotmail.com';
export const HASH_INICIAL = '0397486df43cabca2fdc3f0b4509b2a416ccb16a0322693e2bd73a67bfb07d56';
export const PROJECT_REF = 'zhtqkygjvaaizbdwwsbi';
export const REST_PAGE_SIZE = 200;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TABLES = ['migraciones', 'migracion_id_map', 'migracion_staging_maestros',
  'migracion_staging_operaciones', 'historial_legacy', 'rubros', 'marcas', 'proveedores',
  'productos', 'clientes', 'ventas', 'venta_items', 'cuenta_corriente', 'cheques',
  'presupuestos', 'presupuesto_items', 'cuenta_corriente_proveedores'];
const ACCESS_TABLES = ['Rubro', 'Marca', 'Proveedores', 'Articulos', 'Clientes',
  'Domicilio_x_cliente', 'Localidades', 'Provincias', 'CondIva', 'Ventas', 'Detalle_Venta',
  'Pagos', 'Cheques', 'Banco', 'Comprobantes', 'CompraProveedor', 'PagosProveedores', 'CaeXventa'];
const TARGET = { items: 'venta_items', pagos: 'cuenta_corriente' };
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const value = (row, name) => Object.entries(row).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
const text = input => input == null ? '' : String(input).trim();
const money = input => {
  const n = Number(input);
  if (!Number.isFinite(n)) throw new Error(`Importe no numérico: ${input}`);
  return Math.round(n * 100);
};
const canonical = input => {
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort().map(k => [k, canonical(input[k])]));
  if (typeof input === 'string' && /^\d{4}-\d\d-\d\dT/.test(input) && Number.isFinite(Date.parse(input))) return new Date(input).toISOString();
  return input;
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function normalizeSource(entity, data) {
  const copy = { ...data };
  for (const key of ['source_id', 'comercio_id', 'proveedor_referencia', 'rubro_referencia', 'marca_referencia']) delete copy[key];
  if (entity === 'ventas') {
    // El staging precede las reparaciones de notas y Recibos X.
    const code = text(copy.comprobante_origen);
    const corrected = { '2': 'nota_debito_a', '3': 'nota_credito_a', '7': 'nota_debito_b',
      '8': 'nota_credito_b', '12': 'nota_debito_c', '13': 'nota_credito_c', '121': 'recibo_x' }[code];
    if (corrected) copy.tipo_comprobante = corrected;
    delete copy.tipo_movimiento_cuenta; // Se concilia por separado con Comprobantes.Resta.
    delete copy.subtotal; // Derivados del IVA, no son campos de la cabecera Access.
    delete copy.total_iva;
    if (typeof copy.ajuste === 'number') copy.ajuste = Math.round(copy.ajuste * 100) / 100;
  }
  if (entity === 'items') for (const field of ['subtotal', 'monto_iva', 'porcentaje_iva']) delete copy[field];
  if (['clientes', 'proveedores'].includes(entity) && /^[_0\s-]*$/.test(text(copy.cuit))) copy.cuit = '';
  return canonical(copy);
}

function group(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = key(row);
    result.set(id, [...(result.get(id) || []), row]);
  }
  return result;
}

export function validateSnapshot(snapshot) {
  if (snapshot.comercio_id !== COMERCIO_ID || snapshot.email !== EMAIL || snapshot.usuario_verificado !== true) {
    throw new Error('Snapshot sin identidad verificada de Bostico');
  }
  for (const table of TABLES) {
    if (!Array.isArray(snapshot[table]) || snapshot.counts?.[table] !== snapshot[table].length) throw new Error(`Snapshot incompleto: ${table}`);
    if (snapshot[table].some(row => row.comercio_id !== COMERCIO_ID)) throw new Error(`Otro comercio en ${table}`);
  }
  for (const tipo of ['maestros', 'operaciones', 'cierre']) {
    if (!snapshot.migraciones.some(m => m.estado === 'completado' && m.archivo_hash === HASH_INICIAL && m.resumen?.tipo === tipo)) {
      throw new Error(`No se encuentra la importación original completada de ${tipo}`);
    }
  }
}

// Clasifica cambios del origen. Un modificado es candidato a revisión, nunca
// autorización para sobrescribir el destino (stock, CAE, pagos o saldos).
export function baselineRows(snapshot) {
  const completed = new Set(snapshot.migraciones.filter(m => m.estado === 'completado').map(m => m.id));
  let rows = [...snapshot.migracion_staging_maestros, ...snapshot.migracion_staging_operaciones]
    .filter(s => snapshot.migraciones.some(m => m.id === s.migracion_id && m.archivo_hash === HASH_INICIAL && m.estado === 'completado'))
    ;
  for (const record of snapshot.historial_legacy.filter(r => r.tipo === 'BosticoIncrementalFuente' && completed.has(r.migracion_id))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const source = record.datos;
    if (!source?.entidad || !source.source_id || !source.data) throw new Error('Línea base incremental incompleta');
    rows = rows.filter(s => !(s.modulo === source.entidad && s.source_id === source.source_id));
    rows.push({ modulo: source.entidad, source_id: source.source_id, datos: source.data });
  }
  return rows;
}

export function compareEntity(entity, proposals, baselineRows, mappings, destinations, archivedIds = new Set()) {
  const proposed = group(proposals, row => text(row.sourceId));
  const original = group(baselineRows, row => text(row.source_id));
  const maps = group(mappings.filter(m => m.entidad === entity), m => text(m.id_origen));
  const inverseMaps = group(mappings.filter(m => m.entidad === entity), m => m.id_destino);
  const destinationById = new Map(destinations.map(row => [row.id, row]));
  const ids = new Set([...proposed.keys(), ...original.keys(), ...maps.keys()]);
  return [...ids].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).map(sourceId => {
    const newRows = proposed.get(sourceId) || [];
    const oldRows = original.get(sourceId) || [];
    const links = maps.get(sourceId) || [];
    const destinationIds = [...new Set(links.map(m => m.id_destino))];
    const reasons = [];
    const row = { entidad: entity, id_origen: sourceId, id_destino: destinationIds[0] || null };
    if (!sourceId || sourceId === 'sin-id') reasons.push('ID de origen inválido');
    if (newRows.length > 1) reasons.push('ID repetido en la nueva base');
    if (oldRows.length > 1) reasons.push('Staging original ambiguo');
    if (destinationIds.length > 1) reasons.push('ID de Access vinculado a varios destinos');
    if (destinationIds.some(id => new Set((inverseMaps.get(id) || []).map(m => text(m.id_origen))).size > 1)) reasons.push('Varios IDs de Access vinculados al mismo destino');
    if (destinationIds.some(id => !destinationById.has(id))) reasons.push('Destino ausente o fuera del comercio');
    if (reasons.length) return { ...row, clasificacion: 'conflictivo', motivos: reasons };
    if (!newRows.length) return { ...row, clasificacion: 'eliminado_en_origen', decision: 'conservar', antes_origen: oldRows[0]?.datos || null };
    const after = normalizeSource(entity, newRows[0].data);
    if (!links.length) {
      if (oldRows.length && archivedIds.has(sourceId) && same(normalizeSource(entity, oldRows[0].datos), after)) {
        return { ...row, clasificacion: 'sin_cambios', conservado_en_archivo: true };
      }
      if (oldRows.length || archivedIds.has(sourceId)) return { ...row, clasificacion: 'conflictivo', motivos: ['Registro previo sin equivalencia operativa; revisar archivo histórico'], despues_origen: after };
      return { ...row, clasificacion: 'nuevo', revision_destino_pendiente: true, despues_origen: after, advertencias: newRows[0].warnings || [] };
    }
    if (!oldRows.length) return { ...row, clasificacion: 'conflictivo', motivos: ['Equivalencia existente sin staging original'], despues_origen: after };
    const before = normalizeSource(entity, oldRows[0].datos);
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => !same(before[k], after[k]));
    return { ...row, clasificacion: changed.length ? 'modificado' : 'sin_cambios',
      campos_modificados: changed, revision_destino_pendiente: changed.length > 0,
      ...(changed.length ? { antes_origen: before, despues_origen: after,
        destino_actual: destinationById.get(destinationIds[0]), advertencias: newRows[0].warnings || [] } : {}) };
  });
}

export function compareArchive(type, proposals, archive) {
  const originals = group(archive.filter(r => r.tipo === type), r => text(r.source_id));
  const current = group(proposals, r => text(r.sourceId));
  return [...new Set([...originals.keys(), ...current.keys()])].map(id_origen => {
    const before = originals.get(id_origen) || [];
    const after = current.get(id_origen) || [];
    const row = { entidad: type, id_origen, destino: 'historial_legacy', cuenta_operativa: false };
    if (!id_origen || before.length > 1 || after.length > 1) return { ...row, clasificacion: 'conflictivo', motivos: ['ID archivado vacío o ambiguo'] };
    if (!after.length) return { ...row, clasificacion: 'eliminado_en_origen', decision: 'conservar' };
    if (!before.length) return { ...row, clasificacion: 'nuevo', revision_destino_pendiente: true, despues_origen: after[0].data };
    const normalize = data => type === 'CaeXventa'
      ? Object.fromEntries(['Id', 'cae', 'vtoCae', 'idVenta', 'idVentaAfip'].map(k => [k, text(data[k])]))
      : data;
    const changed = !same(normalize(before[0].datos), normalize(after[0].data));
    return { ...row, clasificacion: changed ? 'modificado' : 'sin_cambios', revision_destino_pendiente: changed,
      ...(changed ? { antes_origen: before[0].datos, despues_origen: after[0].data } : {}) };
  });
}

async function loadTransforms(outDir) {
  const ts = require('typescript');
  const result = [];
  for (const name of ['accessMigrationPreview', 'accessOperationalMigration', 'accessClosureMigration']) {
    const source = await readFile(resolve(ROOT, 'src/utils', `${name}.ts`), 'utf8');
    const file = resolve(outDir, `${name}.cjs`);
    await writeFile(file, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    result.push(require(file));
  }
  return result;
}

export function queryFailure(error, stderr = '') {
  // Clasificar el fallo sin imprimir credenciales, argumentos o contenido SQL.
  if (/\b(?:EPERM|EACCES)\b/.test(stderr)) return 'permisos locales del cliente; ejecutar la captura con la escalación correspondiente';
  if (error?.code === 'ENOENT') return 'cliente Supabase no disponible en PATH';
  if (error?.killed) return 'timeout local de la consulta';
  if (/connection timeout|connection terminated|status 54[34]|status 524/i.test(stderr)) return 'timeout de conexión de Supabase';
  const postgres = /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr);
  if (postgres) return `error PostgreSQL ${postgres[1]}; revisar la consulta y el esquema antes de repetir`;
  return `cliente Supabase terminó con código ${error?.code ?? 'desconocido'}`;
}

function runQuery(sql) {
  return new Promise((accept, reject) => execFile('supabase', ['db', 'query', '--linked', sql, '--output', 'json'],
    { cwd: ROOT, windowsHide: true, timeout: 45000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      // No imprimir stderr ni argumentos: no son necesarios para el informe.
      if (error) return reject(new Error(`Consulta SELECT incompleta: ${queryFailure(error, stderr)}; datos productivos no modificados por este script`));
      try {
        const start = stdout.indexOf('{');
        const end = stdout.lastIndexOf('}');
        const body = JSON.parse(stdout.slice(start, end + 1));
        if (!Array.isArray(body.rows)) throw new Error('Formato de consulta desconocido');
        accept(body.rows);
      } catch (e) { reject(e); }
    }));
}

export function snapshotQueries() {
  const identity = `EXISTS(SELECT 1 FROM public.comercio_usuarios cu JOIN auth.users u ON u.id=cu.user_id WHERE cu.comercio_id='${COMERCIO_ID}' AND cu.activo AND lower(u.email)='${EMAIL}')`;
  const metadata = `SELECT now() AS capturado_at, ${identity} AS usuario_verificado, ` + TABLES.map(table =>
    `(SELECT jsonb_build_object('cantidad',count(*),'huella',md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),''))) FROM public.${table} t WHERE comercio_id='${COMERCIO_ID}') AS ${table}`).join(', ') + ';';
  return { metadata, page: (table, offset) => {
    if (!TABLES.includes(table) || !Number.isInteger(offset) || offset < 0) throw new Error('Página inválida');
    return `SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) AS filas FROM (SELECT * FROM public.${table} WHERE comercio_id='${COMERCIO_ID}' ORDER BY id LIMIT 500 OFFSET ${offset}) t;`;
  } };
}

async function captureSnapshot(outDir) {
  const queries = snapshotQueries();
  const initial = (await runQuery(queries.metadata))[0];
  if (initial?.usuario_verificado !== true) throw new Error('Identidad de Bostico no verificada');
  const snapshot = { comercio_id: COMERCIO_ID, email: EMAIL, usuario_verificado: true,
    capturado_at: initial.capturado_at, counts: {} };
  for (const table of TABLES) {
    snapshot[table] = [];
    snapshot.counts[table] = Number(initial[table].cantidad);
    for (let offset = 0; offset < snapshot.counts[table]; offset += 500) {
      const page = (await runQuery(queries.page(table, offset)))[0]?.filas;
      if (!Array.isArray(page) || !page.length) throw new Error(`Extracción truncada: ${table}`);
      snapshot[table].push(...page);
    }
    console.log(`Leído ${table}: ${snapshot[table].length}`);
  }
  const final = (await runQuery(queries.metadata))[0];
  if (final?.usuario_verificado !== true || TABLES.some(t => !same(initial[t], final[t]))) throw new Error('Producción cambió durante la lectura; repetir captura');
  validateSnapshot(snapshot);
  await writeFile(resolve(outDir, 'snapshot.json'), JSON.stringify(snapshot));
  return snapshot;
}

export async function readRestTable(get, table) {
  if (!TABLES.includes(table)) throw new Error('Tabla REST no autorizada');
  const rows = [];
  let expected;
  for (let offset = 0; expected === undefined || offset < expected; offset += REST_PAGE_SIZE) {
    const page = await get(`/rest/v1/${table}?select=*&comercio_id=eq.${COMERCIO_ID}&order=id.asc&offset=${offset}&limit=${REST_PAGE_SIZE}`, offset === 0 ? { Prefer: 'count=exact' } : {});
    const total = /\/(\d+)$/.exec(page.range || '');
    if ((!total && expected === undefined) || !Array.isArray(page.data)) throw new Error(`Conteo REST incompleto: ${table}`);
    if (total && expected !== undefined && expected !== Number(total[1])) throw new Error(`Cambió el conteo de ${table}; repetir captura`);
    if (total) expected = Number(total[1]);
    if (!page.data.length && offset < expected) throw new Error(`Página REST vacía: ${table}`);
    rows.push(...page.data);
  }
  if (rows.length !== expected || rows.some(r => r.comercio_id !== COMERCIO_ID)) throw new Error(`Extracción REST incompleta o fuera de comercio: ${table}`);
  if (rows.some(r => !r.id) || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error(`IDs REST ausentes o duplicados: ${table}`);
  return rows;
}

async function captureRestSnapshot(outDir) {
  // Credencial existente, sólo en memoria; nunca guardar ni imprimir claves.
  const credentials = await new Promise((accept, reject) => execFile('supabase',
    ['projects', 'api-keys', '--project-ref', PROJECT_REF, '--reveal', '--output', 'json'],
    { cwd: ROOT, windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(queryFailure(error, stderr)));
      try { accept(JSON.parse(stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1))); }
      catch { reject(new Error('No se pudo leer la credencial existente de Supabase')); }
    }));
  const credential = credentials.find(k => k.name === 'service_role') || credentials.find(k => k.type === 'secret');
  const apiKey = credential?.api_key;
  if (!apiKey || typeof apiKey !== 'string') throw new Error('No hay una credencial de lectura administrativa utilizable');
  const headers = { apikey: apiKey, ...(apiKey.startsWith('eyJ') ? { Authorization: `Bearer ${apiKey}` } : {}) };
  const get = async (path, extra = {}) => {
    const response = await fetch(`https://${PROJECT_REF}.supabase.co${path}`, {
      method: 'GET', headers: { ...headers, ...extra }, signal: AbortSignal.timeout(30000), redirect: 'error',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Lectura GET incompleta: HTTP ${response.status}, código ${/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'sin código'}`);
    }
    return { data: await response.json(), range: response.headers.get('content-range') };
  };
  const memberships = (await get(`/rest/v1/comercio_usuarios?select=user_id&comercio_id=eq.${COMERCIO_ID}&activo=eq.true`)).data;
  let verified = false;
  for (const membership of memberships) {
    if (!/^[0-9a-f-]{36}$/i.test(membership.user_id)) throw new Error('Usuario del comercio inválido');
    const user = (await get(`/auth/v1/admin/users/${membership.user_id}`)).data;
    if (text(user.email).toLowerCase() === EMAIL) verified = true;
  }
  if (!verified) throw new Error('Identidad de Bostico no verificada por API');
  const readTable = table => readRestTable(get, table);
  const snapshot = { comercio_id: COMERCIO_ID, email: EMAIL, usuario_verificado: true,
    capturado_at: new Date().toISOString(), transporte: 'REST_GET', counts: {}, fingerprints: {} };
  for (let start = 0; start < TABLES.length; start += 1) {
    const batch = TABLES.slice(start, start + 1);
    const results = await Promise.allSettled(batch.map(readTable));
    for (let i = 0; i < batch.length; i++) {
      if (results[i].status === 'rejected') throw results[i].reason;
      const table = batch[i];
      snapshot[table] = results[i].value;
      snapshot.counts[table] = snapshot[table].length;
      snapshot.fingerprints[table] = sha256(JSON.stringify(canonical(snapshot[table])));
      console.log(`Leído por API ${table}: ${snapshot.counts[table]}`);
    }
  }
  for (const table of TABLES) {
    const check = await readTable(table);
    if (sha256(JSON.stringify(canonical(check))) !== snapshot.fingerprints[table]) throw new Error(`Producción cambió en ${table}; repetir captura`);
  }
  snapshot.verificado_at = new Date().toISOString();
  validateSnapshot(snapshot);
  await writeFile(resolve(outDir, 'snapshot.json'), JSON.stringify(snapshot));
  return snapshot;
}

function originReconciliation(tables) {
  const receipts = new Map(tables.Comprobantes.map(r => [text(value(r, 'Codigo')), r]));
  const subtract = row => {
    const code = text(value(row, 'idComprobante'));
    return ['3', '8', '13'].includes(code) || [true, -1, 1, 'true', 'True'].includes(value(receipts.get(code) || {}, 'Resta'));
  };
  const balances = (sales, payments, owner) => {
    const result = new Map();
    const add = (id, amount) => result.set(id, (result.get(id) || 0) + amount);
    for (const row of sales) if (text(value(row, 'idCondicion_venta')) === '2' && text(value(row, 'idComprobante')) !== '333') {
      add(text(value(row, owner)), money(value(row, 'monto')) * (subtract(row) ? -1 : 1));
    }
    for (const row of payments) add(text(value(row, owner)), -money(value(row, 'importe')));
    return [...result].map(([id_origen, saldo_centavos]) => ({ id_origen, saldo_centavos }));
  };
  return { moneda: 'ARS', metodo: 'Importes en centavos; cuenta corriente condición 2, notas con signo, pagos negativos conservados',
    clientes: balances(tables.Ventas, tables.Pagos, 'idCliente'),
    proveedores: { saldo_operativo: null, motivo: 'Compras y pagos conservados como archivo histórico; condición de pago no equiparable a Ventas', compras_archivo: tables.CompraProveedor.length, pagos_archivo: tables.PagosProveedores.length },
    pagos_cero: tables.Pagos.filter(r => money(value(r, 'importe')) === 0).length,
    pagos_negativos: tables.Pagos.filter(r => money(value(r, 'importe')) < 0).length,
    stock_fraccionario: tables.Articulos.filter(r => !Number.isInteger(Number(value(r, 'stock')))).map(r => ({ id_origen: text(value(r, 'idArticulo')), stock: value(r, 'stock') })),
    cae_ambiguos: [...group(tables.CaeXventa, r => text(value(r, 'idVenta')))].filter(([, rows]) => rows.length > 1).map(([id_origen]) => id_origen) };
}

export async function prepare({ source, outDir, snapshotFile, capture = false, rest = false }) {
  const privateRoot = resolve(ROOT, 'private-backups');
  outDir = resolve(outDir);
  if (!outDir.toLowerCase().startsWith((privateRoot + '/').replaceAll('/', '\\').toLowerCase()) &&
      !outDir.toLowerCase().startsWith((privateRoot + '/').toLowerCase())) throw new Error('Los artefactos deben quedar dentro de private-backups');
  await mkdir(outDir, { recursive: true });
  const buffer = await readFile(source);
  const hash = sha256(buffer);
  const MDBReader = require('mdb-reader').default || require('mdb-reader');
  const reader = new MDBReader(buffer);
  const missing = ACCESS_TABLES.filter(t => !reader.getTableNames().includes(t));
  if (missing.length) throw new Error(`Faltan tablas Access: ${missing.join(', ')}`);
  const tables = Object.fromEntries(ACCESS_TABLES.map(t => [t, reader.getTable(t).getData()]));
  const frozen = resolve(outDir, `BDsiagro-${hash}.mdb`);
  await writeFile(frozen, buffer, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  if (sha256(await readFile(frozen)) !== hash) throw new Error('La copia privada no coincide con el origen');
  const [masters, operations, closure] = await loadTransforms(outDir);
  const proposed = {
    rubros: masters.previewRows('Rubro', tables.Rubro, COMERCIO_ID),
    marcas: masters.previewRows('Marca', tables.Marca, COMERCIO_ID),
    proveedores: masters.previewProviderRows(tables.Proveedores, tables.CondIva, COMERCIO_ID),
    clientes: masters.previewClientRows(tables.Clientes, tables.Domicilio_x_cliente, tables.Localidades, tables.Provincias, COMERCIO_ID, tables.CondIva),
    productos: masters.previewProductRows(tables.Articulos, tables.Articulos, tables.Rubro, tables.Marca, tables.Proveedores, COMERCIO_ID),
    ...operations.buildOperationalPayload(tables),
  };
  delete proposed.presupuestosOmitidos;
  const closurePayload = closure.buildClosurePayload(tables);
  const report = { comercio_id: COMERCIO_ID, email: EMAIL, archivo_origen: resolve(source), archivo_privado: frozen,
    sha256: hash, hash_inicial: HASH_INICIAL, archivo_tamano: buffer.length, preparado_at: new Date().toISOString(),
    estado: 'pendiente_lectura_produccion', aplicable: false, produccion_modificada: false,
    tablas_origen: Object.fromEntries(ACCESS_TABLES.map(t => [t, tables[t].length])),
    conciliacion_origen: originReconciliation(tables),
    bloqueos: ['No se recuperó todavía el snapshot completo de producción'],
    siguientes_controles: ['Conciliación de destino y cambios hechos en Vortex', 'Validación de CAE y Recibos C protegidos',
      'Revisión de dependencias, duplicados naturales y registros eliminados', 'SQL transaccional y reversión con imágenes antes/después',
      'Autorización expresa del delta concreto antes de modificar producción'] };
  await writeFile(resolve(outDir, 'consultas-snapshot.json'), JSON.stringify({ metadata: snapshotQueries().metadata,
    primeras_paginas: Object.fromEntries(TABLES.map(t => [t, snapshotQueries().page(t, 0)])) }, null, 2));
  await writeFile(resolve(outDir, 'propuestas-origen.json'), JSON.stringify({ source_hash: hash, comercio_id: COMERCIO_ID, email: EMAIL, proposed, cierre: closurePayload, cae: tables.CaeXventa }));
  await writeFile(resolve(outDir, 'informe.json'), JSON.stringify(report, null, 2));
  let snapshot;
  try {
    if (capture) snapshot = rest ? await captureRestSnapshot(outDir) : await captureSnapshot(outDir);
    else if (snapshotFile) snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
  } catch (e) {
    report.error_lectura = e.message;
    await writeFile(resolve(outDir, 'informe.json'), JSON.stringify(report, null, 2));
    throw e;
  }
  if (snapshot) {
    validateSnapshot(snapshot);
    const originals = baselineRows(snapshot);
    // Las excepciones archivadas no aparecen en staging. Quince pagos negativos
    // sí tienen mapa porque se repararon como débitos en la primera migración.
    for (const [type, table, entity] of [['Pagos_no_operativos', 'Pagos', 'pagos'], ['Cheques_no_operativos', 'Cheques', 'cheques'], ['Detalle_Venta_huerfano', 'Detalle_Venta', 'items']]) {
      const archived = snapshot.historial_legacy.filter(r => r.tipo === type);
      const raw = archived.map(r => Object.fromEntries(Object.entries(r.datos).map(([k, v]) =>
        [k, typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v])));
      const transformed = operations.buildOperationalPayload({ Articulos: tables.Articulos, Banco: tables.Banco, [table]: raw })[entity];
      for (const row of transformed) if (!originals.some(s => s.modulo === entity && s.source_id === row.sourceId)) {
        originals.push({ modulo: entity, source_id: row.sourceId, datos: row.data, archivado: true });
      }
    }
    const archivedTypes = { pagos: /pago(?!.*proveedor)/i, cheques: /cheque/i, items: /detalle.*venta/i };
    const classifications = Object.fromEntries(Object.entries(proposed).map(([entity, rows]) => [entity,
      compareEntity(entity, rows, originals.filter(s => s.modulo === entity), snapshot.migracion_id_map, snapshot[TARGET[entity] || entity],
        new Set(snapshot.historial_legacy.filter(r => archivedTypes[entity]?.test(r.tipo)).map(r => text(r.source_id)))) ]));
    for (const [type, id] of [['CompraProveedor', 'idCompraProveedores'], ['PagosProveedores', 'idPago'], ['CaeXventa', 'Id']]) {
      classifications[type] = compareArchive(type, tables[type].map(r => ({ sourceId: text(value(r, id)), data: r })), snapshot.historial_legacy);
    }
    report.estado = 'comparacion_origen_preparada_revision_destino_pendiente';
    report.bloqueos = ['Delta pendiente de conciliación contra destino, archivo histórico, presupuestos y CAE; no aplicar aún'];
    report.conteos = Object.fromEntries(Object.entries(classifications).map(([entity, rows]) => [entity,
      Object.fromEntries(['nuevo', 'modificado', 'sin_cambios', 'eliminado_en_origen', 'conflictivo'].map(k => [k, rows.filter(r => r.clasificacion === k).length]))]));
    await writeFile(resolve(outDir, 'comparacion-origen.json'), JSON.stringify(classifications, null, 2));
    await writeFile(resolve(outDir, 'informe.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ estado: report.estado, comercio_id: COMERCIO_ID, sha256: hash, conteos: report.conteos, informe: resolve(outDir, 'informe.json'), aplicable: false }, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const allowed = new Set(['--source', '--out', '--snapshot', '--capture', '--rest']);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Opción no admitida: ${args[i]}`);
    if (!['--capture', '--rest'].includes(args[i])) { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Falta valor de opción'); i++; }
  }
  if (!option('--source') || !option('--out')) throw new Error('Uso: node scripts/preparar-bostico-incremental.mjs --source <mdb> --out <private-backups/carpeta> [--capture | --snapshot <json>]');
  if (args.includes('--capture') && option('--snapshot')) throw new Error('Elegir --capture o --snapshot');
  if (args.includes('--rest') && !args.includes('--capture')) throw new Error('--rest requiere --capture');
  await prepare({ source: option('--source'), outDir: option('--out'), snapshotFile: option('--snapshot'), capture: args.includes('--capture'), rest: args.includes('--rest') });
}
