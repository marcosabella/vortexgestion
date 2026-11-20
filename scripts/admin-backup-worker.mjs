import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, copyFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, randomBytes, createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { tenantExportSql } from './backup-tenant-sql.mjs';
import { publicExportSql } from './backup-data-sql.mjs';
import { catalogSql } from './backup-selection.mjs';

export const BUCKET = 'admin-backups';
export function storageBelongsToTenant(object, tenant, rules) {
  const rule = rules[object.bucket_id];
  if (!rule) throw new Error(`Falta política de archivos para bucket ${object.bucket_id}`);
  if (rule.exclude === true) return false;
  if (typeof rule.prefix !== 'string' || !rule.prefix.includes('{comercio_id}') || !rule.prefix.endsWith('/')) throw new Error('Prefijo de comercio inválido');
  return object.name.startsWith(rule.prefix.replaceAll('{comercio_id}', tenant));
}

export async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function backupCommand(exe, args, { input, output } = {}) {
  const role = process.env.BACKUP_PG_ROLE;
  if (role && !args.includes('--version')) {
    if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error('Rol PostgreSQL inválido');
    if (/(^|[\\/])psql(?:\.exe)?$/i.test(exe)) input = `SET ROLE "${role}";\n${input || ''}`;
    if (/(^|[\\/])pg_dump(?:\.exe)?$/i.test(exe)) args = ['--role', role, ...args];
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(exe, args, { shell: false, windowsHide: true, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let result = '';
    let diagnostic = '';
    let outputError;
    let drained = Promise.resolve();
    if (output) drained = pipeline(child.stdout, createWriteStream(output, { mode: 0o600 })).catch((e) => { outputError = e; });
    else child.stdout.on('data', (chunk) => { result += chunk; });
    // Solo se permite publicar un diagnóstico propio con nombres de tablas.
    child.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk).slice(-8192); });
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
    const timer = setTimeout(() => child.kill(), process.env.BACKUP_CLOUD === 'true' ? 12 * 60000 : 2 * 60 * 60 * 1000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', async (code) => {
      clearTimeout(timer);
      await drained;
      if (code !== 0 || outputError) {
        const match = diagnostic.match(/Falta clasificar la tabla ([a-z_][a-z0-9_]*) en la política|Referencia fuera del respaldo: ([a-z_][a-z0-9_]*) -> ([a-z_][a-z0-9_]*)/);
        const error = new Error(`Falló ${path.basename(exe)}; revisar configuración, permisos y política de cobertura`);
        if (match) error.safeDetail = match[1] ? `Tabla sin clasificar: ${match[1]}.` : `Referencia fuera del respaldo: ${match[2]} → ${match[3]}.`;
        reject(error);
      }
      else resolve(result);
    });
  });
}
const command = backupCommand;

export async function encryptArchive(source, destination, key) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('BACKUP_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  await writeFile(destination, Buffer.concat([Buffer.from('VXBACK01'), iv]), { mode: 0o600, flag: 'wx' });
  await pipeline(createReadStream(source), createGzip(), cipher, createWriteStream(destination, { flags: 'a', mode: 0o600 }));
  const { appendFile } = await import('node:fs/promises');
  await appendFile(destination, cipher.getAuthTag());
}

