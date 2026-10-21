// Componente y hook reales; RPC ficticias y detalle de venta sustituido. Sin servicios externos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import WebSocket from 'ws';
const require=createRequire(import.meta.url),repo=process.cwd();
const fixtures=`
import React,{useSyncExternalStore} from 'react';
let tenant='emisor';const listeners=new Set();window.setTenant=id=>{tenant=id;listeners.forEach(fn=>fn())};
export function useComercio(){const id=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>tenant);return {comercio:id?{id,nombre_comercio:'Emisor prueba'}:null};}
export const useComercioParametrizacion=()=>({data:{funciones:{multiples_cuit:location.search.includes('multi=true')}}});
export const useEmisoresFiscales=()=>({data:[{id:'emisor-fiscal',activo:true,razon_social:'Mi emisor',cuit_emisor:'20300323872'}]});
export const useToast=()=>({toast:value=>window.notices.push(value)});
export const VentasList=({detalleId,onCerrarDetalle})=><div role="dialog"><p>Comprobante {detalleId}</p><button onClick={onCerrarDetalle}>Cerrar comprobante</button></div>;
window.notices=[];window.calls=[];window.failure=false;window.config=null;window.licenseHistory=[];
window.fetch=()=>{throw Error('Conexión externa bloqueada')};
export const supabase={rpc:async(name,args)=>{
 window.calls.push({name,args});if(window.failure)return {data:null,error:{message:'Error de servidor simulado'}};
 if(name==='consultar_licencia_comercio')return {data:{configuracion:window.config,comprobantes:window.licenseHistory},error:null};
 if(name==='guardar_licencia_comercio'){window.config={id:'plan',comercio_id:args.p_comercio_id,destinatario_comercio_id:args.p_destinatario_id,importe_mensual:args.p_importe,concepto:args.p_concepto};return {data:window.config,error:null};}
 if(name==='generar_comprobante_licencia'){const id='venta-licencia';window.licenseHistory=[{id:'cargo',periodo:args.p_periodo,venta_id:id,importe:window.config.importe_mensual,concepto:window.config.concepto,numero_comprobante:'0003-00000001',tipo_comprobante:args.p_tipo_comprobante,cae:null}];return {data:{venta_id:id,reutilizado:false},error:null};}
 throw Error('RPC no permitida: '+name);
}};
`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {LicenciaComercioButton} from './src/components/admin/LicenciaComercioButton';
const comercio={id:'destinatario',nombre_comercio:'Cliente prueba',cuit:'30545766678'};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><LicenciaComercioButton comercio={comercio}/></QueryClientProvider>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^@\/(hooks\/(useComercio|useComercioParametrizacion|useEmisoresFiscales|use-toast)|integrations\/supabase\/client|components\/VentasList)$/},()=>({path:'fixtures',namespace:'fixtures'}));
 b.onLoad({filter:/.*/,namespace:'fixtures'},()=>({contents:fixtures,loader:'jsx',resolveDir:repo}));
 b.onResolve({filter:/^@\//},args=>{for(const ext of ['.tsx','.ts','.js']){try{return {path:require.resolve(path.join(repo,'src',args.path.slice(2))+ext)}}catch{}}throw Error(args.path)});
}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html;charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html lang="es"><meta charset="utf-8"><body><div id="root"></div><script src="/app.js"></script></body></html>')});
let browser,socket;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+mkdtempSync(path.join(tmpdir(),'vortex-licencias-ui-')),'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const url=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.once('error',reject);browser.stderr.on('data',chunk=>{s+=chunk;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1])}})});
 socket=new WebSocket(url);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});
 let seq=0;const pending=new Map(),errors=[];
 socket.on('message',raw=>{const m=JSON.parse(String(raw));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(Error(method)),12000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const until=async expression=>{const end=Date.now()+10000;while(Date.now()<end){if(await evaluate('Boolean('+expression+')'))return;if(errors.length)throw Error(errors.join('\n'));await new Promise(r=>setTimeout(r,40));}throw Error('Timeout: '+expression)};
 const click=label=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
 const input=async(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 for(const multi of [false,true]){
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?multi='+multi},sessionId);
  await until(`document.querySelector('button[title="Licencia mensual y comprobantes"]')`);
  assert.equal(await evaluate('window.calls.length'),0,'No consultar licencias hasta abrir');
  await evaluate(`document.querySelector('button[title="Licencia mensual y comprobantes"]').click()`);
  await until(`document.querySelector('input[id^="licencia-concepto"]')`);
  assert.equal(await evaluate('document.querySelector("input[id^=licencia-concepto]").value'),'LICENCIA MENSUAL VORTEX');
  assert.ok(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Generar comprobante mensual').disabled`));
  await input('input[id^="licencia-importe"]','12100');await click('Guardar importe mensual');await until('window.config?.importe_mensual===12100');
  await until(`![...document.querySelectorAll('button')].find(b=>b.textContent==='Guardar importe mensual').textContent.includes('Guardando')`);
  await input('input[id^="licencia-periodo"]','2026-10');
  if(multi){
   assert.ok(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Generar comprobante mensual').disabled`));
   await evaluate(`document.querySelector('[aria-label="CUIT emisor de licencia"]').click()`);
   await evaluate(`document.querySelector('[role=option]').click()`);
  }
  await until(`![...document.querySelectorAll('button')].find(b=>b.textContent==='Generar comprobante mensual').disabled`);
  await click('Generar comprobante mensual');await until(`document.body.textContent.includes('Comprobante venta-licencia')`);
  const emission=await evaluate(`window.calls.find(c=>c.name==='generar_comprobante_licencia').args`);
  assert.equal(emission.p_comercio_id,'emisor');assert.equal(emission.p_destinatario_id,'destinatario');assert.equal(emission.p_periodo,'2026-10-01');assert.equal(emission.p_tipo_comprobante,'recibo_x');assert.equal(emission.p_iva,0);assert.equal(emission.p_emisor_fiscal_id,multi?'emisor-fiscal':null);
  await click('Cerrar comprobante');await evaluate(`document.querySelector('button[title="Licencia mensual y comprobantes"]').click()`);
  await until(`document.body.textContent.includes('Abrir comprobante de este mes')`);
  await click('Abrir comprobante de este mes');await until(`document.body.textContent.includes('Comprobante venta-licencia')`);
  assert.equal(await evaluate(`window.calls.filter(c=>c.name==='generar_comprobante_licencia').length`),1,'Abrir el comprobante no lo duplica');
  await click('Cerrar comprobante');await evaluate(`window.setTenant(null)`);await evaluate(`document.querySelector('button[title="Licencia mensual y comprobantes"]').click()`);
  await until(`document.body.textContent.includes('Seleccioná tu comercio emisor')`);
 }
 assert.deepEqual(errors,[]);
 console.log('OK licencias UI: configuración por comercio, concepto predeterminado, guardado, período, emisor simple/múltiple, reutilización de comprobante y comercio no seleccionado. RPC simuladas, sin emisiones ni envíos reales.');
}finally{socket?.close();browser?.kill();await new Promise(r=>server.close(r));}
