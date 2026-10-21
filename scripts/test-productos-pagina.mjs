// Contrato de consultas real de Supabase JS, con transporte simulado; sin red ni datos productivos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const requests = [];
let responseError = false;
let totalRows = 21262;
const client = createClient('https://prueba.invalid', 'clave-ficticia', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const url = new URL(input);
    requests.push({ url, init });
    if (responseError) return new Response(JSON.stringify({ message: 'Error simulado' }), { status: 500 });
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    const data = Array.from({ length: Math.max(0, Math.min(limit, totalRows - offset)) }, (_, i) => ({ id: String(offset + i) }));
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Content-Range': `${offset}-${offset + data.length - 1}/${totalRows}` } });
  } },
});
const exports = {};
const code = ts.transpileModule(readFileSync('src/utils/consultaProductosPagina.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: name => {
  assert.equal(name, '@/integrations/supabase/client');
  return { supabase: client };
} });
const { consultaProductosPagina } = exports;
const base = { comercioId: 'tenant-prueba', search: '', page: 1, pageSize: 12 };
const first = await consultaProductosPagina(base);
assert.equal(requests.length, 1, 'Primera página requiere una sola consulta');
assert.equal(first.productos.length, 12);
assert.equal(first.total, 21262);
assert.equal(requests[0].url.searchParams.get('comercio_id'), 'eq.tenant-prueba');
assert.equal(requests[0].url.searchParams.get('order'), 'created_at.desc,id.desc');
assert.equal(requests[0].url.searchParams.get('offset'), '0');
assert.equal(requests[0].url.searchParams.get('limit'), '12');
assert.ok(!requests[0].url.searchParams.get('select').includes('marca_busqueda'));
assert.ok(!requests[0].url.searchParams.get('select').includes('rubros('));
assert.ok(new Headers(requests[0].init.headers).get('Prefer').includes('count=exact'));
const next = await consultaProductosPagina({ ...base, page: 2, totalConocido: first.total });
assert.equal(next.productos[0].id, '12');
assert.equal(next.total, 21262);
assert.ok(!new Headers(requests.at(-1).init.headers).get('Prefer')?.includes('count=exact'), 'La segunda página no vuelve a contar el catálogo');
const last = await consultaProductosPagina({ ...base, page: 1772 });
assert.equal(last.productos.length, 10);
assert.equal(last.productos.at(-1).id, '21261');
for (const pageSize of [12, 24, 48, 96]) {
  await consultaProductosPagina({ ...base, pageSize, page: 3 });
  assert.equal(requests.at(-1).url.searchParams.get('offset'), String(pageSize * 2));
  assert.equal(requests.at(-1).url.searchParams.get('limit'), String(pageSize));
}
for (const search of ['Producto 21262', 'ACME', 'Proveedor', 'Tuerca, (grande)', 'Rosca "A"', '50%_barra\\']) {
  await consultaProductosPagina({ ...base, search });
  const params = requests.at(-1).url.searchParams;
  assert.ok(params.get('select').includes('marca_busqueda:marcas()'));
  assert.ok(params.get('select').includes('proveedor_busqueda:proveedores()'));
  const pattern = `%${search.replace(/[\\%_*]/g, '\\$&')}%`;
  assert.equal(params.get('marca_busqueda.nombre'), `ilike.${pattern}`);
  const literal = `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  assert.equal(params.get('or'), `(descripcion.ilike.${literal},cod_producto.ilike.${literal},cod_barras.ilike.${literal},marca_busqueda.not.is.null,proveedor_busqueda.not.is.null)`);
  assert.ok(params.get('proveedor_busqueda.or').includes('razon_social.ilike.'));
}
const abort = new AbortController();
await consultaProductosPagina({ ...base, signal: abort.signal });
assert.equal(requests.at(-1).init.signal, abort.signal);
totalRows = 12;
const beforeDelete = requests.length;
const afterDelete = await consultaProductosPagina({ ...base, page: 2, totalConocido: 21262 });
assert.equal(afterDelete.total, 12);
assert.equal(afterDelete.productos.length, 0);
assert.equal(requests.length, beforeDelete + 2, 'Un borrado concurrente actualiza el total obsoleto');
responseError = true;
await assert.rejects(consultaProductosPagina(base), error => error.message === 'Error simulado');
console.log('OK consultas: 21.262 productos simulados, páginas sin repetir conteo, borrado concurrente, tamaños, tenant, búsqueda y caracteres especiales, cancelación y errores. Sin producción.');
