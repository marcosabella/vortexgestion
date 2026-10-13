// Navegador local con RPC ficticia: no usa Supabase, cuentas reales ni datos productivos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import WebSocket from 'ws';
import { ESLint } from 'eslint';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const assets = path.join(repo, 'dist/assets');
const css = readFileSync(path.join(assets, readdirSync(assets).find(f => /^index-.*\.css$/.test(f))), 'utf8');
const qr = '11111111-1111-4111-8111-111111111111';
const opening = '22222222-2222-4222-8222-222222222222';
const profile = mkdtempSync(path.join(repo, '.restaurante-qr-browser-'));
const hooks = `
export const useComercio=()=>({comercio:{id:'comercio',nombre_comercio:'Restaurante prueba'}});
export const useToast=()=>({toast:()=>{}});`;
const db = `
const carta=[{id:'carta-1',descripcion:'Milanesa con papas y ensalada de estación',precio:12500,sector:'Platos'},{id:'carta-2',descripcion:'Agua mineral',precio:2500,sector:'Bebidas'}];
window.rpcCalls=[];window.rpcError=false;window.mesaClosed=false;
export const supabase={rpc:(name,args)=>{
 const promise=new Promise(resolve=>setTimeout(()=>{
  window.rpcCalls.push({name,args});
  if(window.rpcError){resolve({data:null,error:new Error('Error de prueba')});return;}
  if(name==='restaurante_qr_mesas'){resolve({data:[{mesa_id:'mesa-1',nombre:'Mesa 1',qr_token:'${qr}'}],error:null});return;}
  if(name==='restaurante_qr_apertura'){resolve({data:{mesa_id:'mesa-1',nombre:'Mesa 1',qr_token:'${qr}',apertura_token:'${opening}'},error:null});return;}
  const authorized=args.p_apertura_token==='${opening}'&&!window.mesaClosed;
  resolve({data:{comercio:'Restaurante prueba',mesa:'Mesa 1',carta,estado_consulta:authorized?'vigente':args.p_apertura_token?'vencida':window.mesaClosed?'sin_apertura':'requiere_acceso',consumo:authorized?{total:27500,items:[{id:'pedido-1',descripcion:'Milanesa con papas y ensalada de estación',cantidad:2,precio:12500,subtotal:25000,adicionales:[]},{id:'pedido-2',descripcion:'Agua mineral',cantidad:1,precio:2500,subtotal:2500,adicionales:[]}]}:null},error:null});
 },35));promise.abortSignal=()=>promise;return promise;
}};`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import RestauranteCarta from './src/pages/RestauranteCarta';
import {RestauranteQrMesas} from './src/components/restaurante/RestauranteQrMesas';
window.queryClient=new QueryClient();window.prints=[];
const staff=location.search.includes('staff');
createRoot(document.getElementById('root')).render(<QueryClientProvider client={window.queryClient}><MemoryRouter initialEntries={['/carta/mesa/${qr}']}><Routes><Route path='/carta/mesa/:qr' element={staff?<main className='mx-auto max-w-3xl p-4'><RestauranteQrMesas comercioId='comercio' nombreComercio='Restaurante prueba'/></main>:<RestauranteCarta/>}/></Routes></MemoryRouter></QueryClientProvider>);`;
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: repo }, write: false, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'local-only', setup(b) {
  b.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'fixture-db' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture-db' }, () => ({ contents: db, loader: 'js' }));
  b.onResolve({ filter: /^@\/hooks\/(useComercio|use-toast)$/ }, () => ({ path: 'hooks', namespace: 'fixture-hooks' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture-hooks' }, () => ({ contents: hooks, loader: 'js' }));
  b.onResolve({ filter: /^@\/utils\/documentoPrint$/ }, () => ({ path: 'print', namespace: 'fixture-print' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture-print' }, () => ({ contents: 'export const printHtml=async html=>{window.prints.push(html);};', loader: 'js' }));
  b.onResolve({ filter: /^@\// }, args => { for (const ext of ['.tsx', '.ts', '.js']) { try { return { path: require.resolve(path.join(repo, 'src', args.path.slice(2)) + ext) }; } catch { /* Buscar extensión siguiente. */ } } throw new Error(args.path); });
} }] });
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html; charset=utf-8');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/app.css' ? css : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
let browser, socket;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(process.env.BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const debuggerUrl = await new Promise((resolve, reject) => { let stderr = ''; const timer = setTimeout(() => reject(new Error('No inició el navegador')), 15000); browser.once('error', reject); browser.stderr.on('data', chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
  socket = new WebSocket(debuggerUrl); await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let seq = 0; const pending = new Map();
  socket.on('message', raw => { const m = JSON.parse(String(raw)); if (pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => reject(new Error(method)), 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const waitFor = async expression => { const until = Date.now() + 7000; while (Date.now() < until) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`No apareció: ${expression}\n${await evaluate('document.body.textContent')}\n${JSON.stringify(await evaluate('window.rpcCalls'))}`); };
  const click = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Falta botón');b.click();})()`);
  const navigate = async suffix => { await send('Page.navigate', { url: origin + '/carta/mesa/' + qr + suffix }, sessionId); await waitFor(suffix.includes('staff') ? 'document.querySelector("button")' : 'window.rpcCalls?.length>0'); };
  await navigate(''); await waitFor('document.querySelector("section[aria-label=Carta]")');
  assert.equal(await evaluate('document.querySelector("input")'), null);
  assert.equal(await evaluate('document.body.textContent.includes("Total de lo pedido")'), false);
  assert.equal(await evaluate('window.rpcCalls.every(c=>c.name==="restaurante_consulta_publica" && c.args.p_apertura_token===null)'), true);
  for (const [width, height] of [[320, 844], [390, 844], [768, 1024], [1440, 900]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 }, sessionId);
    const layout = await evaluate('({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})');
    assert.ok(layout.scroll <= layout.width + 1, 'Sin scroll horizontal en ' + width);
  }
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>/Pedir|Pagar|Cobrar|Agregar|Solicitar cuenta|Consultar lo pedido/.test(b.textContent))'), false);
  console.log('OK carta pública sin consumo ni códigos, sólo lectura y diseño 320/390/768/1440 px');
  await evaluate('Object.defineProperty(navigator,"onLine",{configurable:true,value:false});window.dispatchEvent(new Event("offline"))');
  await waitFor('document.body.textContent.includes("Sin conexión")');
  assert.equal(await evaluate('document.querySelector("section[aria-label=Carta]")'), null);
  await evaluate('Object.defineProperty(navigator,"onLine",{configurable:true,value:true});window.dispatchEvent(new Event("online"))');
  await waitFor('document.querySelector("section[aria-label=Carta]")');
  await evaluate('window.rpcError=true;window.queryClient.invalidateQueries({queryKey:["restaurante-consulta"]})');
  await waitFor('document.body.textContent.includes("No se pudo cargar")');
  await evaluate('window.rpcError=false'); await click('Volver a consultar');
  await waitFor('document.querySelector("section[aria-label=Carta]")');
  await evaluate('sessionStorage.setItem("mesa-consulta:'+qr+'", "'+opening+'")');
  await navigate('#apertura='+opening); await waitFor('document.querySelector("section[aria-label=Carta]")');
  assert.equal(await evaluate('location.hash'), '');
  assert.equal(await evaluate('sessionStorage.getItem("mesa-consulta:'+qr+'")'), null);
  assert.equal(await evaluate('window.rpcCalls.every(c=>c.args.p_apertura_token===null)'), true);
  assert.equal(await evaluate('document.body.textContent.includes("Total de lo pedido")'), false);
  assert.equal(await evaluate('document.querySelector("input")'), null);
  console.log('OK errores/conexión y enlaces anteriores: sólo carta, sin enviar credenciales');
  if (process.env.RESTAURANTE_QR_SCREENSHOT) {
    const capture = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(process.env.RESTAURANTE_QR_SCREENSHOT, Buffer.from(capture.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    const mobileCapture = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(process.env.RESTAURANTE_QR_SCREENSHOT.replace('.png', '-movil.png'), Buffer.from(mobileCapture.data, 'base64'));
  }
  await navigate('?staff'); await click('Generar / ver QR por mesa'); await waitFor('document.querySelector("img")?.naturalWidth===1200');
  assert.equal(await evaluate('document.querySelector("img").naturalHeight'), 1500);
  await click('Imprimir'); await waitFor('window.prints.length===1');
  assert.equal(await evaluate('window.prints[0].includes("data:image/png")'), true);
  assert.equal(await evaluate('document.querySelectorAll("img").length'), 1);
  assert.equal(await evaluate('document.querySelector("input")'), null);
  assert.equal(await evaluate('document.body.textContent.includes("apertura") || document.body.textContent.includes("consumo")'), false);
  assert.equal(await evaluate('window.rpcCalls.some(c=>c.name==="restaurante_qr_apertura")'), false);
  if (process.env.RESTAURANTE_QR_PNG) { const image = await evaluate('document.querySelector("img").src'); writeFileSync(process.env.RESTAURANTE_QR_PNG, Buffer.from(image.split(',')[1], 'base64')); }
  for (const width of [320, 390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 }, sessionId);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'), true);
  }
  console.log('OK QR fijo para carta: PNG 1200×1500, impresión y configuración responsive');
  const files = ['src/types/restauranteConsulta.ts', 'src/hooks/useRestauranteConsulta.ts', 'src/utils/restauranteQr.ts', 'src/pages/RestauranteCarta.tsx', 'src/pages/Comercio.tsx', 'src/components/restaurante/RestauranteConfiguracion.tsx', 'src/components/restaurante/RestauranteQrMesas.tsx', 'src/components/restaurante/RestauranteQrApertura.tsx', 'src/components/restaurante/RestauranteDetalle.tsx', 'src/App.tsx'];
  const lint = await new ESLint({ cwd: repo }).lintFiles(files);
  const errors = lint.flatMap(result => result.messages.filter(m => m.severity === 2).map(m => `${result.filePath}:${m.line} ${m.message}`));
  assert.deepEqual(errors, []);
  console.log(`OK lint sin errores en archivos nuevos y modificados (${lint.reduce((total, result) => total + result.warningCount, 0)} advertencias)`);
} finally {
  if (socket) socket.terminate();
  if (browser) { browser.kill(); await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 3000); } }); }
  server.close();
  const target = realpathSync(profile);
  if (path.dirname(target) === realpathSync(repo) && path.basename(target).startsWith('.restaurante-qr-browser-')) rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
