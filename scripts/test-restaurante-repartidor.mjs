// Datos ficticios y renderizado local; sin Supabase ni servicios externos.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ stdin: { contents: `export * from './src/utils/restauranteRepartidor'; export {RestauranteRepartidor} from './src/components/restaurante/RestauranteRepartidor';`, resolveDir: repo, loader: 'tsx' }, write: false, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'] });
const compiled = new Module(path.join(repo, 'scripts', '.repartidor-test.cjs'));
compiled.filename = path.join(repo, 'scripts', '.repartidor-test.cjs');
compiled.paths = Module._nodeModulePaths(path.join(repo, 'scripts'));
compiled._compile(bundle.outputFiles[0].text, compiled.filename);
const { restauranteRepartos, restauranteEfectivoRepartidor, restauranteMinutosReparto, restauranteEntregaHoy, RestauranteRepartidor } = compiled.exports;
const ahora = new Date(2026, 9, 9, 12, 20).getTime();
const salida = new Date(2026, 9, 9, 12, 0).toISOString();
const entrega = new Date(2026, 9, 9, 12, 10).toISOString();
const pedido = { id: 'p1', numero: 12, modalidad: 'delivery', estado: 'en_atencion', cuenta: 'abierta', version: 5, prioridad: false, armado: true, venta_id: null, cliente_nombre: 'María', direccion: 'San Martín 123, Jovita', telefono: '555123', total: 100, cobrado: 20, instrucciones_envio: 'Tocar timbre', created_at: salida };
const envio = { id: 'e1', pedido_id: 'p1', repartidor_id: 'u1', estado: 'asignado', observaciones: '', salida_at: null, entrega_at: null };
const item = { id: 'i1', pedido_id: 'p1', descripcion: 'Pizza', cantidad: 2, estado: 'lista', adicionales: [{ nombre: 'Queso' }], observaciones: 'Sin sal' };
const data = { admin: false, usuario_id: 'u1', permisos: ['envios'], pedidos: [pedido, { ...pedido, id: 'p2', numero: 99, cliente_nombre: 'Cliente de otro repartidor' }], envios: [envio, { ...envio, id: 'e2', pedido_id: 'p2', repartidor_id: 'u2' }], items: [item], cobros: [], usuarios: [{ id: 'u1' }] };
const render = (state = data, props = {}) => renderToStaticMarkup(React.createElement(RestauranteRepartidor, { data: state, operar: async () => null, trabajando: false, ahora, online: true, pendientes: 0, actualizar: () => {}, accion: () => {}, ...props }));
const button = (html, texto) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]).find(b => b.endsWith(`>${texto}</button>`));

assert.deepEqual(restauranteRepartos(data).map(r => r.pedido.numero), [12]);
assert.match(render(), /Registrar salida|Tocar timbre|San Martín|Abrir mapa|Llamar/);
assert.doesNotMatch(render(), /Cliente de otro repartidor|Registrar entrega|Registrar cobro|Cerrar y generar comprobante|Recibir rendición/);
assert.equal(restauranteRepartos(data)[0].puedeSalir, true);
for (const modificar of [s => { s.pedidos[0].armado = false; }, s => { s.items[0].estado = 'preparacion'; }, s => { s.items = []; }]) {
  const s = structuredClone(data); modificar(s); assert.equal(restauranteRepartos(s)[0].puedeSalir, false); assert.doesNotMatch(render(s), /Registrar salida/);
}
const ruta = structuredClone(data); Object.assign(ruta.envios[0], { estado: 'en_camino', salida_at: salida });
assert.equal(restauranteRepartos(ruta)[0].puedeEntregar, true);
assert.match(render(ruta), /Registrar entrega|Registrar cobro|20 min/); assert.doesNotMatch(render(ruta), /Registrar salida/);
const pagado = structuredClone(ruta); pagado.pedidos[0].cobrado = 100; assert.doesNotMatch(render(pagado), /Registrar cobro/);
const incidencia = structuredClone(ruta); incidencia.envios[0].estado = 'incidencia'; incidencia.envios[0].observaciones = 'Cliente ausente';
assert.match(render(incidencia), /Cliente ausente|Avisá a despacho/); assert.doesNotMatch(render(incidencia), /Registrar salida|Registrar entrega|Registrar cobro/);
for (const props of [{ online: false }, { trabajando: true }, { pendientes: 1 }, { error: 'Consulta fallida' }]) {
  for (const texto of ['Registrar entrega', 'Registrar cobro', 'Incidencia']) assert.match(button(render(ruta, props), texto), /^<button[^>]*\sdisabled(?:=|\s|>)/, `Bloquear ${texto}: ${JSON.stringify(props)}`);
}
assert.equal(restauranteMinutosReparto(salida, null, ahora), 20);
assert.equal(restauranteMinutosReparto(salida, entrega, ahora + 86400000), 10);
assert.equal(restauranteMinutosReparto(null, null, ahora), null);
assert.equal(restauranteMinutosReparto('invalid', null, ahora), null);
assert.equal(restauranteEntregaHoy(entrega, ahora), true);
assert.equal(restauranteEntregaHoy(entrega, ahora + 86400000), false);
const caja = structuredClone(ruta);
caja.pedidos.push({ ...pedido, id: 'p3', numero: 13 }); caja.envios.push({ ...envio, id: 'e3', pedido_id: 'p3', estado: 'entregado', salida_at: salida, entrega_at: entrega });
const cobro = { id: 'c1', pedido_id: 'p1', usuario_id: 'u1', recibido_por: 'u1', medio: 'contado', monto: 20, anulado: false, rendicion_id: null };
caja.cobros = [cobro, { ...cobro, id: 'c2', pedido_id: 'p3', monto: 40 }, { ...cobro, id: 'c3', monto: 99, medio: 'transferencia' }, { ...cobro, id: 'c4', monto: 99, anulado: true }, { ...cobro, id: 'c5', monto: 99, rendicion_id: 'r1' }, { ...cobro, id: 'c6', monto: 99, recibido_por: 'u2' }];
assert.deepEqual(restauranteEfectivoRepartidor(caja), { pendiente: 60, disponible: 40, bloqueado: 20 });
caja.envios[0].estado = 'entregado'; caja.envios[0].entrega_at = entrega;
assert.deepEqual(restauranteEfectivoRepartidor(caja), { pendiente: 60, disponible: 60, bloqueado: 0 });
caja.pedidos[0].estado = 'completado'; caja.pedidos[0].venta_id = 'venta';
assert.equal(restauranteRepartos(caja).find(r => r.pedido.id === 'p1').activo, false);
console.log('OK repartidor: asignaciones propias, armado, salida, entrega, incidencias, cobro, efectivo, reloj y bloqueo sin conexión');
