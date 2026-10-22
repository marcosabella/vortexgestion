// Regresion de validacion nativa y guardado del formulario real de conceptos. Sin Supabase.
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
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {ItemTallerForm} from './src/components/taller/TallerForms';
window.fetch=()=>{throw Error('Conexiones externas prohibidas')};window.itemCalls=[];
const data={comercioId:'comercio-local',isAdmin:true,isPending:false,run:async args=>{window.itemCalls.push(args)}};
createRoot(document.getElementById('root')).render(<ItemTallerForm data={data} orden={{id:'orden-local',version:3}} onClose={()=>{}}/>);`;
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
  const profile = mkdtempSync(path.join(tmpdir(), 'vortex-taller-conceptos-ui-'));
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
  const navigate = async route => { await send('Page.navigate', { url: origin + route }, sessionId); await wait('Boolean(document.querySelector("input[name=cantidad]"))'); };
  const open = async () => { await evaluate('document.querySelector("button[aria-haspopup=dialog]").click()'); await wait(exists('input[aria-label="Buscar cliente"]')); };

  await navigate('/nuevo');
  const changeType=async tipo=>{await evaluate(`(()=>{const el=document.querySelector('select[name=tipo]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(tipo)});el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(`document.querySelector('select[name=tipo]').value===${JSON.stringify(tipo)}`);};
  const valid=()=>evaluate('document.querySelector("input[name=cantidad]").checkValidity()');
  await changeType('repuesto');
  await click('Buscar repuesto');await wait(exists('[role=dialog]'));await click('Elegir');await wait('!document.querySelector("[role=dialog]")');
  assert.equal(await evaluate('document.querySelector("input[name=cantidad]").value'),'1');
  // Reproduce la restriccion previa en el mismo input del navegador.
  await evaluate('document.querySelector("input[name=cantidad]").min="0.0001"');
  assert.equal(await evaluate('document.querySelector("input[name=cantidad]").validity.stepMismatch'),true);
  await evaluate('document.querySelector("input[name=cantidad]").min="1"');
  assert.equal(await valid(),true,'Cantidad inicial 1 valida');
  await click('Guardar');await wait('window.itemCalls.length===1');
  assert.equal(await evaluate('window.itemCalls[0].args.p_datos.cantidad'),1);
  assert.equal(await evaluate('window.itemCalls[0].args.p_datos.producto_id'),'producto-local');
  for(const value of ['0','-1','1.5','1000000']){await set('input[name=cantidad]',value);assert.equal(await valid(),false,'Repuesto invalido: '+value);await click('Guardar');assert.equal(await evaluate('window.itemCalls.length'),1);}
  for(const value of ['2','999999']){await set('input[name=cantidad]',value);assert.equal(await valid(),true,'Repuesto entero: '+value);}
  await set('input[name=cantidad]','2');await click('Guardar');await wait('window.itemCalls.length===2');
  assert.equal(await evaluate('window.itemCalls[1].args.p_datos.cantidad'),2);
  await changeType('mano_obra');await set('input[name=cantidad]','1.5');assert.equal(await valid(),true,'Horas decimales');await click('Guardar');await wait('window.itemCalls.length===3');
  assert.equal(await evaluate('window.itemCalls[2].args.p_datos.cantidad'),1.5);
  assert.equal(await evaluate('window.itemCalls[2].args.p_datos.producto_id'),null);
  await changeType('servicio_externo');
  for(const value of ['0.0001','1','1.5']){await set('input[name=cantidad]',value);assert.equal(await valid(),true,'Servicio decimal: '+value);}
  await set('input[name=cantidad]','0');assert.equal(await valid(),false);
  assert.deepEqual(errors,[],'Sin excepciones JavaScript');
  console.log('OK navegador real: reproduce el bloqueo anterior; guarda repuestos con cantidad 1 y 2, rechaza fracciones y limites invalidos, conserva decimales en mano de obra y servicios. Datos ficticios, sin Supabase.');
} finally { socket?.close(); browser?.kill(); await new Promise(resolve => server.close(resolve)); }
