// Generadores reales y Chrome, con comercio/ventas ficticios. Sin Supabase ni ARCA.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import WebSocket from 'ws';
const repo=process.cwd(),require=createRequire(import.meta.url),out=process.env.COMPROBANTES_QA_DIR || path.resolve('tmp/pdfs/comprobantes-encabezados');mkdirSync(out,{recursive:true});
const entry=`
import {buildFacturaPrintHtml} from '@/utils/facturaPrint';
import {buildListadoProductosPdfFile} from '@/utils/listadoProductosPdf';
import {buildReportePdfFile} from '@/utils/listadoVentasPdf';
import {buildCajaPdfFile} from '@/utils/cajaPdf';
import {buildCuentaCorrientePdfFile} from '@/utils/cuentaCorrientePdf';
import {identidadComercioHtml,telefonoComercioHtml} from '@/utils/comercioEncabezado';
import {buildHojaRepartoPrintHtml} from '@/utils/distribucionPdf';
import {buildHojaRutaPrintHtml} from '@/utils/distribucionRuta';
import {buildRemitosDistribucionPrintHtml} from '@/utils/remitoDistribucionPrint';
import {buildOrdenTrabajoPrintHtml} from '@/utils/ordenTrabajoPdf';
const localFetch=window.fetch.bind(window);window.fetch=(url,options)=>{if(String(url).startsWith('data:'))return localFetch(url,options);throw Error('Prueba sin conexiones externas')};
const logoCanvas=document.createElement('canvas');logoCanvas.width=180;logoCanvas.height=60;const logoContext=logoCanvas.getContext('2d');logoContext.fillStyle='#236a44';logoContext.fillRect(0,0,180,60);logoContext.fillStyle='white';logoContext.font='44px Arial';logoContext.textAlign='center';logoContext.fillText('B',90,45);const logo=logoCanvas.toDataURL('image/png');
const comercio={id:'ficticio',nombre_comercio:'BOSTICO Y BARTOLOME SOCIEDAD SIMPLE',cuit:'20111111112',calle:'Av. Principal',numero:'123',localidad:'Ciudad de prueba',provincia:'Córdoba',situacion_afip:'Responsable Inscripto',ingresos_brutos:'123456',fecha_inicio_actividad:'2020-01-01',telefono:'0358 1234567',logo_url:logo,mostrar_razon_social_con_logo:true};
const venta={id:'venta-ficticia',numero_comprobante:'0001-00000001',tipo_comprobante:'recibo_x',tipo_pago:'contado',cliente_nombre:'Cliente de prueba',fecha_venta:'2026-10-14T12:00:00',subtotal:100,total_iva:0,total:100,venta_items:[{descripcion_manual:'Producto de prueba',cantidad:1,precio_unitario:100,porcentaje_iva:0,subtotal:100,total:100}],pagos_venta:[]};
const parsed=html=>{const d=document.createElement('div');d.innerHTML=html;return d};
const assert=(value,message)=>{if(!value)throw Error(message)};
(async()=>{
assert(parsed(identidadComercioHtml(comercio)).querySelector('img')&&parsed(identidadComercioHtml(comercio)).querySelector('.comercio-nombre'),'Logo y razón social juntos');
assert(!parsed(identidadComercioHtml({...comercio,mostrar_razon_social_con_logo:false})).querySelector('.comercio-nombre'),'Respeta opción desactivada');
assert(parsed(identidadComercioHtml({...comercio,logo_url:''})).querySelector('.comercio-nombre'),'Nombre sin logo');
assert(!telefonoComercioHtml({...comercio,telefono:'   '}),'Sin teléfono no hay línea');
const hostile=parsed(telefonoComercioHtml({...comercio,telefono:'123 <script>alert(1)</script>'}));assert(!hostile.querySelector('script'),'Texto escapado');
window.htmls={factura:buildFacturaPrintHtml({venta,comercio}),factura_cae:buildFacturaPrintHtml({venta:{...venta,tipo_comprobante:'factura_c',cae:'12345678901234',cae_vencimiento:'2026-10-24'},comercio}),presupuesto:buildFacturaPrintHtml({venta:{...venta,numero_comprobante:'P-000001'},comercio,documentType:'presupuesto'}),ticket:buildFacturaPrintHtml({venta,comercio,formato:'58mm'})};
const reparto={id:'reparto',nombre:'Reparto de prueba',fecha:'2026-10-14',estado:'planificado'},data={paradas:[],eventos:[],pedidos:[],items:[],remitos:[],cobros:[],usuarios:[]};
const orden={fecha_orden:'2026-10-14',estado:'pendiente',extintores:[],productos:[],cliente:{nombre:'Cliente',apellido:'Prueba'}};
const extra=[buildHojaRepartoPrintHtml(data,reparto,comercio),buildHojaRutaPrintHtml(data,reparto,comercio),buildOrdenTrabajoPrintHtml(orden,comercio),buildRemitosDistribucionPrintHtml([{id:'remito',numero:1,fecha:'2026-10-14',cliente_nombre:'Cliente prueba'}],[],comercio)];
for(const html of [...Object.values(window.htmls),...extra]){const d=parsed(html);assert(d.querySelector('.comercio-nombre')?.textContent===comercio.nombre_comercio,'Nombre en encabezado HTML');assert(d.querySelector('.comercio-datos')?.textContent.includes('0358 1234567')||d.querySelector('.h')?.textContent.includes('0358 1234567'),'Teléfono en documento HTML');}
const options={comercio,rango:'Prueba de encabezado'};
const resumen={cliente_id:'cliente',cliente_nombre:'Cliente',cliente_apellido:'Prueba',cliente_cuit:'',saldo_actual:0,total_debitos:0,total_creditos:0,ultimo_movimiento:'2026-10-14'};
const files={productos:await buildListadoProductosPdfFile([],options),reporte:await buildReportePdfFile([{title:'Reporte de prueba',columns:[{key:'detalle',label:'Detalle',x:24,width:564,align:'left'}],rows:[{detalle:'Fila de prueba'}]}],options),caja:await buildCajaPdfFile([],{...options,balance:{filas:[],totalDebe:0,totalHaber:0,saldoPeriodo:0}}),cuenta:await buildCuentaCorrientePdfFile(resumen,[],{comercio})};
window.files={};for(const [name,file] of Object.entries(files)){const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);window.files[name]=btoa(raw);}
window.ready=true;
})().catch(error=>window.failure=error.stack);
`;
const bundle=await build({stdin:{contents:entry,loader:'js',resolveDir:repo},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'aliases',setup(b){b.onResolve({filter:/^@\//},args=>({path:require.resolve(path.join(repo,'src',args.path.slice(2))+'.ts')}));}}]});
const htmls=new Map(),pdfs=new Map();
const server=createServer((req,res)=>{const name=req.url.split('/').pop();if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text)}else if(req.url.startsWith('/html/')){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(htmls.get(name))}else if(req.url.startsWith('/pdf/')){res.setHeader('Content-Type','application/pdf');res.end(pdfs.get(name))}else{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html><meta charset="utf-8"><body><script src="/app.js"></script></body></html>')}});
let browser,socket;
try{
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+mkdtempSync(path.join(tmpdir(),'vortex-encabezados-')),'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
const url=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.once('error',reject);browser.stderr.on('data',c=>{s+=c;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1])}})});
socket=new WebSocket(url);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});let seq=0;const pending=new Map();socket.on('message',raw=>{const m=JSON.parse(String(raw));const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
await send('Page.navigate',{url:origin},sessionId);const end=Date.now()+15000;while(!await evaluate('window.ready===true')){const failure=await evaluate('window.failure');if(failure)throw Error(failure);if(Date.now()>end)throw Error('Timeout generación');await new Promise(r=>setTimeout(r,80))}
for(const [name,html] of Object.entries(await evaluate('window.htmls')))htmls.set(name,html);
for(const [name,raw] of Object.entries(await evaluate('window.files'))){const pdf=Buffer.from(raw,'base64');assert.ok(pdf.toString('latin1').includes('Telefono: 0358 1234567'),name);assert.ok(pdf.toString('latin1').includes('BOSTICO Y BARTOLOME SOCIEDAD SIMPLE'),name);assert.ok(pdf.toString('latin1').includes('/Subtype /Image'),name);pdfs.set(name,pdf);writeFileSync(path.join(out,name+'.pdf'),pdf);}
await send('Emulation.setDeviceMetricsOverride',{width:1200,height:750,deviceScaleFactor:1,mobile:false},sessionId);
for(const name of htmls.keys()){
await send('Page.navigate',{url:origin+'/html/'+name},sessionId);await new Promise(r=>setTimeout(r,350));
assert.ok(await evaluate('document.querySelector(".header-left")?.textContent.includes("0358 1234567")'),name);
assert.ok(await evaluate('(()=>{const el=document.querySelector(".comercio-nombre");return el.textContent==="BOSTICO Y BARTOLOME SOCIEDAD SIMPLE" && getComputedStyle(el).whiteSpace==="nowrap" && el.scrollWidth<=el.clientWidth+1;})()'),name+' nombre completo en una línea');
const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true},sessionId);pdfs.set(name,Buffer.from(pdf.data,'base64'));writeFileSync(path.join(out,name+'.pdf'),pdfs.get(name));
if(name.startsWith('factura')){
assert.ok(await evaluate('(()=>{const frame=document.querySelector(".factura-container"),brand=document.querySelector(".comprobante-marca");if(!brand)return false;const f=frame.getBoundingClientRect(),b=brand.getBoundingClientRect();return !brand.closest(".factura-container") && b.top>=f.bottom && Math.abs((b.left+b.width/2)-(f.left+f.width/2))<1 && brand.textContent==="VORTEX GESTION - Marcos Abella (03583) - 15430176";})()'),name+' leyenda centrada debajo del recuadro');
assert.equal(Number(pdfs.get(name).toString('latin1').match(/\/Count\s+(\d+)/)?.[1]),1,name+' conserva una pagina A4');
}
const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1200,height:1200,scale:1}},sessionId);writeFileSync(path.join(out,name+'-html.png'),Buffer.from(shot.data,'base64'));
}
for(const name of ['productos','reporte','caja','cuenta']){await send('Page.navigate',{url:origin+'/pdf/'+name+'#zoom=100'},sessionId);await new Promise(r=>setTimeout(r,900));const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(path.join(out,name+'-pdf.png'),Buffer.from(shot.data,'base64'));}
console.log('OK: siete PDF ficticios y capturas; logo más razón social, teléfono, opción desactivada, sin logo, sin teléfono y texto escapado. '+out);
}finally{socket?.close();browser?.kill();await new Promise(r=>server.close(r));}
