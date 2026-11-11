// Render aislado de componentes reales. No valida interacción ni sustituye una revisión visual.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const mock = `
export const useTransporte=()=>({data:globalThis.__transporteDatos,comercio:{id:'comercio',nombre_comercio:'Demo'},run:async()=>'',isPending:false,isFetching:false,refetch:async()=>{}});
export const useComercioParametrizacion=()=>({data:{funciones:{multiples_cuit:false}}});
export const useEmisoresFiscales=()=>({data:[],isFetching:false});
export const useBancos=()=>({bancos:[]});
export const useTarjetas=()=>({tarjetas:[]});
export const useTarjetaCuotas=()=>({tarjetaCuotas:[]});
export const supabase={storage:{from:()=>{throw Error('No se permiten conexiones en esta prueba')}}};`;
const entry = `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom';
import Transporte from './src/pages/Transporte';
import {TransporteServicioDetalle} from './src/components/transporte/TransporteServicioDetalle';
import {TransporteForm} from './src/components/transporte/TransporteForm';
import {camposTransporte} from './src/components/transporte/transporteCampos';
export function pagina(path,datos){globalThis.__transporteDatos=datos;return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Transporte/></MemoryRouter>)}
export function detalle(servicio,datos){return renderToStaticMarkup(<MemoryRouter><TransporteServicioDetalle servicio={servicio} datos={datos} run={async()=>''} pending={false}/></MemoryRouter>)}
export function formulario(accion,datos){return renderToStaticMarkup(<TransporteForm campos={camposTransporte(accion,datos)} guardar={async()=>{}} pending={false}/>)}
`;
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, write: false, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'transporte-fixtures', setup(builder) {
  builder.onResolve({ filter: /^@\/(hooks\/(useTransporte|useEmisoresFiscales|useComercioParametrizacion|useBancos|useTarjetas|useTarjetaCuotas)|integrations\/supabase\/client)$/ }, () => ({ path: 'fixtures', namespace: 'fixtures' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixtures' }, () => ({ contents: mock, loader: 'js' }));
} }] });
// Mantiene los require del runtime de React resolubles desde este script.
const { createRequire } = await import('node:module');
globalThis.require = createRequire(import.meta.url);
const { pagina, detalle, formulario } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const servicio = { id: 'servicio', comercio_id: 'comercio', numero: 1, tipo: 'auxilio', estado: 'solicitado', presentacion: 'pendiente_documentacion', carga: 'Auto de prueba', origen: 'Ruta 9 km 12', destino: 'Taller central', cliente_id: 'cliente', unidad_id: 'unidad', chofer_id: 'chofer', total: 123456789.99, detalles: {}, km_aproximacion: 0, km_traslado: 0, km_retorno: 0, km_facturables: 0, horas_espera: 0, presupuesto_id: null, venta_id: null, version: 1, created_at: '2026-11-10T12:00:00Z' };
const datos = { admin: true, unidades: [{ id: 'unidad', nombre: 'Grúa 1', patente: 'AA123AA', activo: true, estado: 'disponible', kilometraje: 100, horas: 0 }], servicios: [servicio], choferes: [{ id: 'chofer', nombre: 'Chofer local', activo: true }], clientes: [{ id: 'cliente', nombre: 'Cliente', apellido: 'Demo' }], tarifas: [], planes: [], mantenimientos: [], lecturas: [], gastos: [], eventos: [], adjuntos: [], proveedores: [], usuarios: [] };
for (const vista of ['resumen', 'servicios', 'unidades', 'choferes', 'lecturas', 'tarifas', 'liquidacion', 'gastos', 'planes', 'mantenimientos']) {
  const html = pagina('/transporte/' + vista, datos);
  assert.match(html, /Vortex Transporte/);
  if (vista === 'servicios') assert.match(html, /Auto de prueba/);
}
for (const accion of ['servicio', 'unidad', 'chofer', 'lectura', 'tarifa', 'plan', 'gasto', 'mantenimiento']) assert.match(formulario(accion, datos), /<form/);
for (const vista of ['servicios', 'unidades', 'choferes', 'lecturas', 'tarifas', 'gastos', 'planes', 'mantenimientos']) {
  assert.match(pagina('/transporte/' + vista, datos), new RegExp('href="/transporte/' + vista + '/nuevo"'));
  const html = pagina('/transporte/' + vista + '/nuevo', datos);
  assert.match(html, /<form/);
  assert.match(html, /Cancelar/);
  assert.match(html, /Volver/);
  assert.doesNotMatch(html, /role="dialog"/);
  assert.doesNotMatch(pagina('/transporte/' + vista + '/nuevo', { ...datos, admin: false }), /<form/);
}
assert.match(pagina('/transporte/unidades/unidad/editar', datos), /Editar unidad o equipo/);
assert.match(pagina('/transporte/unidades/ajena/editar', datos), /no existe o no está disponible/);
assert.doesNotMatch(pagina('/transporte/unidades/ajena/editar', datos), /<form/);
assert.doesNotMatch(pagina('/transporte/servicios/servicio/editar', { ...datos, servicios: [{ ...servicio, venta_id: 'venta' }] }), /<form/);
const operador = { ...datos, admin: false };
assert.match(pagina('/transporte/tarifas', operador), /requiere acceso de administración/);
const html = detalle(servicio, operador);
assert.match(html, /Abrir mapa/);
assert.match(html, /Adjuntar imagen o PDF/);
assert.doesNotMatch(html, /Importe IVA incluido|Editar datos y asignación|Cancelar servicio/);
const empty = Object.fromEntries(Object.keys(datos).map(k => [k, k === 'admin' ? true : []]));
assert.match(pagina('/transporte/servicios', empty), /No hay registros/);
console.log('OK: 10 vistas, 8 formularios y sus rutas de alta sin modal; edición, registros inexistentes, permisos, detalle operativo y estado vacío. Sin llamadas externas.');
