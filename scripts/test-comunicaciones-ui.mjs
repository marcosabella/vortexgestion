// Componentes reales, API simulada y navegador aislado. No conecta a Supabase.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import WebSocket from 'ws';

const root = process.cwd(), notices = [], presentations = [];
let failConfirmation = false;
const campaign = { id: 'campaign', titulo: 'Campaña original', mensaje: 'Texto original', condiciones: 'Condición original', activa: true, aviso_estado: 'activo' };
const merchants = [{ id: 'a', nombre_comercio: 'Comercio A', activo: true }, { id: 'b', nombre_comercio: 'Comercio B', activo: true }];
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Admin from'./src/pages/AdminNotificaciones';import{ModalesComunicaciones}from'./src/components/ModalesComunicaciones';createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[new URLSearchParams(location.search).get('route')||'/notificaciones']}>{location.pathname.startsWith('/admin')?<Admin/>:<ModalesComunicaciones/>}</MemoryRouter></QueryClientProvider></React.StrictMode>);`;
const databaseFixture = `const request=body=>fetch('/api',{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());export const supabase={rpc(name,args){return request({name,args})},from(table){const args={table};const q={select(){return q},eq(key,value){args[key]=value;return q},order(){return q},range(start,end){args.start=start;args.end=end;return q},maybeSingle(){args.single=true;return q},then(resolve,reject){return request({name:'table',args}).then(resolve,reject)}};return q}};`;
const notificationsFixture = `import{useQuery}from'@tanstack/react-query';export const categoriaLabels={general:'General',sistema:'Sistema',abono:'Abono',comprobante:'Comprobante'};export const prioridadLabels={baja:'Baja',normal:'Normal',alta:'Alta'};const mutation={isPending:false,mutate(){}};export function useAdminNotificaciones(){const notificacionesQuery=useQuery({queryKey:['admin-notificaciones'],queryFn:()=>fetch('/api',{method:'POST',body:JSON.stringify({name:'admin-list',args:{}})}).then(r=>r.json()).then(r=>r.data)});return{notificacionesQuery,desactivarNotificacion:mutation,reactivarNotificacion:mutation,eliminarNotificacion:mutation}}`;
const bundle = (await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  for (const [filter, name] of [[/^@\/hooks\/useComercio$/, 'commerce'], [/^@\/hooks\/useAdminComercios$/, 'admin'], [/^@\/hooks\/use-toast$/, 'toast'], [/^@\/hooks\/useNotificaciones$/, 'notifications'], [/^@\/integrations\/supabase\/client$/, 'db']]) b.onResolve({ filter }, () => ({ path: name, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: root, contents: args.path === 'commerce' ? `export const useComercio=()=>({comercio:{id:new URLSearchParams(location.search).get('tenant')||'a'}});` : args.path === 'admin' ? `const data=${JSON.stringify(merchants)};export const useAdminComercios=()=>({comerciosQuery:{data}});export const useIsAppAdmin=()=>({data:true,isLoading:false});` : args.path === 'toast' ? `const toast=()=>{};export const useToast=()=>({toast});` : args.path === 'notifications' ? notificationsFixture : databaseFixture }));
  b.onLoad({ filter: /useReferidos\.ts$/ }, () => ({ loader: 'ts', resolveDir: path.join(root, 'src/hooks'), contents: readFileSync('src/hooks/useReferidos.ts', 'utf8').replace('esVistaPreviaReferidos(window.location.hostname)', 'false').replaceAll('refetchInterval: 30_000', 'refetchInterval: 200') }));
  b.onLoad({ filter: /useComunicaciones\.ts$/ }, () => ({ loader: 'ts', resolveDir: path.join(root, 'src/hooks'), contents: readFileSync('src/hooks/useComunicaciones.ts', 'utf8').replaceAll('refetchInterval: 30_000', 'refetchInterval: 200') }));
} }] })).outputFiles[0].text;
const css = (await postcss([tailwindcss({ config: path.join(root, 'tailwind.config.ts') })]).process(readFileSync('src/index.css', 'utf8'), { from: path.join(root, 'src/index.css') })).css;
const server = createServer(async (req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle); return; }
  if (req.url !== '/api') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>`); return; }
  let raw = ''; for await (const part of req) raw += part;
  const { name, args } = JSON.parse(raw); let data = null, error = null;
  if (name === 'table') {
    data = args.table === 'referidos_campanas' ? { ...campaign } : args.table === 'referidos_participaciones' ? [] : args.table === 'notificacion_presentaciones' ? [...presentations] : [];
    if (Array.isArray(data) && args.start !== undefined) data = data.slice(args.start, args.end + 1);
  } else if (name === 'admin-list') data = notices.map(n => ({ ...n, destinatarios: n.comercioIds, lecturas: [] }));
  else if (name === 'mi_programa_referidos') data = { campana_id: campaign.id, titulo: campaign.titulo, mensaje: campaign.mensaje, condiciones: campaign.condiciones, aviso_estado: campaign.aviso_estado, codigo: 'VX-ABCDEF123456', modal_visto_at: '2026-11-01', notificacion_leida_at: null, pendientes: 0, meses_bonificados: 0 };
  else if (name === 'admin_estado_aviso_referidos') campaign.aviso_estado = { archivar: 'archivado', restaurar: 'activo', eliminar: 'eliminado' }[args.p_accion];
  else if (name === 'admin_editar_campana_referidos') Object.assign(campaign, { titulo: args.p_titulo, mensaje: args.p_mensaje, condiciones: args.p_condiciones });
  else if (name === 'admin_guardar_comunicacion') {
    data = args.p_id || 'notice-' + (notices.length + 1);
    const existing = notices.find(n => n.id === data);
    if (existing) Object.assign(existing, args.p_payload);
    else notices.push({ ...args.p_payload, id: data, activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  } else if (name === 'mis_modales_pendientes') data = notices.filter(n => n.activo && n.metadata.mostrar_modal && (!n.comercioIds.length || n.comercioIds.includes(args.p_comercio_id)) && !presentations.some(p => p.notificacion_id === n.id && p.comercio_id === args.p_comercio_id));
  else if (name === 'confirmar_presentacion_notificacion') {
    if (failConfirmation) error = { message: 'Sin conexión de prueba' };
    else if (!presentations.some(p => p.notificacion_id === args.p_notificacion_id && p.comercio_id === args.p_comercio_id)) presentations.push({ notificacion_id: args.p_notificacion_id, comercio_id: args.p_comercio_id, presentada_at: new Date().toISOString() });
  } else throw Error('RPC inesperada: ' + name);
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data, error }));
});

