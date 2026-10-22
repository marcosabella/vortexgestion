// Cobro de Taller con el formulario y los medios de pago reales. RPC y cheques simulados.
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
export const useTarjetas=()=>({tarjetas:[]});export const useTarjetaCuotas=()=>({tarjetaCuotas:[]});
export const useBancos=()=>({bancos:[{id:'banco-local',nombre_banco:'Banco de prueba',numero_cuenta:'001'}]});
export const useToast=()=>({toast:()=>{}});export const useTaller=()=>({});export const tallerError=e=>e.message;export const tallerJson=d=>d;
export const supabase={from:name=>{if(name!=='cheques')throw Error('Tabla inesperada');return {insert:values=>{window.chequeCalls.push(values);return {select:()=>({single:async()=>({data:{id:'cheque-local'},error:null})})}}}}};
`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {FacturarOrdenForm} from './src/components/taller/FacturarOrdenForm';
window.fetch=()=>{throw Error('Conexiones externas prohibidas')};window.itemCalls=[];window.chequeCalls=[];window.closedCount=0;
const data={isPending:false,run:async args=>{window.itemCalls.push(args)}};
createRoot(document.getElementById('root')).render(<FacturarOrdenForm data={data} orden={{id:'orden-local',cliente_id:'cliente-local'}} total={423.5} onClose={()=>window.closedCount++}/>);`;
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
  const profile = mkdtempSync(path.join(tmpdir(), 'vortex-taller-cobro-ui-'));
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

  const saleDisabled=()=>evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim().startsWith("Generar venta por")).disabled');
  const choose=async(index,label)=>{await evaluate(`document.querySelectorAll('button[role=combobox]')[${index}].click()`);await wait('Boolean(document.querySelector("[role=option]"))');await evaluate(`[...document.querySelectorAll('[role=option]')].find(o=>o.textContent.trim()===${JSON.stringify(label)}).click()`);await wait('!document.querySelector("[role=option]")');};
  const generate=async()=>{await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim().startsWith("Generar venta por")).click()');await wait('window.itemCalls.length===1&&window.closedCount===1');return evaluate('window.itemCalls[0]');};
  await navigate('/nuevo');
  assert.equal(await saleDisabled(),true,'No imputa cuenta corriente automaticamente');
  assert.equal(await evaluate('document.querySelector("input[type=number]").value'),'423.5');
  await click('Agregar Pago');await wait('Boolean(document.querySelector("tbody"))');assert.equal(await saleDisabled(),false);
  let result=await generate();assert.equal(result.args.p_pagos[0].tipo_pago,'contado');assert.equal(result.args.p_pagos[0].monto,423.5);
  await navigate('/nuevo');await choose(0,'Transferencia');await choose(1,'Banco de prueba - 001');await click('Agregar Pago');await wait('Boolean(document.querySelector("tbody"))');
  result=await generate();assert.equal(result.args.p_pagos[0].tipo_pago,'transferencia');assert.equal(result.args.p_pagos[0].banco_id,'banco-local');
  await navigate('/nuevo');await choose(0,'Cheque');await click('Agregar Pago');await wait('Boolean(document.getElementById("numero_cheque"))');
  assert.equal(await evaluate('document.getElementById("monto").value'),'423.5','Cheque recibe el monto elegido');
  await set('#numero_cheque','12345678');await set('#banco_emisor','Banco emisor de prueba');await set('#emisor_nombre','Cliente de prueba');await click('Registrar Cheque y Continuar');await wait('!document.querySelector("[role=dialog]")');
  result=await generate();assert.equal(result.args.p_pagos[0].tipo_pago,'cheque');assert.equal(result.args.p_pagos[0].cheque_id,'cheque-local');assert.equal(await evaluate('window.chequeCalls[0][0].monto'),423.5);
  await navigate('/nuevo');await set('input[type=number]','100');await click('Agregar Pago');await wait('Boolean(document.querySelector("tbody"))');assert.equal(await saleDisabled(),true,'Pago parcial requiere completar el saldo');
  await choose(0,'Cuenta Corriente');await click('Agregar Pago');await wait('document.querySelectorAll("tbody tr").length===2');result=await generate();assert.deepEqual(result.args.p_pagos.map(p=>[p.tipo_pago,p.monto]),[['contado',100],['cta_cte',323.5]]);
  assert.deepEqual(errors,[],'Sin excepciones JavaScript');
  console.log('OK cobro real en navegador: contado, transferencia con banco, cheque con monto y datos, pago mixto y cuenta corriente solo por el saldo elegido. Sin servicios externos.');
} finally { socket?.close(); browser?.kill(); await new Promise(resolve => server.close(resolve)); }
