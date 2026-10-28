import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const bundle = buildSync({ stdin: { contents: "export { buildFacturaPrintHtml, getFacturaPrintStyles } from './src/utils/facturaPrint.ts'; export { crearDocumentoOrdenTaller } from './src/utils/tallerDocumento.ts';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', tsconfig: 'tsconfig.app.json' });
const { buildFacturaPrintHtml, getFacturaPrintStyles, crearDocumentoOrdenTaller } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const venta = {
  numero_comprobante: 'TALLER-00000001', fecha_venta: '2026-10-05T12:00:00Z', tipo_pago: 'cta_cte', tipo_comprobante: 'recibo_x', cliente_nombre: 'Cliente prueba', subtotal: 100, total_iva: 0, total: 100,
  taller_vehiculo: { patente: 'AAA000', marca: 'RENAULT', modelo: 'KANGOO <script>', anio: 2020, kilometraje: 10000 },
};
for (const formato of ['a4', '58mm']) {
  const html = buildFacturaPrintHtml({ venta, documentType: 'presupuesto', formato });
  assert.ok(html.includes('AAA000') && html.includes('RENAULT') && html.includes('2020') && html.includes('10.000'));
  assert.ok(html.includes('KANGOO &lt;script&gt;') && !html.includes('KANGOO <script>'));
  const observaciones = 'Revisar motor y caja\nIncluye repuestos <originales> & mano de obra';
  const conObservaciones = buildFacturaPrintHtml({ venta: { ...venta, observaciones }, documentType: 'presupuesto', formato });
  assert.ok(conObservaciones.includes('<strong>Observaciones:</strong> Revisar motor y caja\nIncluye repuestos &lt;originales&gt; &amp; mano de obra'), 'Imprime observaciones completas con saltos de linea y HTML escapado');
  assert.ok(!conObservaciones.includes('<originales>'), 'El contenido de observaciones se imprime como texto');
  assert.equal(conObservaciones.split('<strong>Observaciones:</strong>').length - 1, 1, 'Las observaciones aparecen una sola vez');
  assert.ok(conObservaciones.indexOf('<strong>Observaciones:</strong>') > conObservaciones.indexOf('Importe Total:'), 'Las observaciones aparecen debajo del importe total');
  for (const vacias of [undefined, null, '', '  \n ']) {
    assert.ok(!buildFacturaPrintHtml({ venta: { ...venta, observaciones: vacias }, documentType: 'presupuesto', formato }).includes('<strong>Observaciones:</strong>'), 'Omite observaciones vacias');
  }
}
assert.ok(!buildFacturaPrintHtml({ venta, documentType: 'venta' }).includes('AAA000'));
assert.ok(!buildFacturaPrintHtml({ venta: { ...venta, taller_vehiculo: null }, documentType: 'presupuesto' }).includes('Kilometraje de ingreso'));
console.log('Datos del vehículo en presupuesto A4 y ticket; HTML escapado y comprobantes generales sin cambios.');
