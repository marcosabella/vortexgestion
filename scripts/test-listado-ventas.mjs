// Datos ficticios y PDF real; no conecta a Supabase.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

process.env.TZ = 'America/Argentina/Buenos_Aires';
globalThis.require = createRequire(import.meta.url);
const bundle = await build({ entryPoints: ['src/utils/listadoVentasPdf.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { buildListadoVentasPdfFile } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
export const ventas = [
  { id: 'a1', tipo_comprobante: 'factura_a', subtotal: 1234567890.12, total_iva: 259259256.93, total: 1493827147.05 },
  { id: 'a2', tipo_comprobante: 'factura_a', subtotal: 100, total_iva: 21, total: 121 },
  { id: 'b', tipo_comprobante: 'factura_b', subtotal: 1000, total_iva: 210, total: 1210 },
  { id: 'x', tipo_comprobante: 'recibo_x', subtotal: 50, total_iva: 0, total: 50 },
].map((v, i) => ({ ...v, numero_comprobante: `0001-0000000${i+1}`, fecha_venta: '2026-11-11T17:43:00-03:00', cliente_id: 'cliente', cliente_nombre: 'Cliente de prueba', tipo_pago: 'contado' }));
for (const incluirResumenComprobantes of [true, false]) for (const incluirRankingClientes of [true, false]) {
  const pdf = await buildListadoVentasPdfFile(ventas, { rango: '11/11/2026', incluirResumenComprobantes, incluirRankingClientes });
  const texto = await pdf.text();
  assert.equal(texto.includes('Ventas por tipo de comprobantes'), incluirResumenComprobantes);
  assert.equal(texto.includes('Ranking de venta por cliente'), incluirRankingClientes);
  for (const importe of ['$1.234.567.890,12', '$259.259.256,93', '$1.234.567.990,12', '$259.259.277,93', '$1.493.828.528,05']) assert.ok(texto.includes(`(${importe}) Tj`), `Importe completo: ${importe}`);
  assert.ok(texto.includes('(TOTAL) Tj'));
  assert.ok(texto.includes('(11/11/2026) Tj'));
  assert.ok(!texto.includes('17:43'));
  if (incluirResumenComprobantes && incluirRankingClientes) {
    mkdirSync('tmp/pdfs', { recursive: true });
    writeFileSync('tmp/pdfs/listado-ventas-prueba.pdf', Buffer.from(await pdf.arrayBuffer()));
  }
}
const vacio = await buildListadoVentasPdfFile([], { rango: 'Sin registros', incluirResumenComprobantes: false, incluirRankingClientes: false });
assert.ok((await vacio.text()).includes('($0,00) Tj'));
console.log('OK PDF: cuatro combinaciones de secciones, importes completos, fecha sin hora y totales de neto/IVA/total, incluido reporte vacío.');
