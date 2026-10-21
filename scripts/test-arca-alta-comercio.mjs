// Handler y autorización reales con transporte simulado. No consulta ARCA ni Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
const load = (file, require = () => ({}), extra = {}) => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require, Request, Response, crypto: webcrypto, TextEncoder, console: { log() {}, error() {} }, ...extra });
  return exports;
};
const authorization = load('supabase/functions/consultar-padron-afip/autorizacion.ts');
const padron = load('supabase/functions/consultar-padron-afip/padron.ts');
const tickets = load('supabase/functions/_shared/wsaa-cache.ts');
let state, externalCalls, fiscalCalls, handler;
const db = {
  auth: { getUser: async token => ({ data: { user: token === 'sesion' ? { id: 'user' } : null }, error: null }) },
  rpc: async (name, args) => {
    assert.equal(name, 'afip_wsaa_reservar_ticket');
    assert.equal(args.p_comercio_id, 'propio');
    assert.ok(args.p_clave.includes('ws_sr_constancia_inscripcion'));
    return { data: { estado: 'vigente', token: 'ticket-ficticio', sign: 'firma-ficticia', expirationTime: '2099-01-01T00:00:00Z' }, error: null };
  },
  from(table) {
    const filters = {};
    const result = () => {
      if (table === 'app_admins') return { data: state.admin ? { id: 'admin' } : null, error: state.adminError ? new Error('error') : null };
      assert.equal(table, 'comercio_usuarios');
      assert.equal(filters.user_id, 'user');assert.equal(filters.activo, true);assert.equal(filters.solo_restaurante, false);
      return { data: state.tenants.filter(id => !filters.comercio_id || id === filters.comercio_id).map(comercio_id => ({ comercio_id })), error: null };
    };
    const query = { select() { return query; }, eq(k, v) { filters[k] = v;return query; }, maybeSingle: async () => result(), then(resolve) { return Promise.resolve(result()).then(resolve); } };
    return query;
  },
};
load('supabase/functions/consultar-padron-afip/index.ts', name => {
  if (name.includes('supabase-js')) return { createClient: () => db };
  if (name.includes('emisor-fiscal')) return { resolverConfiguracionFiscal: async (_, id) => { fiscalCalls.push(id);return state.fiscal ? { certificado_crt: 'CERT-FICTICIO', certificado_key: 'KEY-FICTICIA', cuit_emisor: '20300323872', ambiente: 'produccion' } : null; } };
  if (name.includes('wsaa-cache')) return tickets;
  if (name.includes('node-forge')) return {};
  if (name === './padron.ts') return padron;
  if (name === './autorizacion.ts') return authorization;
  throw Error(name);
}, {
  Deno: { env: { get: () => 'ficticio' }, serve: fn => { handler = fn; } },
  fetch: async (url, options) => {
    externalCalls.push(url);
    if (url.includes('arca.gob.ar')) {
      assert.ok(options.body.includes('<idPersona>20300323872</idPersona>'));
      if (state.soapError) return new Response('<faultstring>Servicio no autorizado</faultstring>', { status: 500 });
      return new Response('<datosGenerales><nombre>Prueba</nombre><apellido>Persona</apellido><tipoPersona>FISICA</tipoPersona></datosGenerales><actividad><periodo>200505</periodo></actividad>');
    }
    return url.includes('cuitonline')
    ? new Response('', { status: 404 })
    : new Response(JSON.stringify({ Contribuyente: { RazonSocial: 'Comercio prueba SA', TipoResponsable: 'Responsable Inscripto' } })); },
});
const request = (body, token = 'sesion') => new Request('https://prueba.invalid', {
  method: 'POST', headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ cuit: '20300323872', ...body }),
});
const run = async (options, body, token) => {
  state = { admin: false, tenants: [], ...options };externalCalls = [];fiscalCalls = [];
  return (await handler(request(body, token))).json();
};
for (const token of ['', 'invalida']) {
  const response = await run({ admin: true }, { altaComercio: true }, token);
  assert.equal(response.success, false);assert.equal(externalCalls.length, 0);
}
let response = await run({}, { altaComercio: true });
assert.match(response.error, /administrador/);assert.equal(externalCalls.length, 0);
response = await run({ admin: true, adminError: true }, { altaComercio: true });
assert.equal(response.success, false);assert.equal(externalCalls.length, 0);
response = await run({ admin: true }, { altaComercio: true });
assert.equal(response.success, false);assert.match(response.error, /certificado ARCA activo/);assert.equal(externalCalls.length, 0);assert.equal(fiscalCalls.length, 0, 'Sin tenant no se consultan certificados ajenos');
response = await run({ admin: true, tenants: ['propio'] }, { altaComercio: true, comercioId: 'ajeno' });
assert.equal(response.success, false);assert.equal(fiscalCalls.length, 0);assert.equal(externalCalls.length, 0);
response = await run({ admin: true, tenants: ['propio'], fiscal: true }, { altaComercio: true, comercioId: 'propio' });
assert.equal(response.success, true);assert.equal(response.data.fuente, 'afip_oficial');assert.equal(response.data.periodoInicioActividad, '2005-05');assert.deepEqual(fiscalCalls, ['propio']);assert.equal(externalCalls.length, 1);
response = await run({ admin: true, tenants: ['propio'], fiscal: true }, { altaComercio: true });
assert.equal(response.success, true);assert.deepEqual(fiscalCalls, ['propio'], 'El administrador con un solo comercio puede usar su configuración sin seleccionarlo');
response = await run({ admin: true, tenants: ['propio'], fiscal: true, soapError: true }, { altaComercio: true });
assert.equal(response.success, false);assert.match(response.error, /Servicio no autorizado/);assert.equal(externalCalls.length, 1, 'No recurrir a fuentes alternativas si falla el webservice oficial');
response = await run({ tenants: ['propio'] }, { comercioId: 'propio' });
assert.equal(response.success, true);assert.deepEqual(fiscalCalls, ['propio'], 'El alta de clientes conserva la consulta de su comercio');
response = await run({ tenants: ['propio', 'segundo'] }, {});
assert.match(response.error, /indicar el comercio/);assert.equal(externalCalls.length, 0);
response = await run({ admin: true }, { altaComercio: 'true' });
assert.equal(response.success, false);assert.equal(externalCalls.length, 0);

