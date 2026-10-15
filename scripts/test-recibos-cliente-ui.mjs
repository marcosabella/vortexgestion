// Cuenta corriente, cobro y recibo reales con hooks simulados. Sin Supabase.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import WebSocket from 'ws';

const require = createRequire(import.meta.url), repo = process.cwd();
const fixture = {
  id:'receipt1',comercio_id:'comercio-local',cliente_id:'cliente-local',numero:1,
  solicitud_id:'request1',fecha:'2026-10-15',creado_en:'2026-10-15T15:30:00Z',
  importe:100,moneda:'ARS',saldo_anterior:350,saldo_posterior:250,
  cliente_snapshot:{nombre:'José Pérez',cuit:'20-12345678-6',telefono:'5493511234567'},
  comercio_snapshot:{id:'comercio-local',nombre_comercio:'VORTEX COMERCIO DE PRUEBA',calle:'San Martín',numero:'123',localidad:'Córdoba',provincia:'Córdoba',cuit:'30-12345678-9',situacion_afip:'Responsable Inscripto',ingresos_brutos:'12345',fecha_inicio_actividad:'2020-01-01'},
  pagos:[{tipo:'contado',monto:100}],documentos:[{numero:'0001 - 00000001',importe:100}],movimiento_ids:['credit1'],observaciones:'Pago parcial de prueba',
};
const fixtures = `import React from 'react';
export const receipt=${JSON.stringify(fixture)};
const historical=location.search.includes('historico');
const searchMode=location.search.includes('busqueda');
const cliente=historical?{nombre:'CLAUDIO',apellido:'ALASSIA',cuit:'20-12345678-6'}:{nombre:'José',apellido:'Pérez',cuit:'20-12345678-6',telefono:'5493511234567'};
const movements=historical?[
{id:'old-debit',cliente_id:'cliente-local',tipo_movimiento:'debito',concepto:'venta_credito',monto:119000.04,fecha_movimiento:'2026-09-09T12:00:00Z',cliente},
{id:'old-credit',cliente_id:'cliente-local',tipo_movimiento:'credito',concepto:'Pago histórico #888',observaciones:'Medio: contado | Migrado de Access',monto:119000.04,fecha_movimiento:'2026-09-09T12:00:00Z',cliente},
{id:'later-debit',cliente_id:'cliente-local',tipo_movimiento:'debito',concepto:'venta_credito',monto:500,fecha_movimiento:'2026-10-01T12:00:00Z',cliente}
]:[{id:'debit1',cliente_id:'cliente-local',tipo_movimiento:'debito',concepto:'pago_cuenta_corriente',monto:350,venta_id:'venta1',fecha_movimiento:'2026-10-15T12:00:00Z',cliente,venta:{numero_comprobante:'0001 - 00000001',fecha_venta:'2026-10-15T12:00:00Z',tipo_comprobante:'factura_c'}},{id:'credit1',cliente_id:'cliente-local',tipo_movimiento:'credito',concepto:'pago_efectivo',monto:100,venta_id:'venta1',fecha_movimiento:'2026-10-15T13:00:00Z',cliente,venta:{numero_comprobante:'0001 - 00000001',fecha_venta:'2026-10-15T12:00:00Z',tipo_comprobante:'factura_c'}}];
window.fixtureMovements=movements;

const searchSummaries=[
{cliente_id:'cliente-local',cliente_nombre:'Cliente',cliente_apellido:'Deudor',cliente_cuit:'20111111119',total_debitos:100,total_creditos:0,saldo_actual:100},
{cliente_id:'municipalidad',cliente_nombre:'MUNICIPALIDAD DE',cliente_apellido:'MATTALDI',cliente_cuit:'30-12345678-9',total_debitos:119000.04,total_creditos:119000.04,saldo_actual:0},
{cliente_id:'sin-movimientos',cliente_nombre:'Cliente',cliente_apellido:'Sin operaciones',cliente_cuit:'20222222229',total_debitos:0,total_creditos:0,saldo_actual:0}
];
const municipalMovements=[
{id:'municipal-debit',cliente_id:'municipalidad',tipo_movimiento:'debito',concepto:'venta_credito',monto:119000.04,fecha_movimiento:'2026-09-09T12:00:00Z',cliente:{nombre:'MUNICIPALIDAD DE',apellido:'MATTALDI',cuit:'30-12345678-9'}},
{id:'municipal-credit',cliente_id:'municipalidad',tipo_movimiento:'credito',concepto:'pago_efectivo',monto:119000.04,fecha_movimiento:'2026-09-10T12:00:00Z',cliente:{nombre:'MUNICIPALIDAD DE',apellido:'MATTALDI',cuit:'30-12345678-9'}}
];
export const useComercio=()=>({comercio:receipt.comercio_snapshot});
export const useAfipConfig=()=>({data:{punto_venta:1}});
export const useRecibosPagoCliente=()=>({data:historical?[]:[receipt],refetch:async()=>{}});
export const useCuentaCorriente=()=>({movimientos:movements, isLoading:false, useResumenCuentaCorriente:(include)=>({data:searchMode ? searchSummaries.filter(r=>include || r.saldo_actual!==0):[{cliente_id:'cliente-local',cliente_nombre:cliente.nombre,cliente_apellido:cliente.apellido,cliente_cuit:cliente.cuit,total_debitos:historical?119500.04:350,total_creditos:historical?119000.04:100,saldo_actual:historical?500:250}]}),useMovimientosByCliente:(id)=>({data:searchMode?municipalMovements.filter(m=>m.cliente_id===id):movements}),deleteMovimiento:()=>{},deleteVentaFromCuenta:()=>{},eliminarPagoCliente:{mutate:()=>{}},registrarPagosMixtos:{isPending:false,mutate:(data,options)=>{window.paymentCalls.push(data);options.onSuccess({...receipt,id:'receipt2',numero:2,importe:75,saldo_anterior:250,saldo_posterior:175,pagos:[{tipo:'contado',monto:75}],documentos:[{numero:'0001 - 00000001',importe:75}]});}}});
export const VentasList=({detalleId,onCerrarDetalle})=><div role="dialog" aria-label="Detalle de Venta"><p>Detalle de Venta {detalleId}</p><button onClick={onCerrarDetalle}>Cerrar venta</button></div>;
`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import Detail from './src/pages/CuentaCorrienteClienteDetalle';import {CuentaCorrienteList} from './src/components/CuentaCorrienteList';import {buildReciboPagoHtml,buildReciboPagoPdf} from './src/utils/reciboPagoCliente';
import {buildReciboPagoHistorico,esPagoCliente} from './src/utils/reciboPagoHistorico';window.buildHistorical=buildReciboPagoHistorico;window.isPayment=esPagoCliente;
window.fetch=()=>{throw Error('Conexiones externas prohibidas')};window.paymentCalls=[];
window.receipt=${JSON.stringify(fixture)};window.buildReceiptHtml=buildReciboPagoHtml;window.buildReceiptPdf=buildReciboPagoPdf;
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[location.search.includes('busqueda')?'/cuenta-corriente':'/cuenta-corriente/cliente-local']}><Routes><Route path="/cuenta-corriente" element={<CuentaCorrienteList/>}/><Route path="/cuenta-corriente/:clienteId" element={<Detail/>}/></Routes></MemoryRouter>);`;
const bundle = await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'fixtures',setup(builder){
    builder.onResolve({filter:/^@\/(hooks\/(useCuentaCorriente|useRecibosPagoCliente|useComercio|useAfipConfig)|components\/VentasList)$/},()=>({path:'fixtures',namespace:'fixtures'}));
    builder.onLoad({filter:/.*/,namespace:'fixtures'},()=>({contents:fixtures,loader:'tsx',resolveDir:repo}));
    builder.onResolve({filter:/^@\//},args=>{for(const ext of ['.tsx','.ts','.js']){try{return {path:require.resolve(path.join(repo,'src',args.path.slice(2))+ext)};}catch{}}throw Error(args.path);});
  }}]});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html;charset=utf-8');
  if (req.url === '/app.css') { res.setHeader('Content-Type','text/css');res.end(readFileSync(path.join(repo,'dist/assets',readdirSync('dist/assets').find(n=>n.endsWith('.css')))));return; }
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
let browser, socket;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = mkdtempSync(path.join(tmpdir(), 'vortex-taller-cliente-ui-'));
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(Error('Chrome timeout')), 15000);
    browser.once('error', reject); browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(url); await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let seq = 0; const pending = new Map(), errors = [];
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const task = pending.get(message.id); if (task) { clearTimeout(task.timer); pending.delete(message.id); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq; const timer = setTimeout(() => reject(Error(method)), 12000); pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const wait = async expression => { const end = Date.now() + 8000; while (Date.now() < end) { if (await evaluate(expression)) return; if (errors.length) throw Error(errors.join('\n')); await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('No se cumplió: ' + expression); };
  const click = async text => { await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)}).click()`); };
  const set = async (selector, value) => { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
  const exists = selector => `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
  const navigate = async route => { await send('Page.navigate', { url: origin + route }, sessionId); await wait('Boolean(document.querySelector("input[name=patente]"))'); };
  const open = async () => { await evaluate('document.querySelector("button[aria-haspopup=dialog]").click()'); await wait(exists('input[aria-label="Buscar cliente"]')); };

  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  await send('Page.navigate',{url:origin},sessionId);
  const sel = (css) => `document.querySelector(${JSON.stringify(css)})`;
  await wait(exists('button[aria-label="Ver detalle de venta"]'));
  assert.equal(await evaluate('document.body.textContent.includes("Recibos de pago")'),false,'Sin seccion inferior de recibos');
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify('button[aria-label^="Ver detalle"]')}).length`),2,'Detalle en ambas filas');
  await evaluate(`${sel('button[aria-label="Ver detalle de venta"]')}.click()`);
  await wait('document.body.textContent.includes("Detalle de Venta venta1")');
  await click('Cerrar venta');
  await evaluate(`${sel('button[aria-label="Ver detalle del recibo de pago"]')}.click()`);
  await wait(exists('iframe[title="Vista previa del recibo"]'));
  await wait('!Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="PDF").disabled');
  const receiptText=await evaluate(`${sel('iframe[title="Vista previa del recibo"]')}.contentDocument.body.textContent`);
  assert.ok(receiptText.includes('Recibido del cliente:') && receiptText.includes('José Pérez') && receiptText.includes('250,00'),'Recibo historico con saldo original');
  assert.ok(receiptText.includes('$') && !receiptText.includes('ARS'),'Importes con simbolo monetario');
  await evaluate('document.querySelector("[role=dialog] button.absolute").click()');
  await wait('!document.querySelector("[role=dialog]")');
  await click('Registrar pago'); await click('Seleccionar comprobantes');
  await wait('document.querySelectorAll("[role=dialog]").length===2');
  await evaluate('Array.from(document.querySelectorAll("[role=dialog]")).at(-1).querySelector("button[role=checkbox]").click()');
  await click('Aplicar selección (1)');
  await set('input[type=number]',75); await click('Agregar'); await click('Confirmar pago');
  await wait('document.body.textContent.includes("Recibo de pago R-00000002")');
  assert.equal(await evaluate('window.paymentCalls.length'),1,'Un cobro');
  assert.ok(await evaluate('Boolean(window.paymentCalls[0].solicitudId)'),'Clave de reintento');
  await wait('!Array.from(document.querySelectorAll("[role=dialog] button")).find(b=>b.textContent.trim()==="PDF").disabled');
  const autoText=await evaluate(`${sel('iframe[title="Vista previa del recibo"]')}.contentDocument.body.textContent`);
  assert.ok(autoText.includes('75,00') && autoText.includes('175,00'),'Modal automatico con el pago nuevo');
  await evaluate(`window.downloads=[];window.opened=[];window.open=(...args)=>window.opened.push(args);HTMLAnchorElement.prototype.click=function(){window.downloads.push(this.download)};Object.defineProperty(navigator,'share',{value:undefined,configurable:true});`);
  const modalClick = (text) => evaluate(`Array.from(document.querySelector('[role=dialog]').querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  await modalClick('PDF');
  assert.ok(await evaluate('window.downloads[0].includes("R-00000002")'),'Descarga desde el modal');
  await modalClick('WhatsApp');
  await wait('window.downloads.length===2');
  assert.ok(await evaluate('window.opened[0][0].startsWith("https://wa.me/5493511234567")'),'Chat correcto y PDF para adjuntar');
  // El PDF se genera con el mismo HTML/CSS del recibo, sin servicios externos.
  const pdfResult=await send('Runtime.evaluate',{expression:'(async()=>{const file=await window.buildReceiptPdf(window.receipt);return {size:file.size,name:file.name,type:file.type};})()',awaitPromise:true,returnByValue:true},sessionId);
  assert.ok(pdfResult.result.value.size>10000,'PDF con contenido');
  assert.equal(pdfResult.result.value.type,'application/pdf');
  const longPdf=await send('Runtime.evaluate',{expression:'(async()=>{const file=await window.buildReceiptPdf({...window.receipt,documentos:Array.from({length:80},(_,i)=>({numero:"0001 - "+String(i+1).padStart(8,"0"),importe:1.25}))});return Number((await file.text()).match(/\\/Count (\\d+)/)[1]);})()',awaitPromise:true,returnByValue:true},sessionId);
  assert.ok(longPdf.result.value>1,'Recibo extenso conserva varias paginas');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},sessionId);
  assert.ok(await evaluate('(()=>{const r=document.querySelector("[role=dialog]").getBoundingClientRect();return r.width<=390 && r.left>=0;})()'),'Modal dentro de pantalla movil');
  const html=await evaluate('window.buildReceiptHtml({...window.receipt,cliente_snapshot:{...window.receipt.cliente_snapshot,nombre:"<script>alert(1)</script>"}})');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),'Texto escapado');
  const artifacts=mkdtempSync(path.join(tmpdir(),'vortex-recibos-qa-'));
  await send('Emulation.setDeviceMetricsOverride',{width:794,height:1123,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.open();document.write(window.buildReceiptHtml(window.receipt));document.close()');
  await new Promise(resolve=>setTimeout(resolve,300));
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:794,height:1123,scale:1}},sessionId);
  writeFileSync(path.join(artifacts,'recibo.png'),Buffer.from(screenshot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  await send('Page.navigate',{url:origin+'/?historico'},sessionId);
  await wait('document.body.textContent.includes("CLAUDIO ALASSIA")');
  await evaluate('document.getElementById("historico-cliente").click()');
  await wait(exists('#desde-cliente'));
  await set('#desde-cliente','2026-09-01'); await set('#hasta-cliente','2026-09-30');
  await wait(exists('button[aria-label="Ver detalle del recibo de pago"]'));
  await evaluate(`${sel('button[aria-label="Ver detalle del recibo de pago"]')}.click()`);
  await wait(exists('iframe[title="Vista previa del recibo"]'));
  const historicalText=await evaluate(`${sel('iframe[title="Vista previa del recibo"]')}.contentDocument.body.textContent`);
  assert.ok(historicalText.includes('CLAUDIO ALASSIA') && historicalText.includes('119.000,04'),'Importe y cliente del pago anterior');
  assert.ok(historicalText.includes('9/9/2026') && historicalText.includes('Cuenta saldada'),'Saldo de septiembre sin la deuda posterior');
  assert.ok(historicalText.includes('COMPROBANTE DE PAGO HISTÓRICO'),'Identificacion del comprobante historico');
  assert.ok(!historicalText.includes('Comprobante reconstruido el') && !historicalText.includes('No existe un recibo original guardado'),'Sin la leyenda retirada');
  assert.ok(!historicalText.includes('Saldo anterior') && !historicalText.includes('Comprobantes abonados'),'Sin datos historicos inventados');
  await wait('!Array.from(document.querySelectorAll("[role=dialog] button")).find(b=>b.textContent.trim()==="PDF").disabled');
  const cases=await evaluate(`(()=>{
    const pay=window.fixtureMovements[1], rows=window.fixtureMovements;
    const extras=[{...rows[0],id:'foreign',cliente_id:'otro',monto:1000000},{...rows[0],id:'usd',moneda:'USD',monto:1000000}];
    const r=window.buildHistorical(pay,[...rows,...extras],window.receipt.comercio_snapshot);
    const unknown=window.buildHistorical({...pay,observaciones:''},rows,window.receipt.comercio_snapshot);
    return {saldo:r.saldo_posterior,tipo:r.pagos[0].tipo,unknown:unknown.pagos.length,
      adjustment:window.isPayment({...pay,concepto:'nota_credito'}),alias:window.isPayment({...pay,concepto:'PAGO CONTADO'}),calls:window.paymentCalls.length};
  })()`);
  assert.deepEqual(cases,{saldo:0,tipo:'contado',unknown:0,adjustment:false,alias:true,calls:0},'No cobra de nuevo, no mezcla clientes/monedas ni confunde notas de credito');
  await send('Page.navigate',{url:origin+'/?busqueda'},sessionId);
  await wait(exists('input[placeholder^="Buscar"]'));
  assert.ok(!(await evaluate('document.querySelector("tbody").textContent')).includes('MUNICIPALIDAD'),'Lista inicial conserva solo clientes con saldo');
  await set('input[placeholder^="Buscar"]','municipalidad de mattaldi');
  await wait('document.querySelector("tbody").textContent.includes("MUNICIPALIDAD DE MATTALDI")');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),1,'Encuentra nombre completo con saldo cero');
  await set('input[placeholder^="Buscar"]','mattaldí municipalidad');
  await wait('document.querySelector("tbody").textContent.includes("MATTALDI")');
  await set('input[placeholder^="Buscar"]','30123456789');
  await wait('document.querySelector("tbody").textContent.includes("MATTALDI")');
  await evaluate(`${sel('button[aria-label="Ver cuenta de MUNICIPALIDAD DE"]')}.click()`);
  await wait('document.querySelector("h1").textContent.includes("MUNICIPALIDAD DE MATTALDI")');
  assert.ok(!(await evaluate('document.body.textContent')).includes('No se encontró el cliente'),'Detalle disponible con saldo cero');
  await evaluate('document.getElementById("historico-cliente").click()');
  await wait(exists('#desde-cliente'));
  await set('#desde-cliente','2026-09-01'); await set('#hasta-cliente','2026-09-30');
  await wait('document.querySelectorAll("tbody tr").length===3');
  assert.ok((await evaluate('document.querySelector("tbody").textContent')).includes('119.000,04'),'Historico del cliente saldado accesible');
  await send('Page.navigate',{url:origin+'/?busqueda'},sessionId);
  await wait(exists('input[placeholder^="Buscar"]'));
  await set('input[placeholder^="Buscar"]','Sin operaciones');
  await wait('document.querySelector("tbody").textContent.includes("Sin operaciones")');
  await evaluate(`${sel('button[aria-label="Ver cuenta de Cliente"]')}.click()`);
  await wait('document.querySelector("h1").textContent.includes("Sin operaciones")');
  assert.ok((await evaluate('document.body.textContent')).includes('No hay movimientos'),'Cliente sin movimientos abre cuenta vacia');
  assert.deepEqual(errors,[]);
  console.log('OK Busqueda de saldados y sin movimientos, historico, detalle en filas, venta y recibos con PDF real. Captura: '+path.join(artifacts,'recibo.png'));
} finally { socket?.close(); browser?.kill(); await new Promise(resolve => server.close(resolve)); }
