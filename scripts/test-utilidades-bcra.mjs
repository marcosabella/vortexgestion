// Pruebas locales con respuestas ficticias. No consulta ni guarda datos de personas reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function moduleFrom(file) {
  const out = await build({ entryPoints: [path.join(repo, file)], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const b = await moduleFrom('src/utils/bcra.ts');
const p = await moduleFrom('src/config/parametrizacion.ts');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('OK ' + name); }
const id = '20123456786';
const deuda = { tipo: 'deudores', identificacion: id, historico: false };
const bancos = { tipo: 'entidades' };
const monedas = { tipo: 'cotizaciones', fecha: '' };
const cheque = { tipo: 'cheques-denunciados', entidad: '20', cheque: '000507' };
const originalFetch = globalThis.fetch;
let calls = [];
function fixture(body, status = 200) {
  calls = []; globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); };
}
try {
  await test('Utilidades opcional y parametrizable, preserva módulos existentes', () => {
    assert.equal(p.normalizeParametrizacion().modulos.utilidades, false);
    assert.equal(p.normalizeParametrizacion({ modulos: { utilidades: true, taller: true } }).modulos.utilidades, true);
    assert.equal(p.normalizeParametrizacion({ modulos: { utilidades: false, taller: true } }).modulos.taller, true);
    assert.equal(p.MODULOS_SISTEMA.filter(item => item.key === 'utilidades').length, 1);
  });
  await test('CUIT con guiones, espacios y rechazo de letras/inyección', () => {
    assert.equal(b.identificacionBcra('20-12345678-6'), id);
    assert.equal(b.identificacionBcra('20 12345678 6'), id);
    for (const value of ['123', '20123456786?x=1', '20A123456786', '', '201234567860']) assert.throws(() => b.identificacionBcra(value));
  });
  await test('Fechas imposibles y futuras rechazadas, última publicación sin fecha', () => {
    assert.equal(b.fechaBcra('2024-02-29'), '2024-02-29');
    for (const value of ['2024-02-30', '2023-02-29', '2050-01-01', '2024/01/01']) assert.throws(() => b.fechaBcra(value));
    assert.equal(b.consultaBcraUrl(monedas), b.BCRA_API + '/estadisticascambiarias/v1.0/Cotizaciones');
  });
  await test('Todos los endpoints pertenecen al host oficial', () => {
    const requests = [monedas, { ...monedas, fecha: '2024-06-12' }, deuda, { ...deuda, historico: true }, { tipo: 'cheques-rechazados', identificacion: id }, bancos, cheque];
    for (const request of requests) assert.equal(new URL(b.consultaBcraUrl(request)).origin, 'https://api.bcra.gob.ar');
    assert.ok(b.consultaBcraUrl({ ...deuda, historico: true }).endsWith('/Deudas/Historicas/' + id));
    assert.ok(b.consultaBcraUrl(cheque).endsWith('/denunciados/20/000507'));
  });
  await test('Rangos bancarios y de cheque, sin pérdida al construir URL', () => {
    for (const value of ['0', '-1', '2147483648', '20/11']) assert.throws(() => b.consultaBcraUrl({ ...cheque, entidad: value }));
    for (const value of ['0', '-1', '1e3', '9223372036854775808', '50/7']) assert.throws(() => b.consultaBcraUrl({ ...cheque, cheque: value }));
    assert.ok(b.consultaBcraUrl({ ...cheque, cheque: '9223372036854775807' }).endsWith('/9223372036854775807'));
  });
  await test('Deuda en miles convertida a pesos, cero conservado', () => {
    assert.equal(b.deudaBcraEnPesos(59), 59000); assert.equal(b.deudaBcraEnPesos(0), 0); assert.equal(b.deudaBcraEnPesos(1.25), 1250);
  });
  await test('Cotizaciones: fecha publicada y cero informado preservados', async () => {
    fixture({ status: 200, results: { fecha: '2024-06-12', detalle: [{ codigoMoneda: 'USD', descripcion: 'DOLAR', tipoCotizacion: 1517, tipoPase: 0 }] } });
    const result = await b.consultarBcra(monedas);
    assert.equal(result.cotizaciones.fecha, '2024-06-12'); assert.equal(result.cotizaciones.detalle[0].tipoPase, 0);
    assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
    assert.equal(calls[0].options.headers.Authorization, undefined);
  });
  await test('Fecha sin cotizaciones no se sustituye por la fecha de hoy', async () => {
    fixture({ status: 200, results: { fecha: null, detalle: [] } });
    assert.deepEqual((await b.consultarBcra(monedas)).cotizaciones, { fecha: null, detalle: [] });
  });
  await test('Informe de deudores conserva períodos, revisión y datos omitidos', async () => {
    fixture({ status: 200, results: { identificacion: Number(id), denominacion: 'Persona ficticia', periodos: [{ periodo: '202409', entidades: [{ entidad: 'Banco prueba', situacion: 2, monto: 59, enRevision: true, procesoJud: true }] }] } });
    const result = await b.consultarBcra(deuda); assert.equal(result.deudores.periodos[0].entidades[0].enRevision, true); assert.equal(result.deudores.periodos[0].entidades[0].diasAtrasoPago, undefined);
  });
  await test('Un informe de otra identificación nunca se muestra', async () => {
    fixture({ status: 200, results: { identificacion: 20999999999, denominacion: 'Otra', periodos: [] } });
    await assert.rejects(b.consultarBcra(deuda), /formato/);
  });
  await test('404 de deudores/rechazados: sin registros, no garantía', async () => {
    fixture({ status: 404, errorMessages: ['Sin datos'] }, 404);
    assert.equal((await b.consultarBcra(deuda)).sinRegistros, true);
    assert.equal((await b.consultarBcra({ tipo: 'cheques-rechazados', identificacion: id })).sinRegistros, true);
  });
  await test('404 de banco no se interpreta como cheque sin denuncia', async () => {
    fixture({ status: 404, errorMessages: ['Entidad inexistente'] }, 404);
    await assert.rejects(b.consultarBcra(cheque), /Entidad inexistente/);
  });
  await test('429 y 503 no generan resultados ni reintentos', async () => {
    fixture({ status: 429 }, 429); await assert.rejects(b.consultarBcra(deuda), /limitó/); assert.equal(calls.length, 1);
    fixture({ status: 503 }, 503); await assert.rejects(b.consultarBcra(deuda), /no está disponible/); assert.equal(calls.length, 1);
  });
  await test('Error lógico del BCRA incluso con HTTP 200', async () => {
    fixture({ status: 400, errorMessages: ['Fecha errónea'] }); await assert.rejects(b.consultarBcra(monedas), /Fecha errónea/);
  });
  await test('Datos inválidos, negativos o incompletos no se muestran', async () => {
    fixture({ status: 200, results: { fecha: '2024-06-12', detalle: [{ codigoMoneda: 'USD', descripcion: 'DOLAR', tipoCotizacion: -1, tipoPase: 0 }] } });
    await assert.rejects(b.consultarBcra(monedas), /formato/);
    fixture({ status: 200, results: {} }); await assert.rejects(b.consultarBcra(deuda), /formato/);
    globalThis.fetch = async () => new Response('<html>Error</html>', { status: 200 }); await assert.rejects(b.consultarBcra(monedas), /interpretar/);
  });
  await test('Denuncias: false no se confunde con resultado faltante', async () => {
    fixture({ status: 200, results: { numeroCheque: 507, denunciado: false, fechaProcesamiento: '2024-06-12', denominacionEntidad: 'Banco prueba', detalles: [] } });
    assert.equal((await b.consultarBcra(cheque)).denunciados.denunciado, false);
  });
  await test('Número de cheque distinto o impreciso no se muestra', async () => {
    fixture({ status: 200, results: { numeroCheque: 508, denunciado: false, fechaProcesamiento: null, denominacionEntidad: 'Banco prueba', detalles: [] } }); await assert.rejects(b.consultarBcra(cheque), /formato/);
    fixture({ status: 200, results: { numeroCheque: 9223372036854775807, denunciado: false, fechaProcesamiento: null, denominacionEntidad: 'Banco prueba', detalles: [] } }); await assert.rejects(b.consultarBcra({ ...cheque, cheque: '9223372036854775807' }), /formato/);
  });
  await test('Cheques rechazados: importe en pesos sin multiplicación', async () => {
    fixture({ status: 200, results: { identificacion: Number(id), denominacion: 'Persona ficticia', causales: [{ causal: 'SIN FONDOS', entidades: [{ entidad: 1, detalle: [{ nroCheque: 507, fechaRechazo: '2024-06-12', monto: 115000, fechaPago: null, fechaPagoMulta: null, estadoMulta: 'IMPAGA', ctaPersonal: true, denomJuridica: null, enRevision: true }] }] }] } });
    assert.equal((await b.consultarBcra({ tipo: 'cheques-rechazados', identificacion: id })).rechazados.causales[0].entidades[0].detalle[0].monto, 115000);
  });
  await test('Cancelación al salir de la consulta y error de conexión', async () => {
    globalThis.fetch = async (_url, options) => { if (options.signal.aborted) throw options.signal.reason; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })); };
    const controller = new AbortController(); const request = b.consultarBcra(deuda, controller.signal); controller.abort(); await assert.rejects(request);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); }; await assert.rejects(b.consultarBcra(deuda), /conectar/);
  });
  console.log(`${passed} pruebas locales de Utilidades correctas.`);
} finally { globalThis.fetch = originalFetch; }
