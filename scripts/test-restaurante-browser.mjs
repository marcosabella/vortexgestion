// Pruebas interactivas locales con datos ficticios. No accede a Supabase ni servicios externos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import WebSocket from 'ws';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Ejecutar npm run build antes: medir las grillas con el CSS real de Vortex.
const assets=path.join(repo,'dist','assets');
const css=readFileSync(path.join(assets,readdirSync(assets).find(f=>f.startsWith('index-')&&f.endsWith('.css'))),'utf8');
const require=createRequire(import.meta.url);
const browserExe=process.env.BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile=mkdtempSync(path.join(repo,'.restaurante-browser-'));
const source=readFileSync(path.join(repo,'scripts/test-restaurante-ui.mjs'),'utf8');
const fixtureSource=source.slice(source.indexOf('const pedido='),source.indexOf('const hookSource='));
const hooks=`${fixtureSource}
export {fixture};
export const useRestauranteUsuarios=()=>({query:{data:[],isPending:false,error:null},mutation:{isPending:false,reset:()=>{},mutateAsync:async datos=>{window.calls.push({accion:"usuario",datos});}}});
export const useProductos=()=>({productos:[{id:'producto',descripcion:'Plato prueba',cod_producto:'P01',cod_barras:'7790001',tipo_moneda:'ARS',precio_venta:200}]});
export const useClientes=()=>({data:[]}); export const useRestauranteClientes=()=>({data:[{id:'cliente',nombre:'María',apellido:'Pérez',cuit:'20123456789',calle:'Calle',numero:'123',localidad:'Jovita',telefono:'555123'}]});
export const useRestaurante=()=>({data:fixture,isLoading:false,error:null,errorOperacion:'Mesa no disponible o capacidad insuficiente',trabajando:false,pendientes:[],refetch:async()=>{},reintentar:async()=>{},operar:async(accion,datos)=>{window.calls.push({accion,datos});if(accion==='pedido' && window.failPedido)return null;if(accion==='pedido' && window.openProducts){fixture.pedidos.push({...fixture.pedidos[0],...datos,id:'pedido-mozo',numero:2,venta_id:null});return 'pedido-mozo';}return accion==='cerrar'?'venta-prueba':'resultado';}});
export const useComercio=()=>({comercio:{id:'comercio',nombre_comercio:'Comercio prueba',cuit:'20123456789',calle:'Calle',numero:'123',localidad:'Jovita',logo_url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX8cAAAAASUVORK5CYII='}});
export const useToast=()=>({toast:()=>{}});
export const useComercioParametrizacion=()=>({data:{impresion:{formato_comprobante:window.formatoCuenta || "a4"}}});
export const useObtenerCAE=()=>({mutate:()=>{},isPending:false});
const venta={id:'venta-prueba',numero_comprobante:'0006-00000013',tipo_comprobante:'recibo_x',tipo_pago:'contado',fecha_venta:'2026-10-07T12:00:00Z',cliente_nombre:'Cliente prueba',subtotal:220,total_iva:0,total:220,venta_items:[{id:'venta-item',descripcion_manual:'Plato prueba',cantidad:1,precio_unitario:200,porcentaje_iva:0,subtotal:200,monto_iva:0,total:200},{id:'envio-item',descripcion_manual:'Servicio de delivery',cantidad:1,precio_unitario:20,porcentaje_iva:0,subtotal:20,monto_iva:0,total:20}],pagos_venta:[{id:'pago-venta',tipo_pago:'contado',monto:220}]};
export const useVentas=()=>({ventas:[venta,{...venta,id:'otra-venta',cliente_nombre:'Otro cliente',numero_comprobante:'0006-00000014'}],isLoading:false,error:null,deleteVenta:()=>{}});
export const useAfipConfig=()=>({data:{punto_venta:6}});
export const useIsAppAdmin=()=>({data:false});export const useAdminComercios=()=>({comerciosQuery:{data:[]}});
export const useAdminNotificaciones=()=>({crearNotificacion:{isPending:false,mutateAsync:async()=>{}}});
export const useMercadoPago=()=>({status:{data:{operaciones:[]},refetch:async()=>{}},run:async()=>{},isWorking:false});
export const enviarComprobantePorWhatsApp=async()=>{};`;
const entry=`import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {RestauranteConfiguracion} from './src/components/restaurante/RestauranteConfiguracion';
import {NuevoPedido} from './src/components/restaurante/RestauranteForms';import {fixture} from 'test-fixture';
import Restaurante from './src/pages/Restaurante';import {MemoryRouter,useLocation} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
window.calls=[];window.impresos=[];window.fixture=fixture;const operar=async(accion,datos)=>{window.calls.push({accion,datos});if(accion==='config')Object.assign(fixture.config,datos);return 'resultado';};
function App(){const [nuevo,setNuevo]=useState(false);const [vista,setVista]=useState(null);window.moduloActual=useLocation().pathname;return <><button onClick={()=>setVista(null)}>Ver configuración de prueba</button><button onClick={()=>setNuevo(true)}>Nuevo pedido de prueba</button><button onClick={()=>{fixture.pedidos[0].venta_id=window.showVenta?'venta-prueba':null;setVista('pedidos');}}>Ver pedidos de prueba</button><button onClick={()=>{fixture.admin=false;fixture.permisos=["salon"];setVista("salon");}}>Ver salón mozo de prueba</button><button onClick={()=>setVista('cobros')}>Ver cuentas y cobros de prueba</button><button onClick={()=>setVista('cierre')}>Ver cierre de prueba</button><button onClick={()=>{fixture.envios[0].estado='entregado';setVista('pedidos');}}>Resolver entrega de prueba</button><button onClick={()=>{fixture.items[0].estado='pendiente';setVista('cocina');}}>Ver cocina de prueba</button>{vista?<Restaurante vista={vista}/>:<RestauranteConfiguracion data={fixture} operar={operar} trabajando={false}/>} {nuevo&&<NuevoPedido data={fixture} operar={operar} trabajando={false} close={()=>setNuevo(false)} abrir={()=>{}}/>}</>;}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/restaurante/pedidos']}><App/></MemoryRouter></QueryClientProvider>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env.VITE_WHATSAPP_API_ENABLED':'false'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^@\/integrations\/supabase\/client$/},()=>({path:'supabase',namespace:'fixture-db'}));b.onLoad({filter:/.*/,namespace:'fixture-db'},()=>({contents:'export const supabase={from:()=>({select:()=>({eq:()=>({order:async()=>({data:[],error:null})})})})};',loader:'js'}));b.onResolve({filter:/^@\/utils\/documentoPrint$/},()=>({path:'print-service',namespace:'fixture-service'}));b.onLoad({filter:/.*/,namespace:'fixture-service'},()=>({contents:'export const printHtml=async html=>{window.impresos.push(html);};',loader:'js'}));b.onResolve({filter:/^@\/components\/FacturaImpresion$/},()=>({path:'print',namespace:'fixture-print'}));b.onLoad({filter:/.*/,namespace:'fixture-print'},()=>({contents:'export const FacturaImpresion=()=>null;',loader:'js'}));b.onResolve({filter:/^test-fixture$|^@\/hooks\/(useProductos|useClientes|useRestauranteClientes|useRestaurante|useComercio|use-toast|useVentas|useRestauranteVenta|useComercioParametrizacion|useAfipConfig|useAdminComercios|useNotificaciones|useMercadoPago|useWhatsAppComprobante|useRestauranteUsuarios)$/},()=>({path:'hooks',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:hooks,loader:'js'}));b.onResolve({filter:/^@\//},args=>{const base=path.join(repo,'src',args.path.slice(2));for(const ext of ['.tsx','.ts','.js']){try{return {path:require.resolve(base+ext)};}catch{ /* probar extensión siguiente */ }}throw new Error(args.path);});}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':req.url==='/app.css'?'text/css':'text/html; charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:req.url==='/app.css'?css:'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>.test-shell{width:100%;min-width:0}@media(min-width:768px){.test-shell{width:calc(100% - 256px);margin-left:256px}}</style><body><main class="test-shell"><div id="root"></div></main><script src="/app.js"></script></body></html>');});
let browser,socket;
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=spawn(browserExe,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const debuggerUrl=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(new Error('No se inició el navegador local')),15000);browser.once('error',reject);browser.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  socket=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  const pending=new Map();let seq=0;
  socket.on('message',raw=>{const message=JSON.parse(String(raw));if(message.id&&pending.has(message.id)){const {resolve,reject,timer}=pending.get(message.id);clearTimeout(timer);pending.delete(message.id);if(message.error)reject(new Error(message.error.message));else resolve(message.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Tiempo agotado: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  socket.on('message',raw=>{const message=JSON.parse(String(raw));if(message.method==='Runtime.exceptionThrown')console.error(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);});
  await send('Runtime.enable',{},sessionId);
  await send('Page.enable',{},sessionId);
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`},sessionId);
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);return result.result.value;};
  const waitFor=async expression=>{const limit=Date.now()+5000;while(Date.now()<limit){if(await evaluate(`Boolean(${expression})`))return;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('No apareció: '+expression);};
  const click=async text=>{await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw new Error('Falta botón: '+${JSON.stringify(text)});button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));button.click();})()`);};
  const openPicker=async label=>{await evaluate(`(()=>{const button=[...document.querySelectorAll('button[aria-haspopup="dialog"]')].find(b=>document.getElementById(b.getAttribute('aria-labelledby'))?.textContent===${JSON.stringify(label)});if(!button)throw new Error('Falta buscador');button.click();})()`);await waitFor(`!!document.querySelector('[role="dialog"] [aria-label=${JSON.stringify('Buscar '+label)}]')`);};
  const choose=async (label,text,search)=>{await openPicker(label);if(search){await send('Input.insertText',{text:search},sessionId);await waitFor(`document.querySelector('[role="group"]')?.textContent.includes(${JSON.stringify(text)})`);}await evaluate(`(()=>{const row=[...document.querySelectorAll('[role="dialog"] [role="group"] tbody tr')].find(r=>r.textContent.includes(${JSON.stringify(text)}));if(!row)throw new Error('Falta registro');row.querySelector('button').click();})()`);await waitFor(`!document.querySelector('[role="dialog"] [aria-label=${JSON.stringify('Buscar '+label)}]')`);};
  await waitFor(`!!document.querySelector('[role="tablist"]')`);
  assert.equal(await evaluate(`document.querySelectorAll('select,[role="combobox"]').length`),0);
  await click('Carta');await waitFor(`document.body.textContent.includes('Carta desde productos')`);
  await choose('Producto / plato','Plato pruebaP01 · $ 200,00','P01');
  await choose('Sector de preparación','Cocina');await click('Guardar');
  await waitFor(`window.calls.some(c=>c.accion==='carta')`);
  const carta=await evaluate(`window.calls.find(c=>c.accion==='carta').datos`);
  assert.equal(carta.producto_id,'producto');assert.equal(carta.sector_id,'sector');assert.equal(carta.afecta_stock,false);
  console.log('OK carta: búsqueda por código, selección y envío de IDs');
  await click('Usuarios y roles');
  await evaluate("document.getElementById('restaurante-nombre').focus()");await send('Input.insertText',{text:'Ana'},sessionId);
  await evaluate("document.getElementById('restaurante-email').focus()");await send('Input.insertText',{text:'ana@prueba.local'},sessionId);
  await evaluate(`document.querySelector('input[type="checkbox"][value="mozo"]').click()`);
  await evaluate("document.getElementById('restaurante-password').focus()");await send('Input.insertText',{text:'PruebaLocal123!'},sessionId);
  await click('Crear usuario');await waitFor("window.calls.some(c=>c.accion==='usuario')");
  const alta=await evaluate("window.calls.find(c=>c.accion==='usuario').datos");assert.equal(alta.action,'crear');assert.equal(alta.password,'PruebaLocal123!');assert.deepEqual(alta.roles,['mozo']);assert.equal(alta.email,'ana@prueba.local');
  console.log('OK alta de usuario individual con rol de mozo');
  await click('Nuevo pedido de prueba');await waitFor(`document.querySelector('[role="dialog"]')`);
  await choose('Cliente de Vortex (opcional)','Pérez María20123456789 · 555123 · Jovita','Perez');
  assert.equal(await evaluate(`document.querySelector('input[type="tel"]').value`),'555123');
  await choose('Modalidad','Salón / mesa');await choose('Mesa libre','Mesa 14 personas');
  await click('Crear y agregar productos');await waitFor(`window.calls.some(c=>c.accion==='pedido')`);
  const pedido=await evaluate(`window.calls.find(c=>c.accion==='pedido').datos`);
  assert.equal(pedido.cliente_id,'cliente');assert.equal(pedido.mesa_id,'mesa');assert.equal(pedido.modalidad,'mesa');
  console.log('OK modales anidados: cliente por nombre sin acentos, datos completados y mesa');
  await send('Emulation.setDeviceMetricsOverride',{width:1024,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await click('Ver salón mozo de prueba');await waitFor(`document.querySelector('table[aria-label="Salón y mesas"]')`);await click('Nuevo pedido / abrir mesa');
  await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Registrar pedido')");
  await choose('Mesa libre','Mesa 14 personas');
  for(const [width,height] of [[1024,768],[1280,720],[1440,900],[390,844]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640},sessionId);
    await new Promise(resolve=>setTimeout(resolve,200));
    const layout=await evaluate(`(()=>{const d=document.querySelector('[role=dialog]');const pickers=[...d.querySelectorAll('button[aria-haspopup=dialog]')];return {ancho:d.clientWidth,contenido:d.scrollWidth,alto:d.clientHeight,altoContenido:d.scrollHeight,telefono:d.querySelector('input[type=tel]').getBoundingClientRect().width,modalidad:pickers[0].getBoundingClientRect().top,mesa:pickers[1].getBoundingClientRect().top};})()`);
    assert.ok(layout.contenido<=layout.ancho+1,'Pedido sin scroll horizontal: '+JSON.stringify(layout));
    if(width>=1024){assert.ok(layout.altoContenido<=layout.alto+1,'Pedido de mesa sin scroll vertical: '+JSON.stringify(layout));assert.ok(Math.abs(layout.modalidad-layout.mesa)<2,'Modalidad y mesa en la misma fila');assert.ok(layout.telefono<=200,'Teléfono compacto');}
    console.log('OK distribución de registrar pedido '+width+'x'+height+': '+JSON.stringify(layout));
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false},sessionId);
  if(process.env.RESTAURANTE_SCREENSHOT){await new Promise(resolve=>setTimeout(resolve,200));const captura=await send('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(process.env.RESTAURANTE_SCREENSHOT,Buffer.from(captura.data,'base64'));}
  const pedidosAntes=await evaluate("window.calls.filter(c=>c.accion==='pedido').length");
  await click('Crear y agregar productos');
  await waitFor("window.calls.filter(c=>c.accion==='pedido').length>"+pedidosAntes);
  const mesaMozo=await evaluate("window.calls.filter(c=>c.accion==='pedido').at(-1).datos");
  assert.equal(mesaMozo.modalidad,'mesa');assert.equal(mesaMozo.cliente_nombre,'');assert.equal(mesaMozo.telefono,'');assert.equal(mesaMozo.comensales,1);assert.equal(mesaMozo.prometido_at,null);
  console.log('OK mozo crea mesa con nombre, teléfono y horario opcionales vacíos');
  await evaluate('window.failPedido=true');await click('Nuevo pedido / abrir mesa');
  await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Registrar pedido')");
  await choose('Mesa libre','Mesa 14 personas');await click('Crear y agregar productos');
  await waitFor("document.querySelector('[role=dialog] [role=alert]')?.textContent.includes('Mesa no disponible o capacidad insuficiente')");
  assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Crear y agregar productos').disabled"),false);
  console.log('OK rechazo del pedido visible dentro del formulario sin perder los datos');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await waitFor('!document.querySelector("[role=dialog]")');
  await evaluate('window.failPedido=false');
  await evaluate('window.openProducts=true');await click('Nuevo pedido / abrir mesa');
  await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Registrar pedido')");
  await choose('Cliente de Vortex (opcional)','Pérez María20123456789 · 555123 · Jovita');await choose('Mesa libre','Mesa 14 personas');
  await click('Crear y agregar productos');await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Agregar a pedido #2')");
  assert.equal(await evaluate("window.calls.filter(c=>c.accion==='pedido').at(-1).datos.cliente_id"),'cliente');
  console.log('OK mozo selecciona cliente existente y abre productos al crear el pedido');
  for(let i=0;i<2;i++){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await new Promise(resolve=>setTimeout(resolve,80));}
  await waitFor('!document.querySelector("[role=dialog]")');await evaluate('window.openProducts=false;window.fixture.pedidos.pop()');
  await evaluate('window.fixture.admin=true;window.fixture.permisos=["pedidos","salon","cocina","despacho","envios","cobros","cierre","configuracion"]');await click('Ver configuración de prueba');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  await click('General');await choose('Formato general de impresión','A4');
  assert.equal(await evaluate(`document.querySelectorAll('select,[role="combobox"]').length`),0);
  console.log('OK buscador y pestañas en tamaño celular');
  await click('Ver pedidos de prueba');await waitFor(`document.querySelector('table[aria-label="Pedidos"]')`);
  for(const width of [1024,1280,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    const grilla=await evaluate(`(()=>{const table=document.querySelector('table[aria-label="Pedidos"]');const container=table.parentElement;return {ancho:container.clientWidth,contenido:container.scrollWidth};})()`);
    assert.ok(grilla.contenido<=grilla.ancho+1,`Scroll horizontal a ${width}px: ${JSON.stringify(grilla)}`);
  }
  console.log('OK grilla de pedidos sin scroll horizontal a 1024, 1280 y 1440 px con espacio para el menú lateral');
  await evaluate('window.showVenta=true');await click('Ver configuración de prueba');await click('Ver pedidos de prueba');await click('Ver venta');await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('00000013')`);
  const detalleVenta=await evaluate(`document.querySelector('[role="dialog"]').textContent`);
  for(const label of ['Detalle de Venta','Fecha:','Comprobante:','N° Comprobante:','Tipo Pago:','Cliente:','Métodos de Pago'])assert.ok(detalleVenta.includes(label),label);
  assert.ok(!detalleVenta.includes('Otro cliente'));assert.ok(!detalleVenta.includes('Completá los datos'));assert.equal(await evaluate('window.moduloActual'),'/restaurante/pedidos');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await waitFor(`!document.querySelector('[role="dialog"]')`);assert.equal(await evaluate('window.moduloActual'),'/restaurante/pedidos');
  console.log('OK modal real de Ventas con el comprobante vinculado, sin salir del módulo');
  await evaluate('window.showVenta=false');await click('Ver cierre de prueba');await waitFor(`document.querySelector('table[aria-label="Rendiciones registradas"]')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Recibir rendición').disabled`),true);
  await click('Resolver entrega de prueba');await click('Ver cierre de prueba');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Recibir rendición').disabled`),false);
  console.log('OK botón de rendición habilitado sólo con efectivo disponible');
  await click('Ver cocina de prueba');await waitFor(`document.querySelector('table[aria-label="Cocina y comandas"]')`);await click('Aceptar');await waitFor(`window.calls.some(c=>c.accion==='aceptar')`);
  const aceptar=await evaluate(`window.calls.find(c=>c.accion==='aceptar').datos`);assert.equal(aceptar.item_id,'item');assert.equal(aceptar.comanda_id,'comanda');assert.equal(aceptar.pedido_id,'pedido');
  console.log('OK acción de cocina conserva pedido, comanda y producto en la grilla');
  await click('Imprimir comanda');await waitFor('window.impresos.length===1');
  assert.match(await evaluate('window.impresos[0]'),/size: 58mm auto/);
  const impresion=await evaluate(`window.calls.find(c=>c.accion==='impresion').datos`);assert.equal(impresion.pedido_id,'pedido');assert.equal(impresion.comanda_id,'comanda');
  await evaluate(`window.fixture.sectores[0].impresion='a4'`);await click('Ver pedidos de prueba');await click('Ver cocina de prueba');
  await click('PDF');await waitFor('window.impresos.length===2');assert.doesNotMatch(await evaluate('window.impresos[1]'),/size: 58mm auto/);
  console.log('OK comanda: impresión térmica, PDF con formato A4 del sector y registro del intento');
  await evaluate(`window.fixture.config.impresion='a4'`);await click('Ver pedidos de prueba');await click('Ver pedido');await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('Imprimir cuenta')`);
  await click('Imprimir cuenta');await waitFor('window.impresos.length===3');
  const cuentaA4=await evaluate('window.impresos[2]');assert.match(cuentaA4,/DETALLE DE CUENTA/);assert.match(cuentaA4,/class="comercio-logo"/);assert.match(cuentaA4,/20123456789/);assert.doesNotMatch(cuentaA4,/size: 58mm auto/);
  await click('PDF');await waitFor('window.impresos.length===4');assert.equal(await evaluate('window.impresos[3]'),cuentaA4);
  assert.equal(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Formato de cuenta')`),false);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await waitFor(`!document.querySelector('[role="dialog"]')`);
  await click('Ver configuración de prueba');await choose('Formato general de impresión','Ticket 58 mm');await click('Guardar');
  await waitFor(`window.calls.some(c=>c.accion==='config'&&c.datos.impresion==='58mm')`);
  await click('Ver pedidos de prueba');await click('Ver pedido');await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('Imprimir cuenta')`);
  await click('PDF');await waitFor('window.impresos.length===5');assert.match(await evaluate('window.impresos[4]'),/size: 58mm auto/);assert.equal(await evaluate('window.fixture.config.impresion'),'58mm');
  console.log('OK cuenta: mismo documento para impresión/PDF, encabezado del comercio y formato general A4/58 mm');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await waitFor('!document.querySelector("[role=dialog]")');
  await evaluate(`Object.assign(window.fixture.pedidos[0],{modalidad:'mesa',estado:'borrador',armado:false,venta_id:null,cliente_nombre:'CLIENTE DEMO',telefono:'+543385498165',direccion:'ROQUE S. PENA 287, JOVITA',observaciones:'',total:82280,cobrado:0,prioridad:false});Object.assign(window.fixture.items[0],{descripcion:'TONELADA MAIZ con descripcion extensa para comprobar el ajuste de la grilla',precio:82280,estado:'borrador'});window.fixture.cobros=[];window.fixture.envios=[];window.fixture.cuenta_mesas=[{mesa_id:'mesa',pedido_id:'pedido',activa:true}];`);
  await click('Ver configuración de prueba');
  await click('Ver pedidos de prueba');await click('Ver pedido');await waitFor("document.querySelector('[role=dialog] aside')");
  for(const [width,height] of [[1024,768],[1280,900],[390,844]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640},sessionId);await new Promise(resolve=>setTimeout(resolve,200));
    const layout=await evaluate(`(()=>{const d=document.querySelector('[role=dialog]');const tablas=[...d.querySelectorAll('table')].filter(t=>t.getBoundingClientRect().height>0);return {ancho:d.clientWidth,contenido:d.scrollWidth,tablas:tablas.map(t=>({ancho:t.parentElement.clientWidth,contenido:t.parentElement.scrollWidth})),botones:[...d.querySelectorAll('aside button')].map(b=>({x:b.getBoundingClientRect().x,ancho:b.getBoundingClientRect().width}))};})()`);
    assert.ok(layout.contenido<=layout.ancho+1,'Detalle sin scroll horizontal '+width+': '+JSON.stringify(layout));for(const t of layout.tablas)assert.ok(t.contenido<=t.ancho+1,'Grilla sin scroll horizontal');
    assert.ok(layout.botones.length>=7);assert.ok(layout.botones.every(b=>Math.abs(b.x-layout.botones[0].x)<1 && Math.abs(b.ancho-layout.botones[0].ancho)<1),'Acciones alineadas');
    console.log('OK detalle ordenado y acciones alineadas sin scroll horizontal a '+width+' px');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);await new Promise(resolve=>setTimeout(resolve,200));
  if(process.env.RESTAURANTE_SCREENSHOT){const captura=await send('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(process.env.RESTAURANTE_SCREENSHOT.replace(/\.png$/,'-detalle.png'),Buffer.from(captura.data,'base64'));}
  await click('Enviar a cocina');const envioCocina=await evaluate("window.calls.at(-1)");assert.equal(envioCocina.accion,'enviar');assert.equal(envioCocina.datos.pedido_id,'pedido');assert.equal(envioCocina.datos.version,4);
  await click('Agregar productos');await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Agregar a pedido #1')");
  console.log('OK acciones del nuevo detalle conservan pedido/version y apertura para agregar productos');
  for(let i=0;i<2;i++){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await new Promise(resolve=>setTimeout(resolve,80));}
  await evaluate(`window.fixture.usuarios.push({id:'mozo',nombre:'Ana',admin:false});Object.assign(window.fixture.pedidos[0],{creado_por:'mozo',cuenta:'solicitada',venta_id:null});window.fixture.items[0].estado='entregada';window.fixture.cobros=[{id:'cash-mozo',pedido_id:'pedido',monto:100,medio:'contado',usuario_id:'admin',responsable_id:'mozo',anulado:false,rendicion_id:null}];`);
  await click('Ver cuentas y cobros de prueba');await waitFor("document.querySelector('table[aria-label=\"Cuentas y cobros\"]')");
  assert.ok(await evaluate("document.querySelector('table[aria-label=\"Cuentas y cobros\"]').textContent.includes('Cerrar y generar comprobante')"));
  await click('Ver pedido');await click('Cobrar');await waitFor("document.querySelector('[role=dialog]').textContent.includes('Recibió el pago')");
  await choose('Recibió el pago','Caja · Admin');await click('Confirmar');await waitFor("document.querySelector('[role=dialog]').textContent.includes('Imprimir cuenta')");
  assert.equal(await evaluate("window.calls.filter(c=>c.accion==='cobro').at(-1).datos.recibido_por"),'admin');
  await click('Cerrar y generar comprobante');await click('Confirmar');await waitFor("[...document.querySelectorAll('[role=dialog]')].some(d=>d.textContent.includes('Detalle de Venta'))");
  for(let i=0;i<6 && await evaluate('!!document.querySelector("[role=dialog]")');i++){
    await evaluate(`(()=>{const d=[...document.querySelectorAll('[role=dialog]')].at(-1);const b=[...d.querySelectorAll('button')].find(b=>b.querySelector('.sr-only')?.textContent==='Close');if(!b)throw new Error('Falta cierre de diálogo');b.click();})()`);
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  await waitFor('!document.querySelector("[role=dialog]")');
  console.log('OK cobrar permite seleccionar caja y cerrar abre el detalle estándar del módulo Ventas');
  await click('Ver cierre de prueba');assert.equal(await evaluate("document.querySelector('table[aria-label=\"Cierre y rendición\"]')?.textContent.includes('CLIENTE DEMO')"),false);
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Recibir rendición').disabled"),true);
  await evaluate(`Object.assign(window.fixture.pedidos[0],{cuenta:'cerrada',estado:'completado',venta_id:'venta-prueba'});`);
  await click('Ver configuración de prueba');await click('Ver cierre de prueba');
  assert.ok(await evaluate("document.querySelector('table[aria-label=\"Cierre y rendición\"]').textContent.includes('CLIENTE DEMO')"));
  assert.equal(await evaluate("document.querySelector('table[aria-label=\"Cierre y rendición\"]').textContent.includes('Cerrar y generar comprobante')"),false);
  await click('Recibir rendición');await choose('Usuario que rinde','Ana');
  assert.ok(await evaluate("document.querySelector('[role=dialog]').textContent.includes('Pedido #1')"));
  await openPicker('Usuario que rinde');assert.ok(await evaluate("document.querySelector('[role=group]').textContent.includes('Ana')"));assert.equal(await evaluate("document.querySelector('[role=group]').textContent.includes('Admin')"),false);
  console.log('OK mesa se cierra en Cuentas y cobros; sólo cerrada se rinde con la moza, no con quien registró el pago');
  for(let i=0;i<6 && await evaluate('!!document.querySelector("[role=dialog]")');i++){
    await evaluate(`(()=>{const d=[...document.querySelectorAll('[role=dialog]')].at(-1);const b=[...d.querySelectorAll('button')].find(b=>b.querySelector('.sr-only')?.textContent==='Close');b.click();})()`);
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  await evaluate(`Object.assign(window.fixture.pedidos[0],{cuenta:'abierta',estado:'borrador',venta_id:null});window.fixture.mesas.push({id:'mesa-libre',nombre:'Mesa 2',capacidad:4,activo:true});`);
  await click('Ver salón mozo de prueba');
  for(const width of [320,390,767]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true},sessionId);
    await waitFor('document.querySelectorAll("button[data-mesa-id]").length===2');
    const layout=await evaluate(`(()=>{const cards=[...document.querySelectorAll('button[data-mesa-id]')];return {cards:cards.map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,color:getComputedStyle(b).backgroundColor,state:b.dataset.estado})),search:!!document.querySelector('[aria-label="Buscar pedido"]'),newButton:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Nuevo pedido / abrir mesa'),intro:document.body.textContent.includes('Abrí una mesa, agregá rondas'),finished:document.body.textContent.includes('Incluir finalizados'),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
    assert.equal(layout.search,false);assert.equal(layout.newButton,false);assert.equal(layout.intro,false);assert.equal(layout.finished,false);assert.equal(layout.overflow,false);
    assert.ok(layout.cards.every(c=>c.width>=120 && Math.abs(c.height-c.width)<2),'Tarjetas cuadradas táctiles: '+JSON.stringify(layout));
    assert.notEqual(layout.cards[0].color,layout.cards[1].color);assert.deepEqual(layout.cards.map(c=>c.state),['ocupada','libre']);
    console.log('OK salón móvil sólo título y tarjetas, libres/ocupadas sin scroll horizontal a '+width+' px');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  await evaluate(`document.querySelector('[data-mesa-id="mesa-libre"]').click()`);
  await waitFor(`document.querySelector('[role=dialog]')?.textContent.includes('Registrar pedido')`);
  assert.ok(await evaluate(`document.querySelector('[role=dialog]').textContent.includes('Mesa 2')`),'Mesa libre preseleccionada');
  await evaluate(`[...document.querySelector('[role=dialog]').querySelectorAll('button')].find(b=>b.querySelector('.sr-only')?.textContent==='Close').click()`);
  await waitFor('!document.querySelector("[role=dialog]")');
  await evaluate(`document.querySelector('[data-mesa-id="mesa"]').click()`);
  await waitFor(`document.querySelector('[role=dialog]')?.textContent.includes('CLIENTE DEMO')`);
  assert.equal(await evaluate(`document.querySelector('[role=dialog]').textContent.includes('Registrar pedido')`),false);
  await evaluate(`[...document.querySelector('[role=dialog]').querySelectorAll('button')].find(b=>b.querySelector('.sr-only')?.textContent==='Close').click()`);
  await waitFor('!document.querySelector("[role=dialog]")');
  if(process.env.RESTAURANTE_SCREENSHOT){const captura=await send('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(process.env.RESTAURANTE_SCREENSHOT.replace(/\.png$/,'-mesas-movil.png'),Buffer.from(captura.data,'base64'));}
  for(const width of [768,1024]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await waitFor(`document.querySelector('table[aria-label="Salón y mesas"]')`);
    assert.equal(await evaluate('document.querySelectorAll("button[data-mesa-id]").length'),0);
    assert.ok(await evaluate(`!!document.querySelector('[aria-label="Buscar pedido"]') && document.body.textContent.includes('Incluir finalizados') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Nuevo pedido / abrir mesa')`));
  }
  console.log('OK tocar mesa libre abre pedido con mesa seleccionada; ocupada abre cuenta; escritorio conserva grilla y controles');
} finally {
  if(socket)socket.terminate();
  if(browser){browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else {browser.once('exit',resolve);setTimeout(resolve,3000);}});}
  server.close();
  const target=realpathSync(profile);if(path.dirname(target)===realpathSync(repo)&&path.basename(target).startsWith('.restaurante-browser-'))rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
