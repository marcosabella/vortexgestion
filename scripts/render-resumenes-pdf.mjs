// Renderiza el PDF de prueba con el visor PDF nativo de Chrome/PDFium.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import WebSocket from 'ws';
const dir=path.resolve('tmp/pdfs');mkdirSync(dir,{recursive:true});
const pdf=readFileSync(path.join(dir,'resumenes-masivos-prueba.pdf'));
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length});res.end(pdf)});
let browser,socket;
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=mkdtempSync(path.join(dir,'pdf-browser-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--disable-gpu','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const url=await new Promise((resolve,reject)=>{let s='';const t=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.once('error',reject);browser.stderr.on('data',c=>{s+=c;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(t);resolve(m[1])}})});
 socket=new WebSocket(url);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});
 let seq=0;const pending=new Map();socket.on('message',raw=>{const m=JSON.parse(String(raw));const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(Error(method)),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Page.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1300,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/prueba.pdf#zoom=85`},sessionId);
 await new Promise(r=>setTimeout(r,1800));
 for(let page=1;page<=5;page++){
  // Miniaturas del visor nativo, en viewport fijo de QA.
  const point={x:150,y:155+(page-1)*204};
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
  await new Promise(r=>setTimeout(r,500));
  const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);
  writeFileSync(path.join(dir,`resumenes-masivos-pagina-${page}.png`),Buffer.from(screenshot.data,'base64'));
 }
 console.log('Renderizadas 5 paginas con Chrome PDFium en tmp/pdfs');
} finally {socket?.close();browser?.kill();await new Promise(r=>server.close(r))}
