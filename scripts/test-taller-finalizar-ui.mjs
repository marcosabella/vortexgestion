// Finalizacion desde el modal real, datos ficticios y RPC simulada.
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
export const useClientes=()=>({data:[]});
export const useCreateCliente=()=>({});export const useUpdateCliente=()=>({});
export const useConsultarArca=()=>({});export const useProveedores=()=>({data:[]});
export const useProductos=()=>({productos:[{id:'producto-local',cod_producto:'F001',descripcion:'Filtro de prueba',tipo_moneda:'ARS',precio_venta:121,porcentaje_iva:21,precio_costo:50,stock:10}],isLoading:false,error:null});
export const useTallerMarcasModelos=()=>({data:{marcas:[],modelos:[]}});
export const useTallerVariantes=()=>({data:[]});export const useTaller=()=>({});
export const tallerJson=data=>data;export const tallerError=error=>error.message;
`;
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {FinalizarTrabajoModal} from './src/components/taller/FinalizarTrabajoModal';
window.fetch=()=>{throw Error('Conexiones externas prohibidas')};window.itemCalls=[];window.closedCount=0;
const data={isPending:false,run:async args=>{window.itemCalls.push(args);await new Promise(resolve=>window.release=resolve);if(window.failNext){window.failNext=false;throw Error('Error de prueba');}}};
function App(){const [closed,setClosed]=useState(false);const [version,setVersion]=useState(3);window.refreshVersion=()=>setVersion(4);return closed?<p>Modal cerrado</p>:<FinalizarTrabajoModal data={data} orden={{id:'orden-local',version,trabajo_realizado:location.search.includes('existing')?'Trabajo previamente cargado':''}} onClose={()=>{window.closedCount++;setClosed(true)}}/>;}
createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: repo }, write: false, bundle: true,
  platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'local-fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\/hooks\/(useClientes|useConsultarArca|useProveedores|useProductos|useTaller)$/ }, () => ({ path: 'fixtures', namespace: 'fixtures' }));
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
  const profile = mkdtempSync(path.join(tmpdir(), 'vortex-taller-finalizar-ui-'));
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
  const set = async (selector, value) => { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
  const exists = selector => `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
  const navigate = async route => { await send('Page.navigate', { url: origin + route }, sessionId); await wait('Boolean(document.querySelector("textarea[name=trabajo_realizado]"))'); };
  const open = async () => { await evaluate('document.querySelector("button[aria-haspopup=dialog]").click()'); await wait(exists('input[aria-label="Buscar cliente"]')); };

  await navigate('/nuevo');
  const disabled=()=>evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Finalizar trabajo").disabled');
  assert.equal(await disabled(),true,'Trabajo faltante bloquea finalizar');
  await set('textarea[name=trabajo_realizado]','   ');assert.equal(await disabled(),true,'Espacios no completan el campo');
  await set('textarea[name=trabajo_realizado]','  Cambio de filtro  ');
  await set('textarea[name=detalle_finalizacion]','  Control final correcto  ');
  await evaluate('window.refreshVersion()');
  await evaluate('window.failNext=true');await click('Finalizar trabajo');await wait('window.itemCalls.length===1');
  await evaluate('document.querySelector("form").requestSubmit()');
  assert.equal(await evaluate('window.itemCalls.length'),1,'No duplica durante el guardado');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Cancelar").disabled'),true);
  assert.deepEqual(await evaluate('window.itemCalls[0]'),{name:'taller_finalizar_orden',args:{p_orden_id:'orden-local',p_version:3,p_trabajo_realizado:'Cambio de filtro',p_detalle:'Control final correcto'}});
  await evaluate('window.release()');await wait('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Finalizar trabajo"&&!b.disabled)');
  assert.equal(await evaluate('window.closedCount'),0,'Error conserva el modal');
  assert.equal(await evaluate('document.querySelector("textarea[name=trabajo_realizado]").value'),'  Cambio de filtro  ','Error conserva los datos');
  await click('Finalizar trabajo');await wait('window.itemCalls.length===2');await evaluate('window.release()');await wait('window.closedCount===1');
  assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'),false,'Cierra al finalizar');
  await navigate('/nuevo?existing');
  assert.equal(await evaluate('document.querySelector("textarea[name=trabajo_realizado]").value'),'Trabajo previamente cargado');
  assert.equal(await disabled(),false,'Trabajo previo habilita finalizar');
  await click('Cancelar');await wait('window.closedCount===1');assert.equal(await evaluate('window.itemCalls.length'),0,'Cancelar no guarda');
  assert.deepEqual(errors,[],'Sin excepciones JavaScript');
  console.log('OK modal real: trabajo obligatorio y precargado, guardado con observaciones en una RPC, errores conservan datos, evita duplicados, cancelar no guarda. Sin Supabase.');

} finally { socket?.close(); browser?.kill(); await new Promise(resolve => server.close(resolve)); }
