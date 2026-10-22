// Consultas reales de presupuestos y documentos de Taller. Datos ficticios.
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
export const useComercio=()=>({comercio:{id:'comercio-local'}});export const useToast=()=>({toast:()=>{}});
export const useAuth=()=>({user:{id:'usuario-local'}});export const useComercioParametrizacion=()=>({data:{modulos:{taller:true}}});
const automatico={id:'automatico',numero_comprobante:'INTERNO',origen_taller_automatico:true,presupuesto_items:[],presupuesto_pagos:[]};
const real={id:'real',numero_comprobante:'EMITIDO',origen_taller_automatico:false,presupuesto_items:[],presupuesto_pagos:[]};
export const supabase={from:table=>{let id;const q={select:()=>q,eq:(k,v)=>{if(k==='id')id=v;return q;},order:async()=>({data:[automatico,real],error:null}),maybeSingle:async()=>({data:table==='ventas'?{id:'venta',numero_comprobante:'VENTA'}:id==='automatico'?automatico:real,error:null})};return q;}};
`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {useTallerDocumento} from './src/hooks/useTaller';import {usePresupuestos} from './src/hooks/usePresupuestos';
window.fetch=()=>{throw Error('Conexiones externas prohibidas')};
function App(){const automatico=useTallerDocumento('comercio-local','automatico','presupuesto'),real=useTallerDocumento('comercio-local','real','presupuesto'),venta=useTallerDocumento('comercio-local','venta','venta'),list=usePresupuestos();if(automatico.isLoading||real.isLoading||venta.isLoading||list.isLoading)return <p>Cargando</p>;window.results={automatico:automatico.data,real:real.data,venta:venta.data,list:list.presupuestos};return <p id='ready'>Consultas listas</p>;}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><App/></QueryClientProvider>);`;
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: repo }, write: false, bundle: true,
  platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'local-fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\/hooks\// }, () => ({ path: 'fixtures', namespace: 'fixtures' }));
    builder.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({ path: 'fixtures', namespace: 'fixtures' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixtures' }, () => ({ contents: fixtures, loader: 'js', resolveDir: repo }));
    builder.onResolve({ filter: /^@\// }, args => {
      for (const ext of ['.tsx', '.ts', '.js']) { try { return { path: require.resolve(path.join(repo, 'src', args.path.slice(2)) + ext) }; } catch {} }
      throw Error(args.path);
    });
  } }] });
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html;charset=utf-8');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<!doctype html><html lang="es"><meta charset="utf-8"><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
let browser, socket;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = mkdtempSync(path.join(tmpdir(), 'vortex-taller-documentos-ui-'));
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(Error('Chrome timeout')), 15000);
    browser.once('error', reject); browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(url); await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let seq = 0; const pending = new Map(), errors = [];
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const task = pending.get(message.id); if (task) { clearTimeout(task.timer); pending.delete(message.id); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq; const timer = setTimeout(() => reject(Error(method)), 30000); pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const wait = async expression => { const end = Date.now() + 8000; while (Date.now() < end) { if (await evaluate(expression)) return; if (errors.length) throw Error(errors.join('\n')); await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('No se cumplió: ' + expression); };
  const click = async text => { await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)}).click()`); };
  const set = async (selector, value) => { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
  const exists = selector => `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
  const navigate = async route => { await send('Page.navigate', { url: origin + route }, sessionId); await wait('Boolean(document.querySelector("button[role=combobox]"))'); };
  const open = async () => { await evaluate('document.querySelector("button[aria-haspopup=dialog]").click()'); await wait(exists('input[aria-label="Buscar cliente"]')); };

  await send('Page.navigate',{url:origin},sessionId);await wait('Boolean(document.getElementById("ready"))');
  const result=await evaluate('window.results');
  assert.equal(result.automatico,null,'El documento interno no aparece como presupuesto de la orden');
  assert.equal(result.real.id,'real','El presupuesto emitido sigue disponible');assert.equal(result.venta.id,'venta','La venta sigue disponible');
  assert.deepEqual(result.list.map(p=>p.id),['real'],'Listado general excluye documentos internos');
  assert.deepEqual(errors,[],'Sin excepciones JavaScript');
  console.log('OK consultas reales en navegador: oculta documentos internos en Taller y Presupuestos, conserva presupuestos emitidos y ventas. Datos ficticios.');
} finally { socket?.close(); browser?.kill(); await new Promise(resolve => server.close(resolve)); }
