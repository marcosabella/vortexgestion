// Usuarios generales: paginas reales en Chrome con identidad y servidor simulados.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import WebSocket from 'ws';
const repo=process.cwd();
const fixture = `
const acceso={admin:!location.search.includes('operador'),configurado:true,activo:true,permisos:{},perfil:'administrador'};
export const useAccesoComercio=()=>({data:acceso,isPending:false});
export const useComercio=()=>({comercio:{id:'comercio',nombre_comercio:'Comercio generico'}});
export const useComercioParametrizacion=()=>({data:{modulos:{clientes:true,proveedores:true,productos:true,ventas:true,presupuestos:true,cuenta_corriente:true,caja:true,cheques:true,bancos:true,tarjetas:true,listados:true,compras:true,transporte:location.search.includes('transporte'),restaurante:location.search.includes('restaurante')}}});
export const useUsuariosComercio=()=>({comercio:{id:'comercio',nombre_comercio:'Comercio generico'},acceso:{data:acceso,isPending:false},query:{data:window.usuarios,isPending:false},user:{id:'admin'},sectores:{data:[{id:'sector-cocina',nombre:'Cocina principal'}],isPending:false},mutation:{isPending:false,reset:()=>{},mutateAsync:async data=>{if(window.failSave)throw Error('Error de prueba');window.calls.push(data);if(data.user_id){window.usuarios=window.usuarios.map(u=>u.user_id===data.user_id?{...u,...data,version:u.version+1}:u);}else window.usuarios.push({...data,user_id:'nuevo1',version:1,configurado:true});}}});
`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,useLocation} from 'react-router-dom';import Usuarios from './src/pages/UsuariosComercio';
window.calls=[];window.fetch=()=>{throw Error('Sin conexiones externas')};window.usuarios=[{user_id:'admin',nombre:'Admin',email:'admin@example.test',rol:'admin',activo:true,configurado:false,permisos:{},version:0,restaurante_roles:[]}];
function App(){const{pathname}=useLocation();return <><output id="ruta">{pathname}</output><Routes><Route path="/usuarios" element={<Usuarios/>}/><Route path="/usuarios/nuevo" element={<Usuarios formulario/>}/><Route path="/usuarios/:usuarioId/editar" element={<Usuarios formulario/>}/></Routes></>;}createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(builder){
builder.onResolve({filter:/^@\/(hooks\/(useUsuariosComercio|useComercioParametrizacion|useComercio))$/},()=>({path:'fixtures',namespace:'fixtures'}));
builder.onLoad({filter:/.*/,namespace:'fixtures'},()=>({contents:fixture,loader:'js'}));
}}]});
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


  const select=async(id,value)=>evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await navigate('/usuarios');
  await wait('document.body.textContent.includes("Usuarios y permisos")');
  await click('Nuevo usuario');await wait('location.pathname==="/usuarios/nuevo" && Boolean(document.querySelector("form"))');
  assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'),false);
  assert.equal(await evaluate('document.body.textContent.includes("Vortex Transporte")'),false,'No ofrece modulos no habilitados');
  await set('nombre','Operador creado');await set('email','operador@example.test');await set('password','Password123');
  await click('Crear usuario');await wait('document.body.textContent.includes("al menos un")');
  assert.equal(await evaluate('window.calls.length'),0);
  await select('usuario-perfil','vendedor');await click('Crear usuario');await wait('location.pathname==="/usuarios"');
  const alta=await evaluate('window.calls[0]');
  assert.deepEqual(alta.permisos.ventas,['consultar','crear']);
  assert.equal(alta.rol,'operador');assert.equal(alta.email,'operador@example.test');
  await evaluate(`document.querySelector('[href="/usuarios/nuevo1/editar"]').click()`);await wait('Boolean(document.querySelector("form"))');
  assert.equal(await evaluate('document.getElementById("usuario-email").readOnly'),true);
  assert.equal(await evaluate('Boolean(document.getElementById("usuario-password"))'),false);
  await evaluate(`document.querySelector('[name="activo"]').click()`);await click('Guardar acceso');await wait('location.pathname==="/usuarios"');
  assert.equal(await evaluate('window.calls[1].activo'),false);assert.equal(await evaluate('window.calls[1].version'),1);
  await navigate('/usuarios/nuevo');
  await set('nombre','Con error');await set('email','otro@example.test');await set('password','Password123');await select('usuario-perfil','consulta');
  await evaluate('window.failSave=true');await click('Crear usuario');await wait('document.body.textContent.includes("Error de prueba")');
  assert.equal(await evaluate('document.getElementById("usuario-nombre").value'),'Con error');
  await click('Cancelar');await wait('location.pathname==="/usuarios"');
  await navigate('/usuarios/ajeno/editar');await wait('document.body.textContent.includes("no pertenece al comercio")');
  assert.equal(await evaluate('Boolean(document.querySelector("form"))'),false);
  await navigate('/usuarios?operador');await wait('document.body.textContent.includes("Solo el administrador")');
  assert.equal(await evaluate(`Boolean(document.querySelector('[href="/usuarios/nuevo"]'))`),false);
  await navigate('/usuarios/nuevo?transporte');
  await set('nombre','Chofer');await set('email','chofer@example.test');await set('password','Password123');await select('usuario-perfil','chofer');
  assert.equal(await evaluate('document.body.textContent.includes("Funciones de Restaurante")'),false);
  await click('Crear usuario');await wait('location.pathname==="/usuarios"');
  assert.deepEqual(await evaluate('window.calls[0].permisos'),{transporte:['consultar','operar']});
  await navigate('/usuarios/nuevo?restaurante');
  await evaluate('(()=>{const field=Array.from(document.querySelectorAll("fieldset")).find(f=>f.querySelector("legend").textContent==="Vortex Restaurante / Delivery");field.querySelector("input").click();})()');
  await wait('document.body.textContent.includes("Funciones de Restaurante")');
  await evaluate('Array.from(document.querySelectorAll("label")).find(l=>l.textContent==="Cocina").querySelector("input").click()');
  await wait('Boolean(document.getElementById("usuario-sector"))');
  assert.ok(await evaluate('document.getElementById("usuario-sector").textContent.includes("Cocina principal")'),'Selector por nombre');
  assert.deepEqual(errors,[]);
  console.log('OK usuarios: altas sin modulos adicionales, perfiles, permisos, edicion sin cambiar credenciales, baja, errores, acceso ajeno, chofer y sectores de Restaurante. Sin Supabase.');
} finally {socket?.close();browser?.kill();await new Promise(resolve=>server.close(resolve));}
