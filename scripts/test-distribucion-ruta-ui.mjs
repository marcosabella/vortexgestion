import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as dates from 'date-fns';

function load(file, require) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require, URLSearchParams });
  return exports;
}
const styles = load('src/utils/facturaPrint.ts', name => name === 'date-fns' ? dates : {});
const api = load('src/utils/distribucionRuta.ts', () => styles);
const reparto = { id: 'r', nombre: 'Ruta <demo>', fecha: '2026-10-06', repartidor_id: 'u', ruta_origen: 'Deposito', ruta_regreso: true };
const data = { usuarios: [{ id: 'u', nombre: 'Repartidor' }], paradas: [
  { id: 'b', reparto_id: 'r', pedido_id: '2', orden: 2, latitud: -34, longitud: -63, direccion_mapa: 'Anterior' },
  { id: 'a', reparto_id: 'r', pedido_id: '1', orden: 1, latitud: -34, longitud: -64, direccion_mapa: 'Calle 1' },
  { id: 'z', reparto_id: 'ajeno', pedido_id: '1', orden: 1 },
], pedidos: [{ id: '1', numero: 1, cliente_nombre: 'Cliente <uno>', direccion: 'Calle 1', telefono: '123' }, { id: '2', numero: 2, cliente_nombre: 'Cliente dos', direccion: 'Calle nueva', telefono: '456' }] };
const visitas = api.visitasRuta(data, reparto);
assert.equal(visitas.length, 2); assert.equal(visitas[0].id, 'a'); assert.equal(visitas[1].punto, null);
assert.equal(api.puntoValido('', 1), null); assert.equal(api.puntoValido(91, 1), null);
assert.throws(() => api.sugerirOrden(visitas, { latitud: -34, longitud: -64 }), /Ubic/);
const cercanas = visitas.map((v, i) => ({ ...v, punto: { latitud: -34, longitud: -64 + i } }));
const orden = api.sugerirOrden(cercanas, { latitud: -34, longitud: -63 });
assert.equal(orden[0].id, 'b'); assert.equal(cercanas[0].id, 'a');
const lugares = [{ calle: 'Roque S. Peña', numero: '287', localidad: 'Jovita', pais: 'AR', punto: { latitud: -34.52, longitud: -63.94 } }];
assert(api.ubicacionAutomatica('ROQUE S. PEÑA 287 JOVITA', lugares));
assert.equal(api.ubicacionAutomatica('CALLE DEMO 123 JOVITA', lugares), null);
assert.equal(api.ubicacionAutomatica('ROQUE S. PEÑA JOVITA', lugares), null);
assert.equal(api.ubicacionAutomatica('ROQUE S. PEÑA 287 JOVITA', [...lugares, { ...lugares[0], punto: { latitud: -32, longitud: -62 } }]), null);
const tres = ['a', 'b', 'c'].map(id => ({ id, punto: { latitud: -34, longitud: -64 } }));
const matriz = [[0, 1, 2, 20], [100, 0, 100, 100], [1, 1, 0, 1], [1, 1, 1, 0]];
const posibles = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const costo = (indices, regreso) => indices.reduce((sum, j, i) => sum + matriz[i ? indices[i - 1] + 1 : 0][j + 1], 0) + (regreso ? matriz[indices.at(-1) + 1][0] : 0);
for (const regreso of [false, true]) {
  const calculado = api.ordenarPorTiempos(tres, matriz, regreso);
  assert.equal(costo(calculado.map(v => tres.findIndex(x => x.id === v.id)), regreso), Math.min(...posibles.map(v => costo(v, regreso))));
}
assert.equal(tres[0].id, 'a');
assert.throws(() => api.ordenarPorTiempos(tres, [[0]], false), /tiempos/);
assert.throws(() => api.ordenarPorTiempos(tres, Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => i === j ? 0 : null)), false), /circuito/);
const grandes = Array.from({ length: 15 }, (_, i) => ({ id: `v${i}` }));
const tiemposGrandes = Array.from({ length: 16 }, (_, i) => Array.from({ length: 16 }, (_, j) => Math.abs(i - j)));
assert.equal(new Set(api.ordenarPorTiempos(grandes, tiemposGrandes, true).map(v => v.id)).size, 15);
const muchas = Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, direccion: `Calle ${i} & Centro`, cliente: `C${i}`, punto: null }));
const enlaces = api.enlacesNavegacion(muchas, 'Deposito', null, true);
assert.equal(enlaces.length, 4);
const destinos = [];
for (let i = 0; i < enlaces.length; i++) {
  const url = new URL(enlaces[i]), medio = url.searchParams.get('waypoints')?.split('|') || [];
  assert(medio.length <= 3); assert(url.toString().length < 2048);
  assert.equal(url.searchParams.get('origin'), i === 0 ? 'Deposito' : new URL(enlaces[i - 1]).searchParams.get('destination'));
  destinos.push(...medio, url.searchParams.get('destination'));
}
assert.deepEqual(destinos, [...muchas.map(v => v.direccion), 'Deposito']);
const commerce = { nombre_comercio: 'Vortex', calle: 'Calle', numero: '1', localidad: 'Jovita', provincia: 'Cordoba', cuit: '123' };
const html = api.buildHojaRutaPrintHtml(data, reparto, commerce);
assert(html.includes('Cliente &lt;uno&gt;')); assert(!html.includes('Cliente <uno>'));
assert(html.indexOf('Cliente &lt;uno&gt;') < html.indexOf('Cliente dos'));
assert(!html.includes('Efectivo rendido')); assert(!html.includes('Cobrado en reparto'));
assert(html.includes('Regreso al punto de salida')); assert(html.includes('Calle nueva'));
console.log('OK Ruta: direcciones precisas sin inventar ubicaciones, orden por tiempos con/sin regreso, circuito inaccesible, rutas grandes, tramos moviles completos y HTML de impresion.');
