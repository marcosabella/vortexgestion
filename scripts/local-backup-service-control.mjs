import { access } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

export async function ensureLocalBackupService(expectedProject, logger) {
  const directory = path.resolve('private-backups/admin-generator');
  try { await access(path.join(directory, 'local-service.env')); }
  catch { logger.info('[Backups] Servicio local sin configurar. Ejecutá node scripts/setup-local-backup-service.mjs.'); return; }
  try {
    const response = await fetch('http://127.0.0.1:8787/health', { signal: AbortSignal.timeout(1500) });
    const health = await response.json();
    if (health.service === 'vortex-local-backups' && health.project === expectedProject) return;
    logger.warn('[Backups] El puerto 8787 está ocupado por otro servicio o proyecto.'); return;
  } catch { /* iniciar únicamente este servicio en loopback */ }
  const log = openSync(path.join(directory, 'local-service.log'), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [path.resolve('scripts/local-backup-service.mjs')], { cwd: process.cwd(), detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    logger.info('[Backups] Servicio local iniciado en segundo plano. No se procesan trabajos hasta solicitarlos desde el panel.');
  } catch { logger.warn('[Backups] No se pudo iniciar el servicio local. Ejecutá INICIAR-BACKUPS.cmd.'); }
  finally { closeSync(log); }
}
