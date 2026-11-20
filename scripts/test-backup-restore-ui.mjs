// Pantalla real en Chrome; hooks con datos ficticios. Sin conexiones externas.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import WebSocket from 'ws';
const require=createRequire(import.meta.url),repo=process.cwd();
const fixtures=`
window.calls=[]; window.fetch=()=>{throw Error('Red externa bloqueada')};
export const useIsAppAdmin=()=>({data:!location.search.includes('denied'),isLoading:false});
export const useAdminComercios=()=>({comerciosQuery:{data:[{id:'11111111-1111-1111-1111-111111111111',nombre_comercio:'Comercio A'}]}});
export const useAdminBackups=()=>({listado:{data:[{id:'copia-antigua',comercio_id:null,estado:'pendiente',created_at:new Date(Date.now()-(location.search.includes('activecopy')?0:25*60000)).toISOString()}],refetch(){}},generar:{reset(){},mutate(){}},worker:{data:{ready:true,restoreReady:!location.search.includes('disabled')},refetch(){}},descargar:{mutate:id=>window.calls.push({download:id})}});
export const estadosRestauracion={listo:'Lista para revisar',interrumpido:'Interrumpida · mantenimiento'};
const a='11111111-1111-1111-1111-111111111111';
const job={id:'job',estado:'listo',comercio_id:null,updated_at:new Date().toISOString(),resumen:{comercio_id:location.search.includes('individual')?a:null,fecha:'2026-11-19T12:00:00Z',filas:4,archivos:2,comercios:location.search.includes('individual')?[{id:a,nombre:'Comercio A'}]:[{id:a,nombre:'Comercio A'},{id:'22222222-2222-2222-2222-222222222222',nombre:'Comercio B'}]}};
export const useAdminBackupRestores=()=>({listado:{data:[job]},cargar:{reset(){},mutate(file,options){window.calls.push({upload:file.name});options.onSuccess('job')}},analizar:{mutate:id=>window.calls.push({inspect:id})},aplicar:{mutate:args=>window.calls.push({apply:args})},reintentar:{mutate(){}}});
`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import Form from './src/pages/AdminBackups';createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/" element={<div>Inicio</div>}/><Route path="/admin/backups" element={<Form/>}/><Route path="/admin/backups/restaurar" element={<Form/>}/><Route path="/admin/backups/restaurar/:id" element={<Form/>}/></Routes></BrowserRouter>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^@\/hooks\/(useIsAppAdmin|useAdminComercios|useAdminBackups|useAdminBackupRestores)$/},()=>({path:'fixtures',namespace:'fixtures'}));
 b.onLoad({filter:/.*/,namespace:'fixtures'},()=>({contents:fixtures,loader:'js',resolveDir:repo}));
 b.onResolve({filter:/^@\//},args=>{for(const ext of ['.tsx','.ts','.js']){try{return {path:require.resolve(path.join(repo,'src',args.path.slice(2))+ext)}}catch{}}throw Error(args.path)});
}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html;charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html lang="es"><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script></html>')});
let browser,socket;
const profile=mkdtempSync(path.join(tmpdir(),'vortex-restore-ui-'));
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome no inició')),15000);browser.once('error',reject);browser.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1])}})});
 socket=new WebSocket(url);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});
 let seq=0;const pending=new Map(),errors=[];
 socket.on('message',raw=>{const m=JSON.parse(String(raw));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(Error(method)),30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
 const {targetInfos}=await send('Target.getTargets');const targetId=targetInfos.find((t)=>t.type==='page').targetId;const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const until=async expression=>{const end=Date.now()+10000;while(Date.now()<end){if(await evaluate('Boolean('+expression+')'))return;if(errors.length)throw Error(errors.join('\n'));await new Promise(r=>setTimeout(r,40));}throw Error('Timeout: '+expression)};
 const click=label=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
 const navigate=async suffix=>{await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+suffix},sessionId);await until('document.body.textContent.length>0')};
 await navigate('/admin/backups');await until('document.querySelectorAll("[role=tab]").length===4');
 assert.deepEqual(await evaluate('[...document.querySelectorAll("[role=tab]")].map(t=>t.textContent)'),['Realizar copia','Restaurar','Últimas 100 copias','Últimas 100 restauraciones']);
 assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Generar backup general').disabled`),false,'Una solicitud pendiente vencida no bloquea la siguiente');
 await evaluate(`[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent==='Últimas 100 copias').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);
 await until('location.search.includes("tab=copias") && document.querySelector("[role=tabpanel][data-state=active]")?.textContent.includes("Pendiente")');
 await evaluate(`[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent==='Últimas 100 restauraciones').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);
 await until('location.search.includes("tab=restauraciones") && document.querySelector("[role=tabpanel][data-state=active]")?.textContent.includes("Lista para revisar")');
 await navigate('/admin/backups?activecopy');await until(`document.querySelector('[role=tablist]')`);
 assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Generar backup general').disabled`),true,'Una copia pendiente reciente sí bloquea otra');
 await navigate('/admin/backups/restaurar/job');await until('document.querySelector("#restore-scope")');
 assert.equal(await evaluate('document.querySelector("#restore-scope").value'),'');
 assert.equal(await evaluate('window.calls.length'),0);
 await evaluate(`(()=>{const s=document.querySelector('#restore-scope');s.value='11111111-1111-1111-1111-111111111111';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await click('Revisar y restaurar');await until('document.querySelector("#restore-confirm")');
 assert.ok(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirmar restauración').disabled`));
 assert.ok(await evaluate(`document.querySelector('[role=alertdialog]').textContent.includes('Comercio A')`));
 await evaluate(`(()=>{const e=document.querySelector('#restore-confirm');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'RESTAURAR');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await until(`![...document.querySelectorAll('button')].find(b=>b.textContent==='Confirmar restauración').disabled`);
 await click('Confirmar restauración');await until('window.calls.length===1');
 assert.deepEqual(await evaluate('window.calls[0].apply'),{id:'job',comercioId:'11111111-1111-1111-1111-111111111111'});
 await navigate('/admin/backups/restaurar/job?individual');await until('document.querySelector("#restore-scope")');
 assert.equal(await evaluate('document.querySelector("#restore-scope").value'),'11111111-1111-1111-1111-111111111111');
 assert.equal(await evaluate('document.querySelector("#restore-scope").options.length'),1);
 await navigate('/admin/backups/restaurar/job?disabled');await until('document.querySelector("#restore-scope")');
 assert.ok(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Revisar y restaurar')).disabled`));
 await navigate('/admin/backups/restaurar/job?denied');await until('location.pathname==="/"');assert.equal(await evaluate('window.calls.length'),0);
 await navigate('/admin/backups/restaurar');await until('document.querySelector("#restore-file")');
 await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File(['ficticio'],'copia.enc'));const e=document.querySelector('#restore-file');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await until(`![...document.querySelectorAll('button')].find(b=>b.textContent==='Cargar y analizar').disabled`);await click('Cargar y analizar');await until('window.calls.length===2');
 assert.deepEqual(await evaluate('window.calls'),[{upload:'copia.enc'},{inspect:'job'}]);
 assert.deepEqual(errors,[]);
 console.log('UI: cuatro pestañas, historial, carga sin reemplazo, selección individual desde general, confirmación explícita, bloqueo sin habilitación y acceso no administrador verificados. Servicios simulados.');
}finally{
 socket?.close();if(browser){browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else browser.once('exit',resolve)})}await new Promise(r=>server.close(r));
 if(path.dirname(path.resolve(profile))===path.resolve(tmpdir())&&path.basename(profile).startsWith('vortex-restore-ui-')){try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}}
}