const general = '<datosGenerales><razonSocial>Prueba SA</razonSocial><tipoPersona>JURIDICA</tipoPersona><fechaContratoSocial>1990-01-01</fechaContratoSocial></datosGenerales>';
const parse = rest => padron.parseConstanciaInscripcion(`<soap:Envelope><soap:Body>${general}${rest}</soap:Body></soap:Envelope>`);
const result = parse('<datosRegimenGeneral><impuesto><periodo>198001</periodo></impuesto><actividad><periodo>201809</periodo></actividad><actividad><periodo>200505</periodo></actividad><actividad><periodo>200013</periodo></actividad></datosRegimenGeneral>');
assert.equal(result.periodoInicioActividad, '2005-05');
assert.equal(parse('<datosMonotributo><actividadMonotributista><periodo>201001</periodo></actividadMonotributista></datosMonotributo>').periodoInicioActividad, '2010-01');
assert.equal(parse('<impuesto><periodo>200001</periodo></impuesto>').periodoInicioActividad, undefined, 'No usar fechas de impuestos ni contrato social');
assert.equal(parse('<actividad><periodo>202600</periodo></actividad>').periodoInicioActividad, undefined);
assert.equal(parse('<ns:actividad><ns:periodo>202402</ns:periodo></ns:actividad>').periodoInicioActividad, '2024-02');
console.log('OK alta comercio ARCA: webservice oficial con ticket cacheado, CUIT 20300323872, período de actividad, errores sin fallback, permisos, aislamiento y consulta habitual. Datos simulados.');
