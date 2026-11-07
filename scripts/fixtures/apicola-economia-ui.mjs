import assert from 'node:assert/strict';
import { sembrarDocumentosEconomicos } from './apicola-economia-pg.mjs';
export async function probarEconomiaUi({ load, click, evaluate, capture, pg }) {
  sembrarDocumentosEconomicos(pg);
  const fill = async (key, value) => evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(key)});if(!e)throw Error('Campo no encontrado: '+${JSON.stringify(key)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  const esperarDocumentos = async () => { for (let i = 0; i < 40 && !await evaluate(`!!document.querySelector('#eco-documento option[value]:not([value=""])')`); i++) await pausa(150); };
  const guardar = async () => { await click('Guardar imputación'); for (let i = 0; i < 30 && await evaluate(`!!document.querySelector('[role="dialog"]')`); i++) { if (await evaluate(`!!document.querySelector('[role="dialog"] [role="alert"]')`)) break; await pausa(150); } assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`), false, await evaluate(`document.querySelector('[role="alert"]')?.textContent||'No se cerró el formulario económico'`)); };
  const campana = pg.sql('SELECT id FROM apicola_campanas LIMIT 1;'), apiario = pg.sql('SELECT id FROM apicola_apiarios LIMIT 1;');
  const destino = async (concepto, importe) => { await fill('eco-campana', campana); await fill('eco-apiario', apiario); await fill('eco-concepto', concepto); await fill('eco-importe', importe); await fill('eco-criterio', 'Asignación directa según uso en el apiario'); };
  await load('costos', 390); await click('Asignar costo'); await esperarDocumentos();
  await fill('eco-documento', pg.sql("SELECT id FROM compras WHERE numero='COMPRA-APICOLA';")); await destino('Alimento para Aromos', '600'); await fill('eco-actividad', 'alimentacion');
  await capture('economia-costo-movil'); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); await guardar();
  assert.equal(pg.sql('SELECT sum(importe) FROM apicola_imputaciones;'), '600.00');
  await click('Asignar costo'); await fill('eco-origen', 'estimado'); await destino('Trabajo estimado en USD', '25'); await fill('eco-moneda', 'USD'); await guardar();
  await load('ingresos'); await click('Asignar ingreso'); await esperarDocumentos();
  await fill('eco-documento', pg.sql("SELECT id FROM ventas WHERE numero_comprobante='VENTA-APICOLA';")); await destino('Ingreso comercial asignado', '1500'); await guardar();
  await click('Asignar ingreso'); await esperarDocumentos(); await fill('eco-documento', pg.sql("SELECT id FROM ventas WHERE numero_comprobante='VENTA-USD';")); await destino('Ingreso de venta USD', '100'); await guardar();
  assert.equal(pg.sql("SELECT sum(importe) FROM apicola_imputaciones WHERE tipo='ingreso' AND moneda='USD';"), '100.00');
  await load('resultados'); assert.ok(await evaluate(`document.body.textContent.includes('ARS')&&document.body.textContent.includes('USD')&&document.body.textContent.includes('900,00')`)); await capture('economia-resultados-escritorio');
  await load('resultados', 390); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); await capture('economia-resultados-movil');
  await load('costos'); await click('Anular imputación'); await fill('eco-motivo', 'Estimación reemplazada por comprobante'); await click('Confirmar anulación');
  assert.equal(pg.sql("SELECT count(*) FROM apicola_imputaciones WHERE estado='anulado';"), '1');
  await load('costos?actor=operator'); assert.ok(await evaluate(`document.body.textContent.includes('disponible para administración')`)); assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Asignar costo')`), false);
  console.log('OK UI economía: compra, estimación, ventas existentes, ARS/USD, resultados, anulación, privacidad y móvil.');
}
