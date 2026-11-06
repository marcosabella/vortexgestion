// Muestras locales del PDF común y de Apicultura; render con Chrome/PDFium.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
const dir = path.resolve('tmp/pdfs/apicola-reporte'); mkdirSync(dir, { recursive: true });
const compiled = (await build({ stdin: { contents: `export {informeApicolaPdf} from './src/utils/apicolaPdf';export {buildReportePdfFile} from './src/utils/listadoVentasPdf';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error' })).outputFiles[0].text;
const { informeApicolaPdf, buildReportePdfFile } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const comercio = { id: 'demo', nombre_comercio: 'APICOLA DEMO', calle: 'Av. de las Colmenas', numero: '123', localidad: 'Rafaela', provincia: 'Santa Fe', codigo_postal: '2300', telefono: '3492 123456', cuit: '30712345678', situacion_afip: 'Responsable Inscripto', ingresos_brutos: '123-456789-0', fecha_inicio_actividad: '2021-01-01' };
const campanas = [{ id: 'c1', nombre: 'Campaña 2026/2027', fecha_inicio: '2026-01-01', fecha_fin: '2027-12-31', estado: 'abierta' }];
const apiarios = [{ id: 'a1', codigo: 'A01', nombre: 'Los Aromos' }, { id: 'a2', codigo: 'A02', nombre: 'El Monte' }];
const datos = { visitas: 12, revisiones: 318, registros_pendientes: 2, sanitarios: 4, tareas_pendientes: 5, tareas_vencidas: 1, alimentacion: [{ unidad: 'kg', cantidad: 120.5 }, { unidad: 'litros', cantidad: 44.25 }], existencias: apiarios.map((a, i) => ({ apiario_id: a.id, recurso: 'colonias', cantidad: 40 + i * 12 })) };
const filtro = { campana: 'c1', apiario: '', desde: '2026-09-01', hasta: '2026-11-06' };
const catalogos = { campanas, apiarios, colmenas: [], existencias: [] };
const muchosApiarios = Array.from({ length: 70 }, (_, i) => ({ id: 'a' + i, codigo: 'API-' + String(i + 1).padStart(3, '0'), nombre: `Establecimiento Los Aromos del Norte - sector ${i + 1} con una denominación extensa para verificar los saltos de página y el ajuste del texto` }));
const files = [
  ['apicola-estandar.pdf', await informeApicolaPdf(datos, catalogos, filtro, comercio)],
  ['apicola-extenso.pdf', await informeApicolaPdf({ ...datos, existencias: muchosApiarios.map((a, i) => ({ apiario_id: a.id, recurso: i % 2 ? 'alza' : 'colonias', cantidad: i + 1 })) }, { ...catalogos, apiarios: muchosApiarios }, filtro, comercio)],
  ['referencia-sistema.pdf', await buildReportePdfFile([{ title: 'Referencia de estilo del sistema', columns: [{ key: 'concepto', label: 'Concepto', x: 24, width: 330, align: 'left' }, { key: 'valor', label: 'Cantidad', x: 354, width: 234, align: 'right' }], rows: [{ concepto: 'Fila de referencia', valor: '40' }] }], { comercio, rango: 'Todos los períodos', titulo: 'REPORTE DE VENTAS' })],
];
const pageCounts = new Map();
for (const [name, file] of files) {
  const bytes = Buffer.from(await file.arrayBuffer()), text = bytes.toString('latin1'); writeFileSync(path.join(dir, name), bytes);
  assert.ok(text.startsWith('%PDF-1.4')); assert.ok(text.includes('/BaseFont /Helvetica ')); assert.ok(text.includes('/BaseFont /Helvetica-Bold')); assert.ok(text.includes('/BaseFont /Helvetica-Oblique'));
  assert.ok(text.includes('0.851 0.929 0.969 rg'), 'Celeste estándar'); assert.ok(text.includes('APICOLA DEMO')); assert.ok(text.includes('30712345678')); assert.ok(text.includes('VORTEX GESTION'));
  const pages = [...text.matchAll(/\/Type \/Page\s/g)].length; pageCounts.set(name, pages);
  const streams = [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]);
  for (const stream of streams) { assert.ok(stream.includes('APICOLA DEMO'), 'Encabezado en cada página'); assert.ok(stream.includes('VORTEX GESTION'), 'Pie en cada página'); }
  if (name.startsWith('apicola')) { assert.ok(text.includes('Filtros aplicados')); assert.ok(text.includes('Actividad confirmada')); assert.ok(text.includes('Alimentacion confirmada')); assert.ok(text.includes('Existencias actuales')); assert.ok(text.includes('Criterios de lectura')); }
}
assert.ok(pageCounts.get('apicola-extenso.pdf') > 2, 'Caso de varias páginas');
const empty = await informeApicolaPdf({ ...datos, alimentacion: [], existencias: [] }, catalogos, { campana: '', apiario: '', desde: '', hasta: '' }, comercio);
assert.ok(Buffer.from(await empty.arrayBuffer()).toString('latin1').includes('Sin existencias registradas'));

let browser, socket;
const server = createServer((req, res) => { const name = decodeURIComponent(req.url.split('?')[0].slice(1)); if (!pageCounts.has(name)) { res.writeHead(404); res.end(); return; } const pdf = readFileSync(path.join(dir, name)); res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length }); res.end(pdf); });
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-gpu', '--user-data-dir=' + mkdtempSync(path.join(tmpdir(), 'vortex-apicola-pdf-')), '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { let output = ''; const timer = setTimeout(() => reject(Error('Chrome timeout')), 20000); browser.once('error', reject); browser.stderr.on('data', chunk => { output += chunk; const m = output.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } }); });
  socket = new WebSocket(url); await new Promise((r, j) => { socket.once('open', r); socket.once('error', j); }); let seq = 0; const pending = new Map();
  socket.on('message', raw => { const m = JSON.parse(String(raw)), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => reject(Error(method)), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetInfos } = await send('Target.getTargets'), targetId = targetInfos.find(t => t.type === 'page').targetId, { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1150, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (const [name, pages] of pageCounts) for (let page = 1; page <= pages; page++) {
    await send('Page.navigate', { url: `${origin}/${name}?pagina=${page}#page=${page}&zoom=85` }, sessionId); await new Promise(r => setTimeout(r, 1600));
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId); writeFileSync(path.join(dir, `${name.replace('.pdf', '')}-pagina-${page}.png`), Buffer.from(data, 'base64'));
  }
  console.log('OK PDF: generador estándar, Helvetica, tablas celestes, identidad fiscal, filtros completos, unidades separadas, paginación y encabezado/pie repetidos. Render PDFium: ' + JSON.stringify(Object.fromEntries(pageCounts)));
} finally { socket?.close(); browser?.kill(); await new Promise(r => server.close(r)); }
