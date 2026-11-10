// Navegación y guardado de páginas reales con datos ficticios, sin Supabase.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import WebSocket from 'ws';

const repo = process.cwd();
const fixtures = `
export const useTransporte=()=>({data:window.datos,comercio:{id:'comercio',nombre_comercio:'Demo'},isPending:false,isFetching:false,refetch:async()=>{},run:async args=>{window.calls.push(args);if(window.failSave)throw Error('Error simulado');return 'nuevo';}});
export const useComercioParametrizacion=()=>({data:{funciones:{multiples_cuit:false}}});
export const useEmisoresFiscales=()=>({data:[],isFetching:false});
export const supabase={storage:{from:()=>{throw Error('Sin conexiones externas')}}};`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,useLocation} from 'react-router-dom';import Transporte from './src/pages/Transporte';
window.calls=[];window.fetch=()=>{throw Error('Sin conexiones externas')};
window.datos={admin:!location.search.includes('operador'),unidades:[{id:'unidad',nombre:'Grúa de prueba',patente:'AA123AA',tipo:'grua',estado:'disponible',activo:true,kilometraje:100,horas:0}],servicios:[],choferes:[],clientes:[],tarifas:[],planes:[],mantenimientos:[],lecturas:[],gastos:[],eventos:[],adjuntos:[],proveedores:[],usuarios:[]};
function App(){const {pathname}=useLocation();return <><output id="ruta">{pathname}</output><Transporte/></>;}createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`;
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: repo }, write: false, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixtures', setup(builder) {
  builder.onResolve({ filter: /^@\/(hooks\/(useTransporte|useComercioParametrizacion|useEmisoresFiscales)|integrations\/supabase\/client)$/ }, () => ({ path: 'fixtures', namespace: 'fixtures' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixtures' }, () => ({ contents: fixtures, loader: 'js' }));
} }] });
const server = createServer((req,res) => {
  res.setHeader('Content-Type',req.url === '/app.js' ? 'application/javascript' : 'text/html;charset=utf-8');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<!doctype html><html lang="es"><meta charset="utf-8"><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
let browser,socket;
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+mkdtempSync(path.join(tmpdir(),'vortex-transporte-form-ui-')),'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const url=await new Promise((resolve,reject)=>{
    let out='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);
    browser.once('error',reject);browser.stderr.on('data',chunk=>{out+=chunk;const match=out.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  let seq=0;const pending=new Map(),errors=[];
  socket.on('message',raw=>{const msg=JSON.parse(String(raw));if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);const task=pending.get(msg.id);if(task){clearTimeout(task.timer);pending.delete(msg.id);msg.error?task.reject(Error(JSON.stringify(msg.error))):task.resolve(msg.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(Error(method)),12000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Page.enable',{},sessionId);
  await send('Page.navigate',{url:origin+'/transporte/unidades'},sessionId);
  await send('Runtime.enable',{},sessionId);
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async expression=>{const end=Date.now()+8000;while(Date.now()<end){if(await evaluate(expression))return;if(errors.length)throw Error(errors.join('\n'));await new Promise(resolve=>setTimeout(resolve,50));}throw Error('No se cumplió: '+expression);};
  const click=async text=>evaluate(`[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  const set=async(name,value)=>evaluate(`(()=>{const el=document.querySelector('[name=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const navigate=async route=>{await send('Page.navigate',{url:origin+route},sessionId);await wait(`document.getElementById('ruta')?.textContent===${JSON.stringify(route.split('?')[0])}`);};

  for(const vista of ['servicios','unidades','choferes','lecturas','tarifas','gastos','planes','mantenimientos']){
    await navigate('/transporte/'+vista);
    await click('Nuevo');
    await wait(`location.pathname==='/transporte/${vista}/nuevo' && Boolean(document.querySelector('form'))`);
    assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'),false,'Alta sin modal: '+vista);
    await click('Cancelar');await wait(`location.pathname==='/transporte/${vista}' && !document.querySelector('form')`);
  }
  await navigate('/transporte/unidades/nuevo');
  await wait('Boolean(document.querySelector("form"))');
  await click('Guardar');
  await wait('document.body.textContent.includes("Campo obligatorio")');
  assert.equal(await evaluate('window.calls.length'),0,'No guarda datos incompletos');
  await set('nombre','Nueva grúa');await set('patente','AB123CD');
  await click('Guardar');await wait('location.pathname==="/transporte/unidades"');
  assert.equal(await evaluate('window.calls[0].accion'),'unidad');
  assert.equal(await evaluate('window.calls[0].datos.patente'),'AB123CD');
  await click('Editar');await wait('location.pathname==="/transporte/unidades/unidad/editar"');
  assert.equal(await evaluate('document.querySelector("[name=patente]").value'),'AA123AA','Edición precargada');
  await set('nombre','Grúa modificada');await click('Guardar');await wait('location.pathname==="/transporte/unidades"');
  assert.equal(await evaluate('window.calls[1].id'),'unidad');
  assert.equal(await evaluate('window.calls[1].datos.nombre'),'Grúa modificada');
  await navigate('/transporte/unidades/nuevo');await wait('Boolean(document.querySelector("form"))');
  await set('nombre','Con error');await set('patente','AC123DE');await evaluate('window.failSave=true');
  await click('Guardar');await wait('document.body.textContent.includes("No se guardaron los cambios")');
  assert.equal(await evaluate('location.pathname'),'/transporte/unidades/nuevo','Error conserva página');
  assert.equal(await evaluate('document.querySelector("[name=nombre]").value'),'Con error','Error conserva datos');
  await click('Volver');await wait('location.pathname==="/transporte/unidades"');
  await navigate('/transporte/unidades/ajena/editar');await wait('Boolean(document.querySelector("[role=alert]"))');
  assert.equal(await evaluate('Boolean(document.querySelector("form"))'),false,'No edita registros ajenos');
  await navigate('/transporte/unidades/nuevo?operador');await wait('Boolean(document.querySelector("[role=alert]"))');
  assert.equal(await evaluate('Boolean(document.querySelector("form"))'),false,'Alta requiere administración');
  assert.deepEqual(errors,[]);
  console.log('OK navegador: ocho altas como páginas, cancelación, acceso directo, validación, guardado, edición precargada, retorno al listado, error conserva datos y permisos. Sin Supabase.');
} finally {socket?.close();browser?.kill();await new Promise(resolve=>server.close(resolve));}
