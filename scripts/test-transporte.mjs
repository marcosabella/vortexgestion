// PostgreSQL temporal y dependencias mínimas locales. Nunca conecta a Supabase.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/utils/transporte.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { totalTransporte, alertaTransporte } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const tarifa = { base: 100, km_incluidos: 10, precio_km: 5, precio_hora: 20 };
assert.equal(totalTransporte({ tarifa_snapshot: tarifa, precio_manual: null, km_facturables: 15, horas_espera: 2, adicionales: 10 }), 175);
assert.equal(totalTransporte({ tarifa_snapshot: tarifa, precio_manual: 250, km_facturables: 100, horas_espera: 3, adicionales: 10 }), 260);
assert.equal(totalTransporte({ tarifa_snapshot: tarifa, precio_manual: null, km_facturables: 2, horas_espera: 0, adicionales: 0 }), 100);
assert.equal(totalTransporte({ precio_km: 4400, precio_manual: null, tarifa_snapshot: null, km_facturables: 40, horas_espera: 0, adicionales: 0 }), 176000);
assert.equal(totalTransporte({ precio_km: 4400, precio_manual: null, tarifa_snapshot: null, km_facturables: 80, horas_espera: 0, adicionales: 0 }), 352000);
assert.equal(totalTransporte({ precio_km: 123.45, precio_manual: null, tarifa_snapshot: null, km_facturables: 2.5, horas_espera: 0, adicionales: 10 }), 318.63);
const plan = { proxima_fecha: '2026-12-01', proximo_km: 1000, proximas_horas: 100, aviso_km: 100, aviso_horas: 10, aviso_dias: 5 };
const hoy = new Date(2026, 10, 10);
assert.equal(alertaTransporte(plan, { kilometraje: 1000, horas: 0 }, hoy), 'vencido');
assert.equal(alertaTransporte(plan, { kilometraje: 900, horas: 0 }, hoy), 'proximo');
assert.equal(alertaTransporte(plan, { kilometraje: 0, horas: 100 }, hoy), 'vencido');
assert.equal(alertaTransporte(plan, { kilometraje: 0, horas: 0 }, hoy), 'vigente');
console.log('OK 10 casos de tarifas, precio por km y vencimiento por primer criterio');

