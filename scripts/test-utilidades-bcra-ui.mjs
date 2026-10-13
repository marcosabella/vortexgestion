// Navegador local con APIs ficticias: no usa Supabase ni consulta personas reales.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
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


let profile;
const hooks = `
import {useSyncExternalStore} from 'react';
let selected='comercio-a';const listeners=new Set();
window.setTestCommerce=id=>{selected=id;listeners.forEach(fn=>fn());};
export function useComercio(){const id=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>selected);return {comercio:{id,nombre_comercio:'Comercio prueba'}};}
export const useComercioParametrizacion=()=>({data:{modulos:{utilidades:!location.search.includes('disabled')}}});
export const useToast=()=>({toast:()=>{}});`;
const db = '';
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Utilidades from './src/pages/Utilidades';
window.calls=[];window.errorStatus=0;window.noRecords=false;window.emptyDate=false;
window.fetch=async(url,options)=>{window.calls.push({url,credentials:options.credentials}); await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,20);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
 if(window.errorStatus)return new Response(JSON.stringify({status:window.errorStatus,errorMessages:['Error ficticio']}),{status:window.errorStatus});
 if(url==="/.netlify/functions/cotizaciones-bna")return new Response(JSON.stringify({fuente:"https://www.bna.com.ar/Personas",fecha:"2024-06-13",hora:"09:55",consultadoEn:new Date().toISOString(),detalle:[{codigoMoneda:"USD",descripcion:"Dólar estadounidense",unidades:1,compra:1485,venta:1535},{codigoMoneda:"BRL",descripcion:"Real",unidades:100,compra:28600,venta:31600},{codigoMoneda:"EUR",descripcion:"Euro",unidades:1,compra:1655,venta:1765}]}),{status:200});
 const id=Number(url.split('/').at(-1)); let results;
 if(url.includes('/entidades'))results=[{codigoEntidad:20,denominacion:'BANCO DE CORDOBA'}];
 else if(url.includes('/estadisticascambiarias/'))results=window.emptyDate?{fecha:null,detalle:[]}:{fecha:new URL(url).searchParams.get('fecha')||'2024-06-12',detalle:[{codigoMoneda:'BRL',descripcion:'REAL',tipoCotizacion:304.154303,tipoPase:0.2005},{codigoMoneda:'JPY',descripcion:'YEN',tipoCotizacion:10,tipoPase:0.0066},{codigoMoneda:'USD',descripcion:'DOLAR E.E.U.U.',tipoCotizacion:1517,tipoPase:0},{codigoMoneda:'EUR',descripcion:'EURO',tipoCotizacion:1698.7366,tipoPase:1.1198}]};
 else if(url.includes('/denunciados/'))results={numeroCheque:id,denunciado:true,fechaProcesamiento:'2024-06-12',denominacionEntidad:'BANCO DE CORDOBA',detalles:[{sucursal:1,numeroCuenta:12345,causal:'Denunciado por titular'}]};
 else if(window.noRecords)return new Response(JSON.stringify({status:404,errorMessages:['Sin datos']}),{status:404});
 else if(url.includes('/ChequesRechazados/'))results={identificacion:id,denominacion:'Persona ficticia',causales:[{causal:'SIN FONDOS',entidades:[{entidad:1,detalle:[{nroCheque:507,fechaRechazo:'2024-06-12',monto:115000,fechaPago:null,fechaPagoMulta:null,estadoMulta:'IMPAGA',ctaPersonal:true,denomJuridica:null,enRevision:true}]}]}]};
 else results={identificacion:id,denominacion:'Persona ficticia',periodos:[{periodo:'202409',entidades:[{entidad:'Banco prueba',situacion:2,monto:59,diasAtrasoPago:15,enRevision:true}]},...(url.includes('/Historicas/')?[{periodo:'202408',entidades:[{entidad:'Banco prueba',situacion:1,monto:41}]}]:[])]};
 return new Response(JSON.stringify({status:200,results}),{status:200});
};
window.queryClient=new QueryClient();
createRoot(document.getElementById('root')).render(<QueryClientProvider client={window.queryClient}><BrowserRouter><Routes>{['cotizaciones','deudores','cheques-rechazados','cheques-denunciados'].map(vista=><Route key={vista} path={'/utilidades/'+vista} element={<Utilidades vista={vista}/>}/>)}</Routes></BrowserRouter></QueryClientProvider>);`;
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: repo }, write: false, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'local-only', setup(b) {
  b.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'fixture-db' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture-db' }, () => ({ contents: db, loader: 'js' }));
  b.onResolve({ filter: /^@\/hooks\/(useComercio|useComercioParametrizacion|use-toast)$/ }, () => ({ path: 'hooks', namespace: 'fixture-hooks' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture-hooks' }, () => ({ contents: hooks, loader: 'js', resolveDir: repo }));
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
  profile = mkdtempSync(path.join(repo, '.utilidades-browser-'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(process.env.BROWSER_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const debuggerUrl = await new Promise((resolve, reject) => { let stderr = ''; const timer = setTimeout(() => reject(new Error('No inició el navegador')), 15000); browser.once('error', reject); browser.stderr.on('data', chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
  socket = new WebSocket(debuggerUrl); await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let seq = 0; const pending = new Map();
  socket.on('message', raw => { const m = JSON.parse(String(raw)); if (pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => reject(new Error(method)), 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const waitFor = async expression => { const until = Date.now() + 7000; while (Date.now() < until) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`No apareció: ${expression}\n${await evaluate('document.body.textContent')}\n${JSON.stringify(await evaluate('window.calls'))}`); };
  const click = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Falta botón');b.click();})()`);
  const navigate = async (vista, suffix='') => { await send('Page.navigate', { url: origin + '/utilidades/' + vista + suffix }, sessionId); await waitFor('document.querySelector("h1") || document.body.textContent.includes("no está habilitado")'); };
  const fill = async (id, value) => { await evaluate('document.getElementById('+JSON.stringify(id)+').focus();document.getElementById('+JSON.stringify(id)+').select()'); await send('Input.insertText',{text:value},sessionId); };
  await navigate('cotizaciones','?disabled');
  assert.equal(await evaluate('window.calls.length'),0);
  assert.equal(await evaluate('document.querySelector("form")'),null);
  console.log('OK módulo deshabilitado: sin formularios ni consultas');
  await navigate('cotizaciones'); await waitFor('document.querySelector("table")');
  assert.equal(await evaluate('window.calls.length'),1);
  assert.equal(await evaluate('window.calls[0].url'),"/.netlify/functions/cotizaciones-bna");
  assert.equal(await evaluate('document.body.textContent.includes("1.535,00") && document.body.textContent.includes("100 unidades") && document.body.textContent.includes("09:55")'),true);
  assert.equal(await evaluate('document.querySelectorAll("th").length'),5);
  for (const width of [320,390,768,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640},sessionId);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),true,'BNA sin desbordamiento: '+width);
  }
  await fill('bna-filtro','EUR');assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),1);
  await evaluate('window.errorStatus=502');await click('Actualizar BNA');await waitFor('document.querySelector("[role=alert]")');assert.equal(await evaluate('document.querySelector("table")'),null);
  assert.equal(await evaluate('window.calls.every(c=>c.url==="/.netlify/functions/cotizaciones-bna")'),true,'Sin sustitución por divisas ante error BNA');
  await evaluate('window.errorStatus=0');
  await click('BCRA · Divisas');await waitFor('document.querySelector("table")');
  assert.equal(await evaluate('window.calls.length'),3);
  console.log('OK BNA por defecto: compra/venta, unidad del real, filtro y errores sin sustitución de fuente');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("tbody tr")].map(row=>row.cells[0].textContent)'),['USD','BRL','EUR']);
  await evaluate('document.querySelector("input[type=checkbox]").click()');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),4);
  await evaluate('document.querySelector("input[type=checkbox]").click()');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),3);
  await evaluate('const el=document.getElementById("bcra-fecha");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,"2024-06-13");el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));');
  await click('Consultar BCRA');await waitFor('document.body.textContent.includes("13/06/2024")');
  assert.equal(await evaluate('window.calls.at(-1).url.endsWith("?fecha=2024-06-13")'),true);
  await click('Última fecha disponible');await waitFor('document.body.textContent.includes("12/06/2024")');
  assert.equal(await evaluate('document.getElementById("bcra-fecha").value'),"");
  assert.equal(await evaluate('document.body.textContent.includes("12/06/2024")'),true);
  assert.equal(await evaluate('[...document.querySelectorAll("caption")].some(n=>n.textContent==="Cotizaciones de divisas")'),true);
  assert.equal(await evaluate('document.querySelectorAll("article").length'),0);
  for (const width of [320,390,768,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640},sessionId);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),true,'El desplazamiento horizontal queda en la grilla: '+width);
  }
  assert.equal(await evaluate('(()=>{const section=document.querySelector("form").parentElement;const title=section.querySelector("h2").getBoundingClientRect();const date=document.getElementById("bcra-fecha").getBoundingClientRect();const buttons=[...section.querySelectorAll("button")].map(el=>el.getBoundingClientRect());return [date,...buttons].every(rect=>Math.abs((rect.top+rect.bottom)/2-(title.top+title.bottom)/2)<2);})()'),true,'Título, fecha y botones en una fila de escritorio');
  if(process.env.UTILIDADES_COTIZACIONES_SCREENSHOT){const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(process.env.UTILIDADES_COTIZACIONES_SCREENSHOT,Buffer.from(capture.data,'base64'));}
  await fill('bcra-filtro','EUR'); assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),1);
  await evaluate('window.emptyDate=true'); await click('Consultar BCRA'); await waitFor('document.body.textContent.includes("No hay cotizaciones publicadas")');
  console.log('OK grilla de cotizaciones: fecha, filtro, fecha vacía y diseño móvil');
  await navigate('deudores'); assert.equal(await evaluate('window.calls.length'),0);
  await fill('bcra-identificacion','123'); await click('Consultar BCRA'); await waitFor('document.querySelector("[role=alert]")'); assert.equal(await evaluate('window.calls.length'),0);
  await fill('bcra-identificacion','20-12345678-6'); await click('Consultar BCRA'); await waitFor('document.querySelectorAll("table").length===3');
  assert.equal(await evaluate('document.body.textContent.includes("59.000,00")'),true);
  assert.equal(await evaluate('document.body.textContent.includes("Información en revisión")'),true);
  await evaluate('document.querySelector("input[type=checkbox]").click()'); await click('Consultar BCRA'); await waitFor('document.body.textContent.includes("08/2024")');
  assert.equal(await evaluate('document.body.textContent.includes("41.000,00")'),true);
  assert.equal(await evaluate('document.body.textContent.includes("100.000,00")'),false);
  await evaluate('window.setTestCommerce("comercio-b")'); await waitFor('document.querySelector("#bcra-identificacion")?.value===""'); assert.equal(await evaluate('document.querySelector("table")'),null);
  await fill('bcra-identificacion','20123456786'); await evaluate('window.errorStatus=429'); await click('Consultar BCRA'); await waitFor('document.body.textContent.includes("limitó las consultas")');
  assert.equal(await evaluate('document.querySelector("table")'),null);
  await evaluate('window.errorStatus=0;window.noRecords=true'); await click('Consultar BCRA'); await waitFor('document.body.textContent.includes("no devolvió registros")');
  assert.equal(await evaluate('document.querySelector("table")'),null);
  console.log('OK deudores: sin consultas automáticas, validación, miles a pesos, historial, aislamiento y errores');
  await navigate('cheques-rechazados'); await fill('bcra-identificacion','20123456786'); await click('Consultar BCRA'); await waitFor('document.body.textContent.includes("SIN FONDOS")');
  assert.equal(await evaluate('document.body.textContent.includes("115.000,00")'),true);
  assert.equal(await evaluate('document.body.textContent.includes("115.000.000,00")'),false);
  assert.equal(await evaluate('document.querySelectorAll("table").length'),2);
  assert.equal(await evaluate('document.querySelectorAll("table")[1].querySelectorAll("th").length'),11);
  console.log('OK cheques rechazados: toda la información en grilla e importe en pesos');
  await navigate('cheques-denunciados'); await waitFor('document.querySelectorAll("#bcra-banco option").length===2');
  await evaluate('const el=document.querySelector("#bcra-banco");el.value="20";el.dispatchEvent(new Event("change",{bubbles:true}))');
  await fill('bcra-cheque','507'); await click('Consultar BCRA'); await waitFor('document.body.textContent.includes("Sí, registra denuncias")');
  assert.equal(await evaluate('document.body.textContent.includes("Denunciado por titular")'),true);
  assert.equal(await evaluate('document.querySelectorAll("table").length'),2);
  assert.equal(await evaluate('window.calls.every(c=>(c.url.startsWith("https://api.bcra.gob.ar/") || c.url==="/.netlify/functions/cotizaciones-bna") && c.credentials==="omit")'),true);
  for(const width of [320,390,1440]) { await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640},sessionId); assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),true); }
  if(process.env.UTILIDADES_SCREENSHOT){const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(process.env.UTILIDADES_SCREENSHOT,Buffer.from(capture.data,'base64'));}
  console.log('OK cheque denunciado: banco oficial, estado y detalles en grillas');
  const files = ['src/pages/Utilidades.tsx','src/components/utilidades/CotizacionesBna.tsx','src/components/utilidades/GrillaUtilidades.tsx','src/utils/bna.ts','vite.config.ts','src/utils/bcra.ts','src/hooks/useUtilidadesBcra.ts','src/config/utilidadesNavigation.ts','src/config/parametrizacion.ts','src/config/moduleHelp.ts','src/App.tsx','src/components/AppSidebar.tsx'];
  const lint = await new ESLint({ cwd: repo }).lintFiles(files);
  const errors = lint.flatMap(result => result.messages.filter(m => m.severity === 2).map(m => `${result.filePath}:${m.line} ${m.message}`));
  assert.deepEqual(errors, []);
  console.log(`OK lint sin errores en archivos nuevos y modificados (${lint.reduce((total, result) => total + result.warningCount, 0)} advertencias)`);
} finally {
  if (browser && browser.exitCode === null) await new Promise(resolve => execFile('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  if (socket) socket.terminate();
  if (browser) { browser.kill(); await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 3000); } }); }
  server.close();
  const target = profile ? realpathSync(profile) : null;
  if (target && path.dirname(target) === realpathSync(repo) && path.basename(target).startsWith('.utilidades-browser-')) rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
