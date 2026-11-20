import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminBackupsHandler } from '../netlify/functions/admin-backups.mjs';
import { project } from '../netlify/functions/lib/backup-cloud.mjs';
import { loadLocalBackupConfig } from './local-backup-job.mjs';

export function createLocalBackupServer({ handler, health = () => ({ ready: false }) }) {
  return createServer(async (req, res) => {
    const respond = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const allowedHost = (value) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
      if (!allowedHost('http://' + (req.headers.host || ''))) return respond(403, { error: 'El servicio sólo acepta localhost.' });
      if (req.headers.origin && !allowedHost(req.headers.origin)) return respond(403, { error: 'Origen no permitido.' });
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/health' && req.method === 'GET') return respond(200, { service: 'vortex-local-backups', project, ...health() });
      if (url.pathname !== '/.netlify/functions/admin-backups') return respond(404, { error: 'Ruta no disponible.' });
      let length = 0; const chunks = [];
      for await (const chunk of req) { length += chunk.length; if (length > 65536) return respond(413, { error: 'Solicitud demasiado grande.' }); chunks.push(chunk); }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const request = new Request('http://127.0.0.1' + url.pathname, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method || '') ? { body: Buffer.concat(chunks) } : {}) });
      const response = await handler(request);
      res.statusCode = response.status; response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { if (!res.headersSent) respond(500, { error: 'No se pudo atender la solicitud local.' }); else res.end(); }
  });
}

async function main() {
  loadLocalBackupConfig();
  let available = false;
  let checking = false;
  let message = 'El servicio local está comprobando PostgreSQL, certificados y conexión. Volvé a actualizar en unos segundos.';
  const active = new Set();
  const launch = (args) => spawn(process.execPath, [path.resolve('scripts/local-backup-job.mjs'), ...args], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const check = () => {
    if (checking || active.size) return;
    checking = true;
    const child = launch(['--check']);
    child.stdout.resume(); child.stderr.resume();
    child.once('error', () => { checking = false; available = false; message = 'No se pudo iniciar la comprobación del servicio local.'; });
    child.once('exit', (code) => {
      checking = false; available = code === 0;
      message = available ? '' : 'El servicio local no pudo verificar PostgreSQL o la conexión. Revisá su configuración y volvé a actualizar.';
      console.log(available ? 'Servicio local de copias: conexión y herramientas verificadas.' : 'Servicio local de copias: comprobación pendiente/fallida. No se procesaron solicitudes.');
    });
  };
  const dispatch = async ({ kind, id }) => {
    if (!available) throw new Error('Servicio local no disponible');
    const child = launch([kind, id]);
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    active.add(child); child.stdout.resume(); child.stderr.resume();
    child.once('exit', () => { active.delete(child); });
  };
  const handler = createAdminBackupsHandler({ dispatch, isReady: () => available, unavailableMessage: () => message });
  const server = createLocalBackupServer({ handler, health: () => ({ ready: available, checking, activeJobs: active.size, restoreReady: process.env.BACKUP_RESTORE_ENABLED === 'true', message, pid: process.pid }) });
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? 'El puerto 8787 del servicio local ya está ocupado.' : 'No se pudo iniciar el servicio local.'); process.exitCode = 1; });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8787, '127.0.0.1', resolve); });
  console.log(`Servicio de copias en http://127.0.0.1:8787 · proyecto ${project} · sólo bajo solicitud del administrador.`);
  check();
  const timer = setInterval(check, 5 * 60000); timer.unref();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); server.close(); if (!active.size) process.exit(0); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Servicio local detenido. Revisá su configuración privada y el puerto 8787.'); process.exitCode = 1; });
