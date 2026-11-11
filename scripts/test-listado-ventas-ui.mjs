// Navegación y guardado de páginas reales con datos ficticios, sin Supabase.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import WebSocket from 'ws';

import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { ventas } from './test-listado-ventas.mjs';
const repo=process.cwd();
const fixtures = "export const useVentas=()=>({ventas:window.ventas,isLoading:false});export const useClientes=()=>({data:[]});export const useComercio=()=>({comercio:{nombre_comercio:'Comercio de prueba'}});export const useAfipConfig=()=>({data:{punto_venta:1}});export const useToast=()=>({toast:()=>{}});";
const entry="import React from 'react';import {createRoot} from 'react-dom/client';import ListadoVentas from './src/pages/listados/ListadoVentas';window.ventas="+JSON.stringify(ventas)+";window.open=()=>({});URL.createObjectURL=file=>{file.text().then(text=>window.pdfTexto=text);return 'blob:prueba'};URL.revokeObjectURL=()=>{};createRoot(document.getElementById('root')).render(<ListadoVentas/>);";
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(builder){builder.onResolve({filter:/^@\/hooks\/(useVentas|useClientes|useComercio|useAfipConfig|use-toast)$/},()=>({path:'fixtures',namespace:'fixtures'}));builder.onLoad({filter:/.*/,namespace:'fixtures'},()=>({contents:fixtures,loader:'js'}));}}]});
const css=(await postcss([tailwindcss()]).process(readFileSync('src/index.css','utf8'),{from:'src/index.css'})).css;
const server = createServer((req,res) => {
  if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  res.setHeader('Content-Type',req.url === '/app.js' ? 'application/javascript' : 'text/html;charset=utf-8');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
let browser,socket;
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+mkdtempSync(path.join(tmpdir(),'vortex-listado-ventas-ui-')),'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const url=await new Promise((resolve,reject)=>{
    let out='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);
    browser.once('error',reject);browser.stderr.on('data',chunk=>{out+=chunk;const match=out.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  let seq=0;const pending=new Map(),errors=[];
  socket.on('message',raw=>{const msg=JSON.parse(String(raw));if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);const task=pending.get(msg.id);if(task){clearTimeout(task.timer);pending.delete(msg.id);msg.error?task.reject(Error(JSON.stringify(msg.error))):task.resolve(msg.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(Error(method)),12000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetInfos}=await send('Target.getTargets');
  const targetId=targetInfos.find(t=>t.type==='page').targetId;
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Page.enable',{},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  await send('Page.navigate',{url:origin+'/listados/ventas'},sessionId);
  await send('Runtime.enable',{},sessionId);
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async expression=>{const end=Date.now()+8000;while(Date.now()<end){if(await evaluate(expression))return;if(errors.length)throw Error(errors.join('\n'));await new Promise(resolve=>setTimeout(resolve,50));}throw Error('No se cumplió: '+expression);};
  const click=async text=>evaluate(`(()=>{const items=[...document.querySelectorAll('button,a')];(items.find(b=>b.textContent.trim()===${JSON.stringify(text)})||items.find(b=>b.title===${JSON.stringify(text)})).click();})()`);
  const set=async(name,value)=>evaluate(`(()=>{const el=document.querySelector('[name=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const navigate=async route=>{await send('Page.navigate',{url:origin+route},sessionId);await wait(`document.getElementById('ruta')?.textContent===${JSON.stringify(route.split('?')[0])}`);};

  await wait('Boolean(document.querySelector("table[aria-label]"))');
  const detail='table[aria-label="Detalle de ventas"]';
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(detail)+').tBodies[0].rows.length'),5);
  await evaluate('document.getElementById("tipos-comprobante").click()');await wait('Boolean(document.querySelector("[role=dialog]"))');
  assert.equal(await evaluate('document.querySelectorAll("[role=dialog] [role=checkbox]").length'),3,'Solo tipos emitidos');
  assert.equal(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Factura C")'),false);
  const bounds=await evaluate('(()=>{const b=document.getElementById("tipos-comprobante").getBoundingClientRect();const p=document.querySelector("[role=dialog]").getBoundingClientRect();return {buttonBottom:b.bottom,popupTop:p.top};})()');
  assert.ok(bounds.popupTop>=bounds.buttonBottom,'Selector abre hacia abajo');
  await click('Ninguno');await evaluate('[...document.querySelectorAll("[role=dialog] label")].find(l=>l.textContent.includes("Factura A")).click()');
  await wait('document.querySelector('+JSON.stringify(detail)+').tBodies[0].rows.length===3');
  await evaluate('[...document.querySelectorAll("[role=dialog] label")].find(l=>l.textContent.includes("Recibo X")).click()');
  await wait('document.querySelector('+JSON.stringify(detail)+').tBodies[0].rows.length===4');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');await wait('!document.querySelector("[role=dialog]")');
  const centers=await evaluate('(()=>{const b=document.getElementById("tipos-comprobante").getBoundingClientRect();return {button:b.top+b.height/2,labels:[...document.querySelectorAll("fieldset label")].map(el=>{const r=el.getBoundingClientRect();return r.top+r.height/2;})};})()');
  const vista=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);writeFileSync('tmp/pdfs/listado-ventas-pantalla.png',Buffer.from(vista.data,'base64'));
  centers.labels.forEach(c=>assert.ok(Math.abs(c-centers.button)<2,'Opciones centradas con selector: '+JSON.stringify(centers)));
  await evaluate('document.querySelectorAll("fieldset label").forEach(el=>el.click())');
  await wait('!document.body.textContent.includes("Ranking de Ventas por Cliente")');
  await click('Imprimir Reporte');await wait('Boolean(window.pdfTexto)');
  assert.equal(await evaluate('window.pdfTexto.includes("Ranking de venta por cliente")'),false);
  assert.equal(await evaluate('window.pdfTexto.includes("Ventas por tipo de comprobantes")'),false);
  assert.equal(await evaluate('window.pdfTexto.includes("(Factura B) Tj")'),false,'PDF respeta filtro m?ltiple');
  assert.equal(await evaluate('window.pdfTexto.includes("(Recibo X) Tj")'),true);
  const imagen=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);writeFileSync('tmp/pdfs/listado-ventas-pantalla.png',Buffer.from(imagen.data,'base64'));
  assert.deepEqual(errors,[]);
  console.log('OK navegador: solo tipos emitidos, selecci?n m?ltiple, popup hacia abajo, alineaci?n vertical y PDF con filtros y secciones elegidos.');
} finally {socket?.close();browser?.kill();await new Promise(resolve=>server.close(resolve));}