let browser, socket;
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', '--user-data-dir=' + mkdtempSync(path.join(tmpdir(), 'vortex-comunicaciones-ui-')), '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { let buffer = ''; const timer = setTimeout(() => reject(Error('Chrome timeout')), 20000); browser.once('error', reject); browser.stderr.on('data', chunk => { buffer += chunk; const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } }); });
  socket = new WebSocket(url); await new Promise((r, j) => { socket.once('open', r); socket.once('error', j); }); let seq = 0; const pending = new Map();
  socket.on('message', raw => { const m = JSON.parse(String(raw)), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => reject(Error(method)), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetInfos } = await send('Target.getTargets');
  const targetId = targetInfos.find(target => target.type === 'page').targetId;
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const load = async (url, width = 1200) => { await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sessionId); await send('Page.navigate', { url: origin + url }, sessionId); await pause(1000); };
  const click = async text => { assert.ok(await evaluate(`(()=>{const buttons=[...document.querySelectorAll('button')],text=${JSON.stringify(text)};const b=buttons.find(b=>b.textContent.trim()===text)||buttons.find(b=>b.textContent.includes(text));if(b){b.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));b.click()}return !!b})()`), text); await pause(350); };
  const fill = async (id, value) => evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const modal = () => evaluate(`document.querySelector('[role="dialog"]')?.textContent||''`);
  const out = path.join(root, 'private-backups/comunicaciones-preview'); mkdirSync(out, { recursive: true });
  const capture = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId); writeFileSync(path.join(out, name + '.png'), Buffer.from(data, 'base64')); };

  await load('/admin'); assert.equal(await evaluate(`document.body.textContent.includes('Editar textos')`), false, 'Campaña fuera de la solapa de carga'); await click('Historial de notificaciones');
  assert.equal(await evaluate(`!!document.querySelector('table tbody tr[data-campana-referidos="campaign"]')`), true, 'La campaña está en una fila de la grilla');
  await click('Editar textos'); await fill('campana-titulo', 'Campaña editada'); await fill('campana-mensaje', 'Mensaje editable'); await fill('campana-condiciones', 'Nueva condición'); await click('Guardar textos'); assert.equal(campaign.titulo, 'Campaña editada'); assert.equal(campaign.mensaje, 'Mensaje editable');
  await click('Preparar reenvío de campaña'); assert.equal(await evaluate(`document.getElementById('titulo').value`), 'Campaña editada'); assert.equal(await evaluate(`document.getElementById('mostrar-modal').getAttribute('aria-checked')`), 'true');
  assert.equal(await evaluate(`(()=>{const c=document.getElementById('categoria-notificacion').getBoundingClientRect(),p=document.getElementById('prioridad-notificacion').getBoundingClientRect(),m=document.getElementById('mostrar-modal').getBoundingClientRect();return Math.abs(c.top-p.top)<2&&m.top>=p.top&&m.bottom<=p.bottom})()`), true, 'Categoría, prioridad y modal comparten línea en escritorio');
  await evaluate(`document.getElementById('prioridad-notificacion').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`); await pause(150);
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(o=>o.textContent.trim()==='Destacada').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`); await pause(150);
  assert.ok(await evaluate(`document.getElementById('prioridad-notificacion').textContent.includes('Destacada')`));
  await click('Vista previa'); assert.match(await modal(), /Mensaje editable/); await click('Cerrar vista previa');
  await evaluate(`document.getElementById('destino-seleccionados').click()`); await pause(100); await evaluate(`document.getElementById('comercio-a').click()`); await click('Enviar notificacion');
  assert.equal(notices.length, 1); assert.deepEqual(notices[0].comercioIds, ['a']); assert.equal(notices[0].metadata.tipo, 'campana_referidos');
  assert.equal(notices[0].metadata.destacada, true, 'La prioridad destacada se guarda');
  await load('/ui?tenant=b'); assert.equal(await modal(), '', 'Otro comercio no recibe el aviso');
  await load('/ui?tenant=a&route=/ventas'); assert.equal(await modal(), '', 'No interrumpe una venta'); assert.equal(presentations.length, 0);
  await load('/ui?tenant=a', 390); assert.match(await modal(), /Mensaje editable/); assert.equal(presentations.length, 0, 'No confirma antes de mostrar'); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); await capture('modal-movil');
  failConfirmation = true; await click('Entendido'); assert.match(await modal(), /No se pudo registrar/); assert.equal(presentations.length, 0);
  failConfirmation = false; await click('Entendido'); assert.equal(await modal(), ''); assert.equal(presentations.length, 1);
  await load('/ui?tenant=a'); assert.equal(await modal(), '', 'Recargar no repite un aviso confirmado');
  await load('/admin'); await click('Historial de notificaciones'); await click('Modificar'); await fill('mensaje', 'Corrección sin reenvío'); await click('Guardar cambios'); assert.equal(notices.length, 1); assert.equal(notices[0].mensaje, 'Corrección sin reenvío');
  await load('/ui?tenant=a'); assert.equal(await modal(), '', 'Editar texto no reinicia presentación');
  await load('/admin'); await click('Historial de notificaciones'); await click('Preparar reenvío'); await click('Enviar notificacion'); assert.equal(notices.length, 2); assert.equal(presentations.length, 1, 'Reenvío conserva historia');
  await load('/ui?tenant=a'); assert.match(await modal(), /Corrección sin reenvío/); await click('Entendido'); assert.equal(presentations.length, 2);
  notices.push({ ...notices[0], id: 'live-notice', mensaje: 'Aviso con sesión abierta' });
  await pause(800); assert.match(await modal(), /Aviso con sesión abierta/, 'El sondeo presenta nuevos avisos sin recargar'); await click('Entendido');
  await load('/admin', 390); await click('Historial de notificaciones'); await capture('administrador-movil'); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await click('Archivar campaña'); assert.equal(campaign.aviso_estado, 'archivado'); assert.ok(await evaluate(`document.querySelector('[data-campana-referidos]').textContent.includes('Archivada')`));
  await click('Restaurar campaña'); assert.equal(campaign.aviso_estado, 'activo');
  await click('Eliminar campaña'); assert.equal(campaign.aviso_estado, 'activo', 'Pide confirmación antes de eliminar'); await click('Cancelar'); assert.equal(campaign.aviso_estado, 'activo');
  await click('Eliminar campaña'); await click('Eliminar aviso'); assert.equal(campaign.aviso_estado, 'eliminado'); assert.equal(await evaluate(`!!document.querySelector('[data-campana-referidos]')`), false, 'El aviso eliminado desaparece de la grilla'); assert.equal(campaign.activa, true, 'Se mantiene el programa');
  console.log('OK UI comunicaciones: editar campaña, previsualizar, seleccionar destinatarios, enviar, modal móvil, error/reintento al cerrar, recarga, editar sin repetir y reenviar conservando historia. API simulada.');
} finally { socket?.close(); browser?.kill(); await new Promise(r => server.close(r)); }