export async function runBackupWorker(options = {}) {
  const command = async (...args) => { await options.beforeCommand?.(); return backupCommand(...args); };
  const cloud = process.env.BACKUP_CLOUD === 'true';
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'BACKUP_ENCRYPTION_KEY', 'BACKUP_POLICY_FILE', ...(cloud ? [] : ['BACKUP_OFFSITE_DIR'])];
  for (const name of required) if (!process.env[name]) throw new Error(`Falta ${name}`);
  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY)) throw new Error('Clave de cifrado inválida');
  if (process.env.PGSSLMODE !== 'verify-full') throw new Error('Configurar PGSSLMODE=verify-full y certificados PostgreSQL');
  const policy = JSON.parse(await readFile(process.env.BACKUP_POLICY_FILE, 'utf8'));
  if (policy.version !== 1) throw new Error('Política de respaldo inválida');
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  async function api(route, body, method = 'POST') {
    const response = await fetch(`${base}${route}`, { method, headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('El servicio de respaldos rechazó la operación');
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const windowsBin = 'C:/Program Files/PostgreSQL/17/bin';
  const psql = process.env.BACKUP_PSQL || (process.platform === 'win32' && existsSync(`${windowsBin}/psql.exe`) ? `${windowsBin}/psql.exe` : 'psql');
  const pgDump = process.env.BACKUP_PG_DUMP || (process.platform === 'win32' && existsSync(`${windowsBin}/pg_dump.exe`) ? `${windowsBin}/pg_dump.exe` : 'pg_dump');
  const sql = (input, output) => command(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input, output });
  const inventorySql = `SELECT coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name,'updated_at',updated_at,'metadata',metadata) ORDER BY bucket_id,name),'[]'::jsonb) FROM storage.objects WHERE bucket_id <> '${BUCKET}';`;
  const root = path.resolve(process.env.BACKUP_WORK_DIR || 'private-backups/admin');
  const offsite = path.resolve(process.env.BACKUP_OFFSITE_DIR || path.join(root, '..', 'second-copy'));
  if (offsite === root || offsite.startsWith(root + path.sep)) throw new Error('La segunda copia debe estar fuera del directorio de trabajo');
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (!cloud) await mkdir(offsite, { recursive: true, mode: 0o700 });
  // Comprobar herramientas antes de anunciar disponibilidad.
  await command(psql, ['--version']);
  await command(pgDump, ['--version']);
  await command(process.env.BACKUP_TAR || 'tar', ['--version']);
  await sql('SELECT 1;');
  if (process.argv.includes('--check')) {
    // Diagnóstico sin anunciar disponibilidad, reclamar trabajos ni crear respaldos.
    await api('/rest/v1/admin_backups?select=id&limit=0', undefined, 'GET');
    const inventory = JSON.parse(await sql(inventorySql));
    for (const object of inventory) storageBelongsToTenant(object, '00000000-0000-0000-0000-000000000000', policy.storage || {});
    console.log('Configuración, conexión PostgreSQL, herramientas, API y cobertura de buckets verificadas. No se procesaron trabajos.');
    return;
  }
  const heartbeat = () => api('/rest/v1/admin_backup_worker?on_conflict=id', { id: true, heartbeat_at: new Date().toISOString() });
  let heartbeatBusy = false;
  const timer = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try { await heartbeat(); } catch { console.error('No se pudo actualizar disponibilidad del generador'); }
    finally { heartbeatBusy = false; }
  }, 30000);
  const patch = (id, body) => api(`/rest/v1/admin_backups?id=eq.${id}`, body, 'PATCH');
  try {
    while (true) {
      await heartbeat();
      const jobs = options.jobId ? await api('/rest/v1/rpc/tomar_admin_backup_cloud', { p_id: options.jobId }) : await api('/rest/v1/rpc/tomar_admin_backup', {});
      const job = jobs?.[0];
      if (!job) { if (options.once || process.argv.includes('--once')) break; await delay(10000); continue; }
      let stage = 'preparación';
      try {
        const work = path.join(root, job.id);
        await mkdir(work, { mode: 0o700 });
        const inventoryBefore = JSON.parse(await sql(inventorySql));
        const selectedObjects = job.comercio_id ? inventoryBefore.filter((o) => storageBelongsToTenant(o, job.comercio_id, policy.storage || {})) : inventoryBefore;
        stage = 'base de datos y cobertura de tablas';
        await command(pgDump, ['--schema-only', '--schema=public', '--no-owner', '--no-privileges', '--file', path.join(work, 'schema.sql')]);
        await sql(catalogSql, path.join(work, 'catalog.json'));
        if (job.comercio_id) {
          await sql(tenantExportSql(job.comercio_id, policy.excludedTables || [], policy.sharedTables || [], policy.referencedTables || [], policy.externalComercioReferences || {}), path.join(work, 'tenant.ndjson'));
        } else {
          await command(pgDump, ['--format=custom', '--no-owner', '--file', path.join(work, 'database.dump')]);
          await sql(publicExportSql(), path.join(work, 'public.ndjson'));
        }
        stage = 'archivos de Storage';
        await mkdir(path.join(work, 'storage'), { mode: 0o700 });
        const storageManifest = [];
        for (const [i, object] of selectedObjects.entries()) {
          if (object.name.split('/').some((part) => part === '.' || part === '..')) throw new Error('Nombre de archivo no permitido');
          const encoded = [object.bucket_id, ...object.name.split('/')].map(encodeURIComponent).join('/');
          const response = await fetch(`${base}/storage/v1/object/authenticated/${encoded}`, { headers, signal: AbortSignal.timeout(300000) });
          if (!response.ok || !response.body) throw new Error('Archivo de Storage no disponible');
          const relative = `storage/${i}.bin`;
          await pipeline(response.body, createWriteStream(path.join(work, relative), { mode: 0o600 }));
          storageManifest.push({ ...object, file: relative, sha256: await hashFile(path.join(work, relative)) });
        }
        const inventoryAfter = JSON.parse(await sql(inventorySql));
        const afterSelected = job.comercio_id ? inventoryAfter.filter((o) => storageBelongsToTenant(o, job.comercio_id, policy.storage || {})) : inventoryAfter;
        if (JSON.stringify(selectedObjects) !== JSON.stringify(afterSelected)) throw new Error('Storage cambió durante la copia. Reintentar');
        await writeFile(path.join(work, 'storage.json'), JSON.stringify(storageManifest, null, 2), { mode: 0o600 });
        stage = 'verificación y cifrado';
        const files = [];
        for (const filename of await readdir(work)) {
          if ((await stat(path.join(work, filename))).isFile()) files.push({ file: filename, sha256: await hashFile(path.join(work, filename)) });
        }
        const manifest = { version: 1, restore_version: 2, job: job.id, comercio_id: job.comercio_id, created_at: new Date().toISOString(), format: job.comercio_id ? 'tenant-ndjson-v1' : 'pg-custom', storage_files: storageManifest.length, files, policy, recovery: 'Panel: datos operativos y archivos; conserva identidades de acceso actuales. Infraestructura/Auth: database.dump en entorno aislado. Ver docs/BACKUPS.md.' };
        await writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
        const archive = path.join(root, `${job.id}.tar`);
        await command(process.env.BACKUP_TAR || 'tar', ['-cf', archive, '-C', work, '.']);
        const encrypted = `${archive}.gz.enc`;
        await encryptArchive(archive, encrypted, process.env.BACKUP_ENCRYPTION_KEY);
        const checksum = await hashFile(encrypted);
        const size = (await stat(encrypted)).size;
        stage = 'segunda copia';
        const secondCopy = path.join(offsite, path.basename(encrypted));
        if (!cloud) {
          await copyFile(encrypted, secondCopy);
          if (await hashFile(secondCopy) !== checksum) throw new Error('La segunda copia no coincide');
        }
        stage = 'almacenamiento privado';
        const objectPath = `${job.id}/backup.tar.gz.enc`;
        const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${objectPath}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'x-upsert': 'false' }, body: createReadStream(encrypted), duplex: 'half', signal: AbortSignal.timeout(30 * 60000) });
        if (!response.ok) throw new Error('No se pudo guardar el archivo cifrado');
        // Verificar también el archivo remoto, sin cargarlo entero en memoria.
        const check = await fetch(`${base}/storage/v1/object/authenticated/${BUCKET}/${objectPath}`, { headers, signal: AbortSignal.timeout(30 * 60000) });
        if (!check.ok || !check.body) throw new Error('No se pudo verificar el archivo remoto');
        const remoteHash = createHash('sha256');
        for await (const chunk of check.body) remoteHash.update(chunk);
        if (remoteHash.digest('hex') !== checksum) throw new Error('Checksum remoto inválido');
        await patch(job.id, { estado: 'completado', archivo: objectPath, bytes: size, sha256: checksum, finalizado_at: new Date().toISOString(), resumen: { formato: manifest.format, archivos: manifest.storage_files, cifrado: 'AES-256-GCM', segunda_copia: !cloud, restauracion: 'Pendiente de ensayo en entorno aislado' } });
        console.log(`Respaldo completado: ${job.id}`);
      } catch (error) {
        await patch(job.id, { estado: 'fallido', finalizado_at: new Date().toISOString(), error: `No se pudo completar la etapa: ${stage}. ${error.safeDetail || 'Revisar la configuración y política del generador antes de reintentar.'}` });
        console.error(`Respaldo fallido ${job.id}: ${stage}`);
      } finally {
        // Solo temporales del trabajo reclamado, nunca la raíz ni las copias cifradas.
        if (/^[a-f0-9-]{36}$/i.test(job.id)) {
          const work = path.resolve(root, job.id);
          if (path.dirname(work) !== root) throw new Error('Directorio temporal inválido');
          await rm(work, { recursive: true, force: true });
          await rm(path.join(root, `${job.id}.tar`), { force: true });
          if (cloud) await rm(path.join(root, `${job.id}.tar.gz.enc`), { force: true });
        }
      }
      if (options.once || process.argv.includes('--once')) break;
    }
  } finally { clearInterval(timer); }
}

if (import.meta.url && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBackupWorker().catch((error) => {
    const missing = error.message?.match(/^Falta ([A-Z_]+)$/);
    console.error(missing ? `Falta configurar ${missing[1]}.` : 'Generador detenido. Verificar variables, herramientas y conectividad.');
    process.exitCode = 1;
  });
}