const pgBin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const tempRoot = realpathSync(os.tmpdir());
const cluster = mkdtempSync(path.join(tempRoot, 'vortex-transporte-test-'));
const dataDir = path.join(cluster, 'data');
const server = net.createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const command = (name, args, input) => spawnSync(path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')), args, { input, encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' });
const checked = r => { if (r.error) throw r.error; if (r.status !== 0) throw Error(r.stderr || r.stdout || 'Falló PostgreSQL local'); return (r.stdout || '').trim(); };
const sql = text => checked(command('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], text));
const migration = name => readFileSync(path.join('supabase/migrations', name), 'utf8');
const uuid = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [tenant, other, admin, driver, client, foreign] = [1, 2, 3, 4, 5, 6].map(uuid);
const actor = `SET app.test_user='${admin}'; SET ROLE authenticated;`;
const driverActor = `SET app.test_user='${driver}'; SET ROLE authenticated;`;
const json = d => `'${JSON.stringify(d).replace(/'/g, "''")}'::jsonb`;
const op = (action, data, id = null, version = null) => `SELECT public.transporte_operar('${tenant}','${action}',${id ? `'${id}'` : 'NULL'},${version ?? 'NULL'},${json(data)});`;
const fail = (statement, error) => `SELECT test_error($stmt$${statement}$stmt$,'${error}');`;
const check = (query, label) => `SELECT test_assert((${query}),'${label}');`;
let started = false, passed = 0;
const test = (label, statement) => { sql(statement); passed++; console.log('OK ' + label); };
try {
  console.log('Inicializando PostgreSQL temporal local…');
  checked(command('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']));
  checked(command('pg_ctl', ['-D', dataDir, '-l', path.join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])); started = true;
  sql(readFileSync('scripts/fixtures/taller-schema.sql', 'utf8'));
  sql(`ALTER TABLE proveedores ADD nombre text DEFAULT '', ADD apellido text DEFAULT '', ADD razon_social text DEFAULT '';
    ALTER TABLE ventas ADD idempotency_key uuid, ADD idempotency_payload jsonb;
    CREATE UNIQUE INDEX ON ventas(comercio_id,idempotency_key);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT,INSERT ON storage.objects TO authenticated;
    CREATE TABLE gastos_egresos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid,fecha date,categoria text,concepto text,proveedor_id uuid,monto numeric CHECK(monto>0),medio_pago text,estado text,numero_comprobante text,observaciones text,CHECK(medio_pago<>'cuenta_corriente' OR proveedor_id IS NOT NULL));
    GRANT SELECT ON gastos_egresos TO authenticated;`);
  sql(migration('20260609150000_presupuestos.sql'));
  sql(migration('20260921170000_corregir_confirmacion_presupuesto_stock.sql'));
  sql('GRANT SELECT ON presupuestos,presupuesto_items,presupuesto_pagos TO authenticated;');
  sql(migration('20260908130000_venta_items_precio_iva_decimal.sql'));
  sql(migration('20261110100000_vortex_transporte.sql'));
  // Fixture del permiso central; permite probar la nueva operación sin importar
  // las dependencias de todos los módulos de Gestión en esta base temporal.
  sql(`CREATE FUNCTION public.vortex_permiso(c uuid,m text,a text) RETURNS boolean LANGUAGE sql AS $$ SELECT public.user_is_comercio_admin(c) AND coalesce(current_setting('app.test_editar',true),'true')<>'false' $$;`);
  sql(migration('20261111100000_transporte_eliminar_registros.sql'));
  sql(migration('20261111101000_transporte_validar_equipo_servicio.sql'));
  sql(migration('20261111102000_transporte_documentacion_opcional.sql'));
  sql(migration('20261111103000_transporte_liquidacion_recargos_pago.sql'));
  sql(`INSERT INTO comercio VALUES('${tenant}'),('${other}'); INSERT INTO comercio_usuarios VALUES('${tenant}','${admin}','admin',true),('${tenant}','${driver}','operador',true);
    INSERT INTO comercio_parametrizacion(comercio_id,parametros) VALUES('${tenant}','{"modulos":{"transporte":true}}'),('${other}','{"modulos":{"transporte":true}}');
    INSERT INTO clientes VALUES('${client}','${tenant}','Cliente','Local',NULL),('${foreign}','${other}','Ajeno','',NULL);`);
  const unit = sql(actor + op('unidad', { nombre: 'Grúa', patente: 'AA123AA', tipo: 'grua', kilometraje: 100, horas: 0 }));
  const chauffeur = sql(actor + op('chofer', { nombre: 'Chofer', user_id: driver }));
  const serviceData = { tipo: 'auxilio', cliente_id: client, origen: 'Retiro', destino: 'Taller', carga: 'Auto', precio_manual: 121, iva: 21, unidad_id: unit, chofer_id: chauffeur };
  const service = sql(actor + op('servicio', serviceData));
  test('Unidad y equipo iguales muestran validación clara antes del CHECK', actor + fail(op('servicio', { ...serviceData, equipo_id: unit }), 'La unidad principal y el equipo adicional deben ser distintos') + check('SELECT count(*)=1 FROM transporte_servicios', 'alta inválida sin registros parciales'));
  const currentVersion = id => Number(sql(`SELECT version FROM transporte_servicios WHERE id='${id}'`));
  const state = (id, value, data = {}) => op('estado', { estado: value, ...data }, id, currentVersion(id));
  test('Aislamiento: rechaza cliente ajeno y oculta datos de otra empresa', actor + fail(op('servicio', { ...serviceData, cliente_id: foreign }), 'transporte_relacion_de_otro_comercio') + check(`SELECT count(*)=0 FROM transporte_unidades WHERE comercio_id='${other}'`, 'RLS por comercio'));
  test('Operador ve asignados y no puede administrar', driverActor + check(`jsonb_array_length(transporte_datos('${tenant}')->'servicios')=1`, 'asignados visibles') + check(`NOT (transporte_datos('${tenant}')->'servicios'->0 ? 'total')`, 'importe oculto') + fail(op('unidad', { nombre: 'No autorizado' }), 'transporte_solo_administracion'));
  test('Estado inválido y versión vieja rechazados', actor + fail(state(service, 'finalizado'), 'transporte_transicion_invalida') + fail(op('estado', { estado: 'asignado' }, service, 0), 'transporte_version_desactualizada'));
  test('Asignación y salida registran lectura', actor + state(service, 'asignado'));
  test('Chofer inicia servicio con odómetro', driverActor + state(service, 'en_camino', { km_salida: 100 }));
  test('Asignación iniciada protegida', actor + fail(op('servicio', { ...serviceData, unidad_id: null }, service, currentVersion(service)), 'transporte_asignacion_protegida_servicio_iniciado'));
  const second = sql(actor + op('servicio', serviceData));
  sql(actor + state(second, 'asignado'));
  test('Unidad y chofer ocupados rechazados', actor + fail(state(second, 'en_camino', { km_salida: 100 }), 'transporte_unidad_o_chofer_ocupado'));
  sql(driverActor + state(service, 'en_lugar'));
  sql(driverActor + state(service, 'trasladando'));
  test('Kilómetros de tramos no superan recorrido', driverActor + fail(state(service, 'finalizado', { km_llegada: 120, km_traslado: 50 }), 'transporte_tramos_superan_recorrido_real'));
  test('Finalización conserva kilometraje e historial', driverActor + state(service, 'finalizado', { km_llegada: 120, km_traslado: 20 }) + actor + check(`SELECT kilometraje=120 FROM transporte_unidades WHERE id='${unit}'`, 'odometro actualizado'));
  const unassigned = sql(actor + op('servicio', { ...serviceData, unidad_id: null, chofer_id: null }));
  test('Cancelación sin unidad o chofer', actor + state(unassigned, 'cancelado', { detalle: 'Cliente desistió' }));
  test('Gasto sin proveedor se registra pendiente', actor + op('gasto', { unidad_id: unit, fecha: '2026-11-10', categoria: 'Peajes', concepto: 'Peaje', monto: 100 }) + check("SELECT count(*)=1 FROM gastos_egresos WHERE estado='pendiente' AND medio_pago='otro'", 'gasto sin pago'));
  test('Lecturas no retroceden', actor + fail(op('lectura', { unidad_id: unit, kilometraje: 110, horas: 0, motivo: 'Lectura' }), 'transporte_lectura_inferior_o_unidad_invalida'));
  const tariff = sql(actor + op('tarifa', { nombre: 'Convenio', tipo: 'auxilio', base: 100, km_incluidos: 10, precio_km: 5, precio_hora: 20, iva: 21, vigente_desde: '2020-01-01' }));
  const pricedData = { ...serviceData, precio_manual: null, tarifa_id: tariff, km_facturables: 15, horas_espera: 2, adicionales: 10 };
  const priced = sql(actor + op('servicio', pricedData));
  sql(`UPDATE transporte_tarifas SET base=900 WHERE id='${tariff}'`);
  test('Tarifa aplicada conserva snapshot tras actualización', actor + op('servicio', pricedData, priced, currentVersion(priced)) + check(`SELECT total=175 FROM transporte_servicios WHERE id='${priced}'`, 'snapshot original'));
  const maintenancePlan = sql(actor + op('plan', { unidad_id: unit, nombre: 'Service', intervalo_km: 1000, proximo_km: 1000, intervalo_dias: 30, proxima_fecha: '2026-11-10' }));
  test('Mantenimiento realizado actualiza próximos vencimientos', actor + op('mantenimiento', { unidad_id: unit, plan_id: maintenancePlan, fecha: '2026-11-10', estado: 'realizado', tareas: 'Cambio de aceite', kilometraje: 120, horas: 0 }) + check(`SELECT proximo_km=1120 AND proxima_fecha='2026-12-10' FROM transporte_planes WHERE id='${maintenancePlan}'`, 'vencimientos renovados'));
  const budget = sql(actor + op('presupuesto', { servicios: [second] }));
  test('Presupuesto vinculado e idempotente', actor + check(`${op('presupuesto', { servicios: [second] }).replace(/;$/, '')}='${budget}'::uuid`, 'mismo presupuesto') + check(`SELECT total=121 FROM presupuestos WHERE id='${budget}'`, 'total presupuesto'));
  const invoice = op('facturar', { servicios: [service], tipo_comprobante: 'recibo_x', modalidad: 'cta_cte', pagos: [], idempotency_key: uuid(20) });
  for (const presentacion of ['pendiente_autorizacion','observado','rechazado']) {
    sql(actor + op('presentacion', { presentacion }, service, currentVersion(service)));
    test(`Facturar respeta revisión explícita: ${presentacion}`, actor + fail(invoice, 'Finalizá el servicio y revisá'));
  }
  sql(actor + op('presentacion', { presentacion: 'pendiente_documentacion' }, service, currentVersion(service)));
  test('Liquidación directa sin presupuesto ni documentos', actor + check(`SELECT presupuesto_id IS NULL AND presentacion='pendiente_documentacion' FROM transporte_servicios WHERE id='${service}'`, 'servicio directo') + check(`SELECT count(*)=0 FROM transporte_adjuntos WHERE servicio_id='${service}'`, 'sin documentos'));
  test('No factura un servicio que todavía no finalizó', actor + fail(op('facturar', { servicios: [second], tipo_comprobante: 'recibo_x', modalidad: 'cta_cte', pagos: [], idempotency_key: uuid(22) }), 'Finalizá el servicio y revisá'));
  const sale = sql(actor + invoice);
  test('Venta real reutiliza función de Gestión y vincula servicio', actor + check(`SELECT total=121 AND tipo_pago='cta_cte' FROM ventas WHERE id='${sale}'`, 'total y modalidad') + check(`SELECT venta_id='${sale}' FROM transporte_servicios WHERE id='${service}'`, 'venta vinculada'));
  test('Reintento no duplica venta ni pago', actor + check(`${invoice.replace(/;$/, '')}='${sale}'::uuid`, 'misma venta') + check('SELECT count(*)=1 FROM ventas', 'venta única') + check('SELECT count(*)=1 FROM pagos_venta', 'pago único'));
  test('Storage privado y helpers no ejecutables', check("SELECT NOT public FROM storage.buckets WHERE id='transporte'", 'bucket privado') + check("NOT has_function_privilege('authenticated','transporte_registrar_lectura(uuid,uuid,uuid,numeric,numeric,text)','EXECUTE')", 'helper privado'));
  const remove = (section, id, version = null) => op('eliminar', { seccion: section }, id, version);
  const unused = sql(actor + op('unidad', { nombre: 'Sin uso', patente: 'AB123CD', tipo: 'grua', kilometraje: 0, horas: 0 }));
  test('Eliminar requiere administración', driverActor + fail(remove('unidades', unused), 'transporte_solo_administracion'));
  test('Eliminar requiere permiso de edición del backend', actor + `SET app.test_editar='false';` + fail(remove('unidades', unused), 'No tenés permiso para eliminar registros de Transporte') + `SET app.test_editar='true';`);
  test('Eliminar no acepta secciones arbitrarias ni lecturas históricas', actor + fail(remove('lecturas', unused), 'transporte_eliminacion_no_permitida') + fail(remove('unidades; DROP TABLE comercio', unused), 'transporte_eliminacion_no_permitida'));
  sql(`INSERT INTO transporte_unidades(id,comercio_id,nombre,patente,tipo) VALUES('${uuid(90)}','${other}','Ajena','AJENA','grua')`);
  test('Eliminar valida tenant en el servidor', actor + fail(remove('unidades', uuid(90)), 'transporte_registro_no_disponible') + check(`SELECT count(*)=1 FROM transporte_unidades WHERE id='${unused}'`, 'registro local conservado'));
  test('Eliminar unidad sin uso elimina solo su lectura inicial', actor + remove('unidades', unused) + check(`SELECT count(*)=0 FROM transporte_unidades WHERE id='${unused}'`, 'unidad eliminada') + check(`SELECT count(*)=0 FROM transporte_lecturas WHERE unidad_id='${unused}'`, 'lectura inicial eliminada'));
  test('Unidad y tarifa utilizadas no se eliminan', actor + fail(remove('unidades', unit), 'La unidad tiene registros vinculados') + fail(remove('tarifas', tariff), 'El registro tiene vínculos'));
  const draft = sql(actor + op('servicio', { ...serviceData, unidad_id: null, chofer_id: null }));
  test('Eliminar servicio exige versión vigente', actor + fail(remove('servicios', draft, 0), 'transporte_version_desactualizada'));
  test('Eliminar solicitud sin actividad', actor + remove('servicios', draft, currentVersion(draft)) + check(`SELECT count(*)=0 FROM transporte_servicios WHERE id='${draft}'`, 'solicitud eliminada') + check(`SELECT count(*)=0 FROM transporte_eventos WHERE servicio_id='${draft}'`, 'sin eventos huérfanos'));
  test('Servicio facturado conserva historial y venta', actor + fail(remove('servicios', service, currentVersion(service)), 'Solo se eliminan solicitudes') + check(`SELECT count(*)=1 FROM ventas WHERE id='${sale}'`, 'venta conservada'));
  const planned = sql(actor + op('mantenimiento', { unidad_id: unit, fecha: '2026-11-10', estado: 'programado', tareas: 'Pendiente', kilometraje: 120, horas: 0 }));
  test('Eliminar mantenimiento programado sin gastos', actor + remove('mantenimientos', planned) + check(`SELECT count(*)=0 FROM transporte_mantenimientos WHERE id='${planned}'`, 'mantenimiento eliminado'));
  test('Helper de eliminación no ejecutable directamente', check("NOT has_function_privilege('authenticated','transporte_eliminar_registro(uuid,text,uuid,integer)','EXECUTE')", 'helper privado'));
  const crearFinalizado = () => sql(`INSERT INTO transporte_servicios(comercio_id,tipo,cliente_id,origen,destino,carga,estado,total) VALUES('${tenant}','auxilio','${client}','Retiro','Taller','Servicio directo','finalizado',121) RETURNING id;`);
  const efectivo = crearFinalizado();
  const cobroEfectivo = op('facturar', { servicios: [efectivo], tipo_comprobante: 'factura_b', modalidad: 'contado', pagos: [{ tipo_pago: 'contado', monto: 121 }], idempotency_key: uuid(40) });
  const ventaEfectivo = sql(actor + cobroEfectivo);
  test('Liquidación registra Factura B al contado y su pago', actor + check(`SELECT tipo_comprobante='factura_b' AND tipo_pago='contado' AND total=121 FROM ventas WHERE id='${ventaEfectivo}'`, 'tipo y condición elegidos') + check(`SELECT count(*)=1 FROM pagos_venta WHERE venta_id='${ventaEfectivo}' AND tipo_pago='contado' AND monto=121`, 'cobro registrado') + check(`SELECT count(*)=0 FROM cuenta_corriente WHERE venta_id='${ventaEfectivo}'`, 'sin deuda'));
  const tarjeta = uuid(41); sql(`INSERT INTO tarjetas_credito VALUES('${tarjeta}','${tenant}')`);
  const financiado = crearFinalizado();
  const ventaFinanciada = sql(actor + op('facturar', { servicios: [financiado], tipo_comprobante: 'factura_a', modalidad: 'contado', pagos: [{ tipo_pago: 'contado', monto: 21 }, { tipo_pago: 'tarjeta', tarjeta_id: tarjeta, monto: 110, cuotas: 3, recargo_cuotas: 10 }], idempotency_key: uuid(42) }));
  test('Liquidación admite pagos combinados y recargo de tarjeta', actor + check(`SELECT tipo_comprobante='factura_a' AND total=131 FROM ventas WHERE id='${ventaFinanciada}'`, 'total con financiación') + check(`SELECT count(*)=2 AND sum(monto)=131 FROM pagos_venta WHERE venta_id='${ventaFinanciada}'`, 'pagos conservados'));
  const incompleto = crearFinalizado();
  test('Contado sin pagos y pagos que no cubren el total se rechazan', actor + fail(op('facturar', { servicios: [incompleto], tipo_comprobante: 'recibo_x', modalidad: 'contado', pagos: [], idempotency_key: uuid(43) }), 'ventas_pago_requerido') + fail(op('facturar', { servicios: [incompleto], tipo_comprobante: 'recibo_x', modalidad: 'contado', pagos: [{ tipo_pago: 'contado', monto: 100 }], idempotency_key: uuid(43) }), 'ventas_pagos_no_coinciden') + check(`SELECT venta_id IS NULL FROM transporte_servicios WHERE id='${incompleto}'`, 'sin venta parcial'));
  const totalesPrevios = sql('SELECT string_agg(id::text||\':\'||total::text,\',\' ORDER BY id) FROM transporte_servicios');
  sql(migration('20261112120000_transporte_precio_por_km.sql'));
  assert.equal(sql('SELECT string_agg(id::text||\':\'||total::text,\',\' ORDER BY id) FROM transporte_servicios'), totalesPrevios, 'La migración conserva todos los importes anteriores');
  test('Precio por km conserva importe fijo y tarifa anteriores', actor + check(`SELECT precio_km IS NULL AND total=121 FROM transporte_servicios WHERE id='${service}'`, 'fijo conservado') + check(`SELECT precio_km IS NULL AND total=175 FROM transporte_servicios WHERE id='${priced}'`, 'tarifa conservada'));
  const porKm = { ...serviceData, precio_manual: null, precio_km: 4400, km_facturables: 40, horas_espera: 0, adicionales: 0 };
  const servicioKm = sql(actor + op('servicio', porKm));
  test('Backend calcula 40 km a 4400 finales sin sumar IVA nuevamente', actor + check(`SELECT total=176000 AND precio_km=4400 AND precio_manual IS NULL FROM transporte_servicios WHERE id='${servicioKm}'`, 'total por km'));
  test('Precio y km positivos, sin mezclar modos de cobro', actor
    + fail(op('servicio', { ...porKm, km_facturables: 0 }), 'mayores a cero')
    + fail(op('servicio', { ...porKm, precio_km: -1 }), 'mayores a cero')
    + fail(op('servicio', { ...porKm, precio_manual: 4400 }), 'no se combina')
    + fail(op('servicio', { ...porKm, tarifa_id: tariff }), 'no se combina')
    + fail(op('servicio', { ...porKm, horas_espera: 1 }), 'no se combina')
    + fail(op('servicio', { ...porKm, precio_km: 4400.001 }), 'hasta dos decimales')
    + fail(op('servicio', { ...porKm, km_facturables: 40.01 }), 'hasta dos decimales'));
  test('Precio por km valida cliente del mismo comercio', actor + fail(op('servicio', { ...porKm, cliente_id: foreign }), 'transporte_relacion_de_otro_comercio'));
  test('Operador no accede al nuevo precio por km', driverActor + check(`SELECT NOT (x ? 'precio_km') FROM jsonb_array_elements(public.transporte_datos('${tenant}')->'servicios') x WHERE x->>'id'='${servicioKm}'`, 'precio privado'));
  const decimal = sql(actor + op('servicio', { ...porKm, precio_km: 123.45, km_facturables: 2.5, adicionales: 10 }));
  test('Redondea precio por km y adicionales a dos decimales', actor + check(`SELECT total=318.63 FROM transporte_servicios WHERE id='${decimal}'`, 'redondeo monetario'));
  sql(actor + state(servicioKm, 'asignado'));
  sql(driverActor + state(servicioKm, 'en_camino', { km_salida: 120 }));
  sql(driverActor + state(servicioKm, 'en_lugar'));
  sql(driverActor + state(servicioKm, 'trasladando'));
  sql(driverActor + state(servicioKm, 'finalizado', { km_llegada: 200, km_aproximacion: 20, km_traslado: 20, km_retorno: 40 }));
  test('Recorrer 80 km conserva cobro sobre 40 km facturables', actor + check(`SELECT total=176000 AND km_llegada-km_salida=80 AND km_facturables=40 FROM transporte_servicios WHERE id='${servicioKm}'`, 'recorrido separado del cobro'));
  const ventaKm = sql(actor + op('facturar', { servicios: [servicioKm], tipo_comprobante: 'recibo_x', modalidad: 'cta_cte', pagos: [], idempotency_key: uuid(44) }));
  test('Facturación por km mantiene total final y desglose de IVA', actor + check(`SELECT total=176000 AND round(subtotal+total_iva,2)=176000 FROM ventas WHERE id='${ventaKm}'`, 'importe final') + check(`SELECT sum(monto)=176000 FROM pagos_venta WHERE venta_id='${ventaKm}'`, 'cuenta corriente'));
  console.log(`${passed} pruebas PostgreSQL y 10 casos de dominio correctos. Dependencias externas simuladas en fixture; sin validación remota ni UI.`);
} catch (error) {
  console.error(error);
  throw error;
} finally {
  if (started) checked(command('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']));
  const target = path.resolve(cluster);
  assert.ok(target.startsWith(tempRoot + path.sep) && path.basename(target).startsWith('vortex-transporte-test-'));
  rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
