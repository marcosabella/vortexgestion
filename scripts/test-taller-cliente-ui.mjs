// Formulario real de vehículo y alta real de cliente, con hooks simulados. Sin Supabase.
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
import {useState} from 'react';
const original={id:'10000000-0000-4000-8000-000000000001',nombre:'José',apellido:'Pérez',cuit:'20-12345678-6'};
export function useClientes(){const [error,setError]=useState(location.search.includes('error')?Error('Sin conexión'):null);return {data:[original],isLoading:false,error,refetch:async()=>setError(null)};}
export function useCreateCliente(){const [isPending,setPending]=useState(false);return {isPending,mutateAsync:async datos=>{setPending(true);window.clientCalls.push(datos);try {await new Promise(resolve=>window.releaseClient=resolve);if(window.failNext){window.failNext=false;throw Error('Cliente duplicado de prueba');}return {...datos,id:'10000000-0000-4000-8000-000000000002'};}finally{setPending(false);}}};}
export const useUpdateCliente=()=>({isPending:false,mutateAsync:async data=>data});
export const useConsultarArca=()=>({consultarCuit:async()=>null,isLoading:false});
export const useProveedores=()=>({data:[]});export const useProductos=()=>({productos:[]});
export const useTallerMarcasModelos=()=>({data:{marcas:[{id:'marca',nombre:'RENAULT'}],modelos:[{id:'modelo',marca_id:'marca',nombre:'KANGOO'}]},refetch:async()=>{}});
export const useTallerVariantes=()=>({data:[]});export const useTaller=()=>({});
export const tallerJson=data=>data;export const tallerError=error=>error.message;
`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {VehiculoForm} from './src/components/taller/TallerForms';
window.fetch=()=>{throw Error('Conexiones externas prohibidas en esta prueba')};window.clientCalls=[];window.vehicleCalls=[];window.vehicleClosed=0;
const vehiculo=location.search.includes('editar')?{id:'vehiculo',cliente_id:'10000000-0000-4000-8000-000000000001',patente:'AA123BB',marca_id:'marca',modelo_id:'modelo',marca:'RENAULT',modelo:'KANGOO',kilometraje:45000,activo:true}:undefined;
const data={comercioId:'comercio-local',isAdmin:true,isPending:false,run:async args=>{window.vehicleCalls.push(args)}};
createRoot(document.getElementById('root')).render(<VehiculoForm data={data} vehiculo={vehiculo} onClose={()=>window.vehicleClosed++}/>);`;
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
  const profile = mkdtempSync(path.join(tmpdir(), 'vortex-taller-cliente-ui-'));
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
    const id = ++seq; const timer = setTimeout(() => reject(Error(method)), 12000); pending.set(id, { resolve, reject, timer });
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
  const navigate = async route => { await send('Page.navigate', { url: origin + route }, sessionId); await wait('Boolean(document.querySelector("input[name=patente]"))'); };
  const open = async () => { await evaluate('document.querySelector("button[aria-haspopup=dialog]").click()'); await wait(exists('input[aria-label="Buscar cliente"]')); };

  await navigate('/nuevo');
  await set('input[name=patente]', 'AB123CD'); await set('input[name=kilometraje]', '12345');
  await open();
  await set('input[aria-label="Buscar cliente"]', 'perez jose');
  assert.ok(await evaluate(exists('button[aria-label="Elegir cliente José Pérez"]')), 'Búsqueda sin acentos y en distinto orden');
  await set('input[aria-label="Buscar cliente"]', '20123456786');
  assert.ok(await evaluate(exists('button[aria-label="Elegir cliente José Pérez"]')), 'CUIT sin guiones');
  await set('input[aria-label="Buscar cliente"]', 'inexistente');
  await wait('document.body.textContent.includes("No se encontraron clientes")');
  await click('Nuevo cliente'); await wait('Boolean(document.getElementById("nombre"))');
  await click('Volver a buscar'); await wait(exists('input[aria-label="Buscar cliente"]'));
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify('input[aria-label="Buscar cliente"]')}).value`), 'inexistente', 'Cancelar conserva búsqueda');
  await click('Nuevo cliente'); await wait('Boolean(document.getElementById("nombre"))');
  await set('#cuit', '12345678'); await set('#nombre', 'María'); await set('#apellido', 'Gómez');
  await click('Crear Cliente'); await wait('window.clientCalls.length===1');
  assert.equal(await evaluate('document.querySelectorAll("form").length'), 2);
  await click('Volver a buscar');
  assert.equal(await evaluate('Boolean(document.getElementById("nombre"))'), true, 'No cierra durante guardado');
  await evaluate('window.releaseClient()'); await wait('!document.querySelector("[role=dialog]")');
  assert.ok(await evaluate('document.querySelector("button[aria-haspopup=dialog]").textContent.includes("María Gómez")'), 'Nuevo cliente elegido sin refetch');
  assert.equal(await evaluate('document.querySelector("input[name=patente]").value'), 'AB123CD');
  assert.equal(await evaluate('document.querySelector("input[name=kilometraje]").value'), '12345');
  assert.equal(await evaluate('window.vehicleCalls.length'), 0, 'El submit del cliente no guarda el vehículo');
  assert.equal(await evaluate('window.vehicleClosed'), 0, 'El alta del cliente no sale de vehículo');
  await click('Buscar marca'); await wait(exists('input[aria-label="Buscar marca"]')); await click('RENAULT');
  await click('Buscar modelo'); await wait(exists('input[aria-label="Buscar modelo"]')); await click('KANGOO');
  await click('Guardar'); await wait('window.vehicleCalls.length===1');
  assert.equal(await evaluate('window.vehicleCalls[0].args.p_datos.cliente_id'), '10000000-0000-4000-8000-000000000002');
  assert.equal(await evaluate('window.vehicleCalls[0].args.p_datos.patente'), 'AB123CD');

  await navigate('/editar?editar');
  assert.ok(await evaluate('document.querySelector("button[aria-haspopup=dialog]").textContent.includes("José Pérez")'), 'Edición muestra el titular existente');
  await open(); await click('Nuevo cliente'); await wait('Boolean(document.getElementById("nombre"))');
  await set('#cuit', '12345678'); await set('#nombre', 'Cliente'); await set('#apellido', 'Error');
  await evaluate('window.failNext=true'); await click('Crear Cliente'); await wait('window.clientCalls.length===1');
  await evaluate('window.releaseClient()'); await wait('document.body.textContent.includes("Cliente duplicado de prueba")');
  assert.ok(await evaluate('Boolean(document.getElementById("nombre"))'), 'Error conserva alta para corregir');
  assert.equal(await evaluate('document.getElementById("nombre").value'), 'Cliente');
  await click('Volver a buscar'); await wait(exists('input[aria-label="Buscar cliente"]'));
  await click('Elegir'); await wait('!document.querySelector("[role=dialog]")');
  await click('Guardar'); await wait('window.vehicleCalls.length===1');
  assert.equal(await evaluate('window.vehicleCalls[0].args.p_datos.cliente_id'), '10000000-0000-4000-8000-000000000001');

  await navigate('/nuevo?error'); await open(); await wait('document.body.textContent.includes("No se pudieron cargar los clientes")');
  await click('Reintentar'); await wait(exists('button[aria-label="Elegir cliente José Pérez"]'));
  assert.deepEqual(errors, [], 'Sin excepciones JavaScript');
  console.log('OK Taller: búsqueda por nombre/CUIT, alta y selección inmediata, cancelación, errores y reintento, edición, conservación del vehículo y submit aislado. Navegador real, datos ficticios.');
} finally { socket?.close(); browser?.kill(); await new Promise(resolve => server.close(resolve)); }
