// Componentes reales + API simulada en Chrome. Nunca conecta con Supabase.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import{tmpdir}from'node:os';import path from'node:path';
import{build}from'esbuild';import postcss from'postcss';import tailwindcss from'tailwindcss';import WebSocket from'ws';
const root=process.cwd(),out=path.join(root,'private-backups/referidos-preview');mkdirSync(out,{recursive:true});
const css=(await postcss([tailwindcss({config:path.join(root,'tailwind.config.ts')})]).process(readFileSync('src/index.css','utf8'),{from:path.join(root,'src/index.css')})).css;
const states=new Map();let claims=0;
const state=id=>{if(!states.has(id))states.set(id,{campana_id:'vortex-referidos-2026',titulo:'Recomendá Vortex y ganá un mes',codigo:'VX-ABCDEF123456',modal_visto_at:null,notificacion_leida_at:null,pendientes:2,meses_bonificados:1});return states.get(id);};
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{ModalReferidos,NotificacionReferidos}from'./src/components/referidos/CampanaReferidos';import{LandingContactForm}from'./src/components/landing/LandingContactForm';const landing=location.pathname==='/landing';createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[landing?'/?ref=VX-DE0000000000#contacto':'/notificaciones']}>{landing?<><div style={{height:1600}}>Landing de prueba</div><section id='contacto'><h2>Contacto</h2><LandingContactForm/></section></>:<main className='mx-auto max-w-4xl space-y-6 p-4 sm:p-8'><h1 className='text-3xl font-bold'>Notificaciones</h1><NotificacionReferidos/><ModalReferidos/></main>}</MemoryRouter></QueryClientProvider></React.StrictMode>);`;
const bundle=(await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-referrals',setup(b){
 b.onResolve({filter:/^@\/hooks\/useComercio$/},()=>({path:'commerce',namespace:'fixture'}));b.onResolve({filter:/^@\/hooks\/use-toast$/},()=>({path:'toast',namespace:'fixture'}));b.onResolve({filter:/^@\/integrations\/supabase\/client$/},()=>({path:'db',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='commerce'?`export const useComercio=()=>({comercio:{id:new URLSearchParams(location.search).get('tenant')||'a',nombre_comercio:'Comercio de prueba'}});`:args.path==='toast'?`const toast=value=>{window.toasts??=[];window.toasts.push(value)};export const useToast=()=>({toast});`:`export const supabase={rpc(name,args){const promise=fetch('/rpc',{method:'POST',body:JSON.stringify({name,args})}).then(r=>r.json());promise.abortSignal=()=>promise;return promise}};` }));
 b.onLoad({filter:/useReferidos\.ts$/},()=>({loader:'ts',resolveDir:path.join(root,'src/hooks'),contents:readFileSync('src/hooks/useReferidos.ts','utf8').replace('esVistaPreviaReferidos(window.location.hostname)','(esVistaPreviaReferidos(window.location.hostname) && !window.location.pathname.startsWith("/produccion"))')}));
}}]})).outputFiles[0].text;
const server=createServer(async(req,res)=>{
 if(req.url==='/rpc'){let raw='';for await(const part of req)raw+=part;const{name,args}=JSON.parse(raw),data=state(args.p_comercio_id);let value=null;
  if(name==='mi_programa_referidos')value={...data};
  else if(name==='reclamar_modal_referidos'){value=!data.modal_visto_at;if(value){data.modal_visto_at=new Date().toISOString();claims++;}}
  else if(name==='leer_notificacion_referidos')data.notificacion_leida_at=new Date().toISOString();
  else throw Error('RPC inesperada '+name);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:value,error:null}));
 }else if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle);}
 else{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/app.js"></script></body></html>`);}
});
let browser,socket;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+mkdtempSync(path.join(tmpdir(),'vortex-referidos-ui-')),'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const url=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),20000);browser.once('error',reject);browser.stderr.on('data',chunk=>{buffer+=chunk;const m=buffer.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
 socket=new WebSocket(url);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});let seq=0;const pending=new Map();socket.on('message',raw=>{const m=JSON.parse(String(raw));const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const{targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const load=async(url,width=1200,height=900)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600},sessionId);await send('Page.navigate',{url:origin+url},sessionId);await new Promise(r=>setTimeout(r,1100));};
 const click=async text=>{assert.ok(await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(text)}));button?.click();return !!button})()`),text);await new Promise(r=>setTimeout(r,200));};
 const modal=()=>evaluate(`!!document.querySelector('[role="dialog"]')`);
 const capture=async name=>{const{data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));};
 await load('/local');assert.equal(await modal(),true);assert.equal(claims,0);await capture('modal-escritorio');
 await click('Ahora no');assert.equal(await modal(),false);assert.ok(await evaluate(`document.body.textContent.includes('Destacada')`));await click('Probar modal');assert.equal(await modal(),true);
 await load('/local',390,844);assert.equal(await modal(),true);await capture('modal-movil');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await click('Ahora no');await capture('notificacion-movil');
 await load('/produccion?tenant=a');assert.equal(await modal(),true);assert.equal(claims,1,'StrictMode no duplica reclamacion');await click('Ahora no');assert.equal(await modal(),false);
 await load('/produccion?tenant=a');assert.equal(await modal(),false,'Recarga no repite modal');assert.equal(claims,1);await click('Marcar como leída');assert.ok(await evaluate(`document.body.textContent.includes('Leída')`));assert.ok(await evaluate(`document.querySelector('a[href^="https://wa.me/"]')?.href.includes('VX-ABCDEF123456')`));await capture('notificacion-escritorio');
 await load('/produccion?tenant=b');assert.equal(await modal(),true);assert.equal(claims,2,'Otro comercio recibe su propia presentacion');
 await load('/landing');assert.ok(await evaluate('scrollY>1200'),'El enlace enfoca contacto en primera carga');assert.ok(await evaluate(`document.body.textContent.includes('VX-DE0000000000')`));assert.equal(claims,2);
 console.log('OK UI: modal local reabrible; produccion una vez, StrictMode, recarga y otro comercio; destacada permanece leida; enlace WhatsApp con codigo; contacto en primera apertura. Escritorio y movil. API simulada.');
}finally{socket?.close();browser?.kill();await new Promise(r=>server.close(r));}
