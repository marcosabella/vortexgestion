import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, supabaseUrl, client, ready } from '../netlify/functions/lib/backup-cloud.mjs';
import { runBackupWorker } from './admin-backup-worker.mjs';
import { runRestoreWorker } from './admin-backup-restore-worker.mjs';
import { UUID } from './backup-selection.mjs';

export function loadLocalBackupConfig() {
  process.loadEnvFile(path.resolve('private-backups/admin-generator/local-service.env'));
  if (!ready()) throw new Error('La configuración privada del servicio local está incompleta.');
}

export async function prepareLocalBackupEnvironment() {
  const bin = process.env.BACKUP_LOCAL_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '/usr/bin');
  const executable = (name) => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const ca = path.resolve('private-backups/admin-generator/ca.pem');
  await Promise.all([access(executable('psql')), access(executable('pg_dump')), access(ca)]);
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/cli/login-role`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.BACKUP_MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ read_only: false }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`La conexión temporal de respaldo fue rechazada (HTTP ${response.status}).`);
  const role = await response.json();
  if (!role.role || !role.password || !Number.isFinite(role.ttl_seconds) || role.ttl_seconds < 60) throw new Error('La conexión temporal de respaldo no es válida.');
  Object.assign(process.env, {
    SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: process.env.BACKUP_SUPABASE_SERVICE_KEY,
    PGHOST: 'aws-1-us-east-1.pooler.supabase.com', PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: `${role.role}.${project}`, PGPASSWORD: role.password,
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: ca, PGCLIENTENCODING: 'UTF8', PGOPTIONS: '', BACKUP_PG_ROLE: 'postgres',
    BACKUP_PSQL: executable('psql'), BACKUP_PG_DUMP: executable('pg_dump'), BACKUP_TAR: process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe') : '/usr/bin/tar',
    BACKUP_WORK_DIR: path.resolve('private-backups/admin-local-jobs'), BACKUP_CLOUD: 'true', BACKUP_POLICY_FILE: path.resolve('config/backup-policy.json'),
  });
  return Date.now() + role.ttl_seconds * 1000;
}

async function main() {
  loadLocalBackupConfig();
  if (process.argv.includes('--status')) {
    const { data, error } = await client().from('admin_backups').select('id,estado,bytes,error,created_at').order('created_at', { ascending: false }).limit(3);
    if (error) throw new Error('No se pudo consultar el estado de las copias.');
    console.log(JSON.stringify(data));
    return;
  }
  const check = process.argv.includes('--check');
  const [kind, id] = process.argv.slice(2);
  if (!check && (!['backup', 'restore'].includes(kind) || !UUID.test(id || ''))) throw new Error('Operación local inválida.');
  if (!check && kind === 'restore' && process.env.BACKUP_RESTORE_ENABLED !== 'true') throw new Error('La restauración todavía no está habilitada.');
  try {
    let expires = await prepareLocalBackupEnvironment();
    const beforeCommand = async () => { if (Date.now() + 60000 >= expires) expires = await prepareLocalBackupEnvironment(); };
    if (check) await runBackupWorker({ beforeCommand }); // --check sólo lee; no heartbeat ni cola.
    else if (kind === 'backup') await runBackupWorker({ once: true, jobId: id, beforeCommand });
    else await runRestoreWorker(client(), id, { beforeCommand });
  } catch (error) {
    if (!check) {
      const db = client();
      const message = 'El servicio local no pudo completar el proceso. Revisá su conexión y volvé a intentar.';
      if (kind === 'backup') await db.from('admin_backups').update({ estado: 'fallido', error: message, finalizado_at: new Date().toISOString() }).eq('id', id).in('estado', ['pendiente', 'procesando']);
      else await db.from('admin_backup_restores').update({ estado: 'interrumpido', error: message + ' Se conserva el mantenimiento si la restauración había comenzado.', updated_at: new Date().toISOString() }).eq('id', id).in('estado', ['analisis_pendiente', 'analizando', 'restauracion_pendiente', 'restaurando']);
    }
    // No imprimir stderr de PostgreSQL, contraseñas temporales ni objetos SDK.
    console.error(error.code === 'ENOENT' ? 'Faltan herramientas PostgreSQL o el certificado CA local.' : 'No se pudo completar la comprobación/proceso local. Verificá credenciales, PostgreSQL y conexión TLS.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('No se pudo cargar la configuración privada local. Ejecutá scripts/setup-local-backup-service.mjs.'); process.exitCode = 1; });
