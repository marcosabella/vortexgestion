// Formulario real con datos ficticios. No consulta Supabase ni emite comprobantes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import WebSocket from 'ws';

const require = createRequire(import.meta.url), repo = process.cwd();
const fixtures = `
const noop=()=>{};
export const useVentas=()=>({createVentaAsync:async()=>{},updateVenta:noop,isCreating:false,isUpdating:false});
export const usePresupuestos=()=>({createPresupuesto:noop,updatePresupuesto:noop});
export const useMercadoPago=()=>({status:{data:{},refetch:noop},run:async()=>{},isWorking:false});
export const useComercio=()=>({comercio:{id:'local',nombre_comercio:'Prueba'}});
export const useAuth=()=>({user:{id:'local-user'}});
export const useComercioParametrizacion=()=>({data:{funciones:{multiples_cuit:location.search.includes('multi=true'),venta_items_manuales:true,descuentos_recargos:true},modulos:{}}});
export const useClientes=()=>({data:[]});
export const useProductos=()=>({productos:[]});
export const useAfipConfig=()=>({data:{punto_venta:1},isLoading:false});
export const useEmisoresFiscales=()=>({data:[{id:'emisor-1',activo:true,predeterminado:true,cuit_emisor:'20111111112',razon_social:'Emisor de prueba',punto_venta:1}],isLoading:false});
export const rpcEmisorFiscal=async()=>({data:'0001-00000001',error:null});
export const useToast=()=>({toast:noop});
export const enviarComprobantePorWhatsApp=async()=>{};
export const supabase={from:()=>({select:()=>({eq(){return this},maybeSingle:async()=>({data:{rol:'admin'},error:null})})}),rpc:async()=>({data:'0001-00000001',error:null})};
`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import VentaForm from './src/components/VentaForm';
window.fetch=()=>{throw Error('No se permiten conexiones externas en esta prueba')};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><VentaForm onSuccess={()=>{}} modo={location.pathname==='/presupuesto'?'presupuesto':'venta'}/></QueryClientProvider>);`;
const bundle = await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-fixtures',setup(b){
 b.onResolve({filter:/^@\/(hooks\/(useVentas|usePresupuestos|useMercadoPago|useComercio|useComercioParametrizacion|useClientes|useProductos|useAfipConfig|useEmisoresFiscales|use-toast|useWhatsAppComprobante)|contexts\/AuthContext|integrations\/supabase\/client)$/},()=>({path:'fixtures',namespace:'fixtures'}));
 b.onLoad({filter:/.*/,namespace:'fixtures'},()=>({contents:fixtures,loader:'js',resolveDir:repo}));
 b.onResolve({filter:/^@\/components\/PagosVentaManager$/},()=>({path:'payments',namespace:'payments'}));
 b.onLoad({filter:/.*/,namespace:'payments'},()=>({contents:'export const PagosVentaManager=()=>null;',loader:'js'}));
 b.onResolve({filter:/^@\//},args=>{for(const ext of ['.tsx','.ts','.js']){try{return {path:require.resolve(path.join(repo,'src',args.path.slice(2))+ext)}}catch{}}throw Error(args.path)});
}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html;charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html lang="es"><meta charset="utf-8"><body><div id="root"></div><script src="/app.js"></script></body></html>')});
let browser,socket;
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const profile=mkdtempSync(path.join(tmpdir(),'vortex-nueva-venta-ui-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const url=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.once('error',reject);browser.stderr.on('data',chunk=>{s+=chunk;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1])}})});
 socket=new WebSocket(url);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});
 let seq=0;const pending=new Map(),errors=[];
 socket.on('message',raw=>{const m=JSON.parse(String(raw));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(Error(method)),12000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
 for(const [route,multi] of [['/venta?multi=true',true],['/venta?multi=false',false],['/presupuesto?multi=true',false]]){
  await send('Page.navigate',{url:origin+route},sessionId);
  const end=Date.now()+8000;let ready=false;
  while(Date.now()<end){if(await evaluate('Boolean(document.querySelector("form"))')){ready=true;break}if(errors.length)throw Error(errors.join('\n'));await new Promise(r=>setTimeout(r,50))}
  assert.ok(ready,'Formulario visible: '+route);
  assert.equal(await evaluate('Boolean(document.getElementById("venta-emisor-fiscal"))'),multi,route);
  assert.ok(await evaluate('document.body.textContent.includes("Cliente")'),route);
  if(multi){await evaluate('document.getElementById("venta-emisor-fiscal").click()');await new Promise(r=>setTimeout(r,100));assert.ok(await evaluate('[...document.querySelectorAll("[role=option]")].some(el=>el.textContent.includes("Emisor de prueba"))'));}
 }
 assert.deepEqual(errors,[],'Sin excepciones de JavaScript');
 console.log('OK navegador: Nueva venta con multiples CUIT activado/desactivado, selector de emisor y presupuesto; sin excepciones de JavaScript. Datos ficticios, sin Supabase.');
} finally {socket?.close();browser?.kill();await new Promise(r=>server.close(r));}
