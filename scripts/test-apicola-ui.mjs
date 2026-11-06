// Navegador y PostgreSQL temporales. API local de prueba, sin Supabase remoto.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import WebSocket from 'ws';
import { iniciarApicolaPg, idApicola as id, literalSql as literal } from './fixtures/apicola-pg.mjs';

const root = process.cwd(), pg = await iniciarApicolaPg();
const comercioPdfFixture = JSON.stringify({ id: id(10), nombre_comercio: 'COMERCIO DEMO · PRUEBA LOCAL', calle: 'Av. de las Colmenas', numero: '123', localidad: 'Rafaela', provincia: 'Santa Fe', codigo_postal: '2300', telefono: '3492 123456', cuit: '30712345678', situacion_afip: 'Responsable Inscripto', ingresos_brutos: '123-456789-0', fecha_inicio_actividad: '2021-01-01', logo_url: '/logo.png', mostrar_razon_social_con_logo: true });
let browser, socket, server;
try {
  const clientFixture = `const request=body=>fetch('/api',{method:'POST',body:JSON.stringify({...body,actor:new URLSearchParams(location.search).get('actor')||'admin'})}).then(r=>r.json());export const supabase={rpc(name,args){return request({rpc:name,args})},from(table){const args={table,filters:[],orders:[]};const q={select(){return q},eq(k,v){args.filters.push([k,'=',v]);return q},gte(k,v){args.filters.push([k,'>=',v]);return q},lte(k,v){args.filters.push([k,'<=',v]);return q},contains(k,v){args.filters.push([k,'@>',v]);return q},or(value){args.or=value;return q},order(k,o){args.orders.push([k,o?.ascending!==false]);return q},range(start,end){args.start=start;args.end=end;return q},then(resolve,reject){return request(args).then(resolve,reject)}};return q}};`;
  const entry = `import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Apicola from'./src/pages/Apicola';import{AppSidebar}from'./src/components/AppSidebar';import{SidebarProvider,SidebarTrigger}from'./src/components/ui/sidebar';createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[location.pathname]}><SidebarProvider><AppSidebar/><main className='min-w-0 flex-1'><SidebarTrigger/><Routes><Route path='/apicola/:vista' element={<Apicola/>}/></Routes></main></SidebarProvider></MemoryRouter></QueryClientProvider></React.StrictMode>);`;
  const bundle = (await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', '__APP_BUILD_DATE__': '"2026-11-06T12:00:00Z"' }, plugins: [{ name: 'local-api', setup(b) {
    for (const [filter, name] of [[/^@\/hooks\/useComercio$/, 'commerce'], [/^@\/contexts\/AuthContext$/, 'auth'], [/^@\/hooks\/use-toast$/, 'toast'], [/^@\/integrations\/supabase\/client$/, 'db']]) b.onResolve({ filter }, () => ({ path: name, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: root, contents: args.path === 'commerce' ? `export const useComercio=()=>({comercio:${comercioPdfFixture}});` : args.path === 'auth' ? `export const useAuth=()=>({user:{id:new URLSearchParams(location.search).get('actor')==='operator'?'${id(2)}':'${id(1)}'}});` : args.path === 'toast' ? `const toast=()=>{};export const useToast=()=>({toast});` : clientFixture }));
    const auxiliares = [
      [/^@\/hooks\/useAdminComercios$/, 'export const useIsAppAdmin=()=>({data:false});'],
      [/^@\/hooks\/useCampoAccess$/, 'export const useCampoAccess=()=>({isAdmin:false});'],
      [/^@\/hooks\/useRestauranteUsuarios$/, 'export const useRestauranteAcceso=()=>({data:null});'],
      [/^@\/hooks\/useComercioParametrizacion$/, 'export const useComercioParametrizacion=()=>({data:{modulos:{apicola:true},inicio:{habilitado:false}}});'],
      [/^@\/hooks\/useNotificaciones$/, 'export const useNotificaciones=()=>({notificaciones:[]});'],
    ];
    auxiliares.forEach(([filter, contents], index) => { const namespace = 'sidebar-fixture-' + index; b.onResolve({ filter }, () => ({ path: 'hook', namespace })); b.onLoad({ filter: /.*/, namespace }, () => ({ contents, loader: 'js' })); });
  } }] })).outputFiles[0].text;
  const css = (await postcss([tailwindcss({ config: path.join(root, 'tailwind.config.ts') })]).process(readFileSync('src/index.css', 'utf8'), { from: path.join(root, 'src/index.css') })).css;
  server = createServer(async (req, res) => {
    if (req.url === '/logo.png' && existsSync('public/logo.png')) { res.setHeader('Content-Type', 'image/png'); res.end(readFileSync('public/logo.png')); return; }
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle); return; }
    if (req.url !== '/api') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(`<!doctype html><html lang='es'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>${css}</style><div id='root'></div><script src='/app.js'></script></html>`); return; }
    let raw = ''; for await (const part of req) raw += part;
    const body = JSON.parse(raw), auth = `SET app.actor='${body.actor === 'operator' ? id(2) : id(1)}'; SET ROLE authenticated;`;
    try {
      let data, count = null;
      if (body.rpc) {
        const a = body.args; let expression;
        if (body.rpc === 'apicola_permiso') expression = `apicola_permiso(${literal(a.p_comercio)},${literal(a.p_nivel)})`;
        else if (body.rpc === 'apicola_operar') expression = `apicola_operar(${literal(a.p_comercio)},${literal(a.p_accion)},${literal(JSON.stringify(a.p_datos))}::jsonb,${literal(a.p_clave)})`;
        else if (body.rpc === 'apicola_informe') expression = `apicola_informe(${[a.p_comercio, a.p_campana, a.p_apiario, a.p_desde, a.p_hasta].map(literal).join(',')})`;
        else throw Error('RPC no permitida');
        data = JSON.parse(pg.sql(auth + `SELECT to_jsonb(${expression});`));
      } else {
        const tables = ['apicola_campanas', 'apicola_apiarios', 'apicola_colmenas', 'apicola_existencias', 'apicola_registros', 'apicola_movimientos', 'apicola_tareas', 'apicola_parentescos'];
        if (!tables.includes(body.table)) throw Error('Tabla no permitida');
        const column = key => { if (!/^[a-z_]+$/.test(key)) throw Error('Columna no permitida'); return `"${key}"`; };
        const conditions = body.filters.map(([key, operator, value]) => {
          if (!['=', '>=', '<=', '@>'].includes(operator)) throw Error('Operador no permitido');
          return `${column(key)} ${operator} ${operator === '@>' ? `ARRAY[${value.map(literal).join(',')}]::uuid[]` : literal(value)}`;
        });
        if (body.or) conditions.push('(' + body.or.split(',').map(part => { const [key, operator, value] = part.split('.'); if (operator !== 'eq') throw Error('Filtro inválido'); return `${column(key)}=${literal(value)}`; }).join(' OR ') + ')');
        const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        const orders = body.orders.length ? ' ORDER BY ' + body.orders.map(([key, asc]) => `${column(key)} ${asc ? 'ASC' : 'DESC'}`).join(',') : '';
        const from = Number(body.start || 0), limit = Number(body.end ?? from + 499) - from + 1;
        const result = JSON.parse(pg.sql(auth + `SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM(SELECT * FROM public.${body.table}${where}${orders} LIMIT ${limit} OFFSET ${from}) t),'[]'::jsonb),'count',(SELECT count(*) FROM public.${body.table}${where}));`));
        data = result.data; count = result.count;
      }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data, count, error: null }));
    } catch (error) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: null, error: { message: error.message } })); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', '--user-data-dir=' + mkdtempSync(path.join(tmpdir(), 'vortex-apicola-chrome-')), '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { let buffer = ''; const timer = setTimeout(() => reject(Error('Chrome timeout')), 20000); browser.once('error', reject); browser.stderr.on('data', chunk => { buffer += chunk; const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } }); });
  socket = new WebSocket(url); await new Promise((r, j) => { socket.once('open', r); socket.once('error', j); }); let seq = 0; const pending = new Map();
  socket.on('message', raw => { const m = JSON.parse(String(raw)), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => reject(Error(method)), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetInfos } = await send('Target.getTargets'), targetId = targetInfos.find(t => t.type === 'page').targetId, { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); await send('Page.enable', {}, sessionId);
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const load = async (page, width = 1280) => { await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sessionId); await send('Page.navigate', { url: origin + '/apicola/' + page }, sessionId); await pause(1400); };
  const click = async text => { assert.ok(await evaluate(`(()=>{const all=[...document.querySelectorAll('button')],text=${JSON.stringify(text)},b=all.find(b=>b.textContent.trim()===text)||all.find(b=>b.textContent.includes(text));b?.click();return !!b})()`), text); await pause(650); };
  const fill = async (key, value) => evaluate(`(()=>{const e=document.getElementById('apicola-'+${JSON.stringify(key)});if(!e)throw Error('Campo no encontrado: '+${JSON.stringify(key)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const save = async () => { await click('Guardar registro'); assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`), false, await evaluate(`document.querySelector('[role="alert"]')?.textContent||'El formulario no se cerró'`)); };
  const out = path.join(root, 'private-backups/apicola-preview'); mkdirSync(out, { recursive: true });
  const capture = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId); writeFileSync(path.join(out, name + '.png'), Buffer.from(data, 'base64')); };
  const comprobarSubmenu = async () => assert.equal(await evaluate(`(()=>{const b=document.querySelector('button[title="Cuaderno de campo"]'),s=b.querySelector('span'),svg=b.querySelectorAll('svg'),t=s.getBoundingClientRect(),arrow=svg[svg.length-1].getBoundingClientRect();return s.scrollHeight<=parseFloat(getComputedStyle(s).lineHeight)+1&&t.right<=arrow.left+1&&t.top>=b.getBoundingClientRect().top})()`), true, 'Cuaderno de campo ocupa una línea y no se superpone con la flecha');
  await load('campanas');
  assert.ok(await evaluate(`document.querySelector('[data-sidebar="content"]').textContent.includes('Base productiva')`), 'Menú agrupado por base productiva');
  assert.ok(await evaluate(`document.querySelector('[data-sidebar="content"]').textContent.includes('Cuaderno de campo')`), 'Menú agrupado por cuaderno');
  await comprobarSubmenu();
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-sidebar="content"] button')].find(b=>b.textContent.trim()==='Base productiva').getAttribute('aria-expanded')`), 'true', 'El grupo de la sección actual abre automáticamente');
  await click('Base productiva'); assert.equal(await evaluate(`!!document.querySelector('[data-sidebar="content"] a[href="/apicola/campanas"]')`), false, 'Base productiva es colapsable');
  await click('Base productiva'); assert.equal(await evaluate(`!!document.querySelector('[data-sidebar="content"] a[href="/apicola/campanas"]')`), true);
  assert.equal(await evaluate(`document.body.textContent.includes('Producción y trazabilidad')||document.body.textContent.includes('Gestión económica')||document.body.textContent.includes('Especializaciones')`), false, 'Las etapas futuras no aparecen');
  await click('Nueva campaña'); await fill('nombre', 'Campaña local 2026/2027'); await save();
  await load('apiarios'); await click('Nuevo apiario'); await fill('codigo', 'A01'); await fill('nombre', 'Los Aromos'); await fill('localidad', 'Rafaela'); await save();
  const apiario = pg.sql(`SELECT id FROM apicola_apiarios;`);
  await load('movimientos'); await click('Registrar movimiento'); await fill('destino_apiario_id', apiario); await fill('cantidad', '40'); await fill('codigos_nuevos', 'C01\nC02'); await fill('motivo', 'Existencias iniciales'); await save();
  assert.equal(pg.sql('SELECT cantidad FROM apicola_existencias WHERE recurso=\'colonias\';'), '40');
  await load('visitas', 390); await click('Registrar visita'); await fill('responsable', 'Apicultor de prueba'); await fill('cantidad', '18'); await fill('detalle_fortaleza', 'media'); await fill('observaciones', 'Revisión parcial de 18 colmenas'); await capture('visita-movil'); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); await save();
  assert.equal(pg.sql('SELECT cantidad FROM apicola_registros;'), '18'); assert.equal(pg.sql('SELECT existencias_al_registrar FROM apicola_registros;'), '40');
  await click('Confirmar'); assert.equal(pg.sql('SELECT estado FROM apicola_registros;'), 'confirmado'); await capture('cuaderno-movil');
  await load('alimentacion'); await click('Registrar alimentación'); await fill('responsable', 'Apicultor de prueba'); await fill('cantidad', '12'); await fill('detalle_alimento', 'Alimento preparado'); await fill('detalle_cantidad', '10'); await fill('estado', 'confirmado'); await save();
  await load('sanidad'); await click('Registrar registro sanitario'); await fill('responsable', 'Apicultor de prueba'); await fill('cantidad', '2'); await fill('detalle_problema', 'Seguimiento de observación informada'); await fill('proxima_fecha', pg.sql('SELECT current_date+3;')); await fill('proxima_accion', 'Volver a revisar las dos colonias'); await fill('estado', 'confirmado'); await save();
  await load('agenda'); assert.ok(await evaluate(`document.body.textContent.includes('Volver a revisar')`)); await click('Completar'); assert.equal(pg.sql('SELECT estado FROM apicola_tareas;'), 'hecha');
  await load('colmenas'); await click('Ficha'); assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Historial individual')`));
  await load('informes'); assert.ok(await evaluate(`document.body.textContent.includes('10 kg')`));
  // Capturar la descarga en memoria: no escribir en Descargas ni abrir una impresora.
  await evaluate(`window.__pdfBlobs=new Map();window.__pdfDescargas=[];window.__objectUrlOriginal=URL.createObjectURL;URL.createObjectURL=function(blob){const url=window.__objectUrlOriginal.call(URL,blob);window.__pdfBlobs.set(url,blob);return url};window.__clickOriginal=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.pdf'))window.__pdfDescargas.push({nombre:this.download,blob:window.__pdfBlobs.get(this.href)});else window.__clickOriginal.call(this)};`);
  await click('Descargar PDF'); await pause(500);
  assert.equal(await evaluate(`window.__pdfDescargas.length`), 1);
  assert.match(await evaluate(`window.__pdfDescargas[0].nombre`), /^Cuaderno_Apicola_\d{8}\.pdf$/);
  assert.equal(await evaluate(`window.__pdfDescargas[0].blob.text().then(text=>text.includes('30712345678')&&text.includes('/Logo')&&text.includes('0.851 0.929 0.969 rg')&&text.includes('/BaseFont /Helvetica'))`), true, 'Descarga con encabezado fiscal, logo y diseño estándar');
  await evaluate(`window.__openOriginal=window.open;window.open=()=>null;`); await click('Imprimir'); assert.ok(await evaluate(`document.body.textContent.includes('ventanas emergentes')`), 'Informa bloqueo de impresión'); await evaluate(`window.open=window.__openOriginal`);
  const antesImprimir = new Set((await send('Target.getTargets')).targetInfos.map(t => t.targetId));
  await click('Imprimir'); await pause(700);
  const ventanasPdf = (await send('Target.getTargets')).targetInfos.filter(t => t.type === 'page' && !antesImprimir.has(t.targetId));
  assert.ok(ventanasPdf.some(t => t.url.startsWith('blob:')), 'Imprimir abre el visor PDF del sistema');
  for (const ventana of ventanasPdf) await send('Target.closeTarget', { targetId: ventana.targetId });
  await capture('informe-escritorio');
  await load('resumen'); await capture('menu-escritorio');
  await load('resumen', 390); await capture('resumen-movil'); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await click('Registrar visita'); assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Registrar visita')`), 'El acceso rápido abre el formulario'); await click('Close');
  await click('Toggle Sidebar'); assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Base productiva')`)); await comprobarSubmenu(); await capture('menu-movil');
  await click('Base productiva'); await evaluate(`document.querySelector('[role="dialog"] a[href="/apicola/colmenas"]').click()`); await pause(400); assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`), false, 'Navegar cierra el menú móvil');
  await fill('seccion', 'informes'); await pause(500); assert.ok(await evaluate(`document.body.textContent.includes('Actividad del período')`), 'Selector compacto mantiene la navegación');
  await load('apiarios?actor=operator'); assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Nuevo apiario'))`), false, 'El operador no administra catálogos');
  console.log('OK UI + PostgreSQL local: campañas, apiarios, alta 40, visita parcial 18/40, confirmación, alimentación, sanidad, agenda, historial de colmena, informes y permisos. Escritorio y móvil sin desbordes.');
} finally { socket?.close(); browser?.kill(); if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); } pg.stop(); }
