import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadRestorePackage } from './backup-restore-package.mjs';
import { backupCommand, hashFile, runBackupWorker, storageBelongsToTenant } from './admin-backup-worker.mjs';
import { publicExportSql, parseBackupRows, normalizeSchema } from './backup-data-sql.mjs';
import { catalogSql, selectTenant, mergeRestore, adminTables, UUID } from './backup-selection.mjs';
import { restoreDataSql } from './backup-restore-sql.mjs';

export async function runRestoreWorker(db, id, options = {}) {
  if (!UUID.test(id)) throw new Error('Identificador inválido');
  const { data: jobs, error: claimError } = await db.rpc('claim_admin_backup_restore', { p_id: id });
  if (claimError) throw new Error('No se pudo reclamar la restauración');
  const job = jobs?.[0];
  if (!job) return;
  const applying = job.estado === 'restaurando';
  const work = await mkdtemp(path.join(os.tmpdir(), 'vortex-restore-'));
  const command = async (...args) => { await options.beforeCommand?.(); return backupCommand(...args); };
  const sql = (input) => command(process.env.BACKUP_PSQL, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input });
  const update = async (body) => {
    const { error } = await db.from('admin_backup_restores').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error('No se pudo actualizar la restauración');
  };
  let stage = 'validación del archivo';
  try {
    const { data: signed, error: signError } = await db.storage.from('admin-backups').createSignedUrl(job.archivo, 60);
    if (signError) throw new Error('No se pudo leer el archivo');
    const response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) !== job.bytes) throw new Error('Tamaño de archivo incorrecto');
    const encrypted = path.join(work, 'source.enc');
    let downloaded = 0;
    const limited = async function* (source) { for await (const chunk of source) { downloaded += chunk.length; if (downloaded > job.bytes) throw new Error('Archivo excedido'); yield chunk; } };
    await pipeline(response.body, limited, createWriteStream(encrypted, { flags: 'wx', mode: 0o600 }));
    if (downloaded !== job.bytes) throw new Error('Archivo incompleto');
    const checksum = await hashFile(encrypted);
    if (applying && job.sha256 !== checksum) throw new Error('La copia cambió después del análisis');
    const pack = await loadRestorePackage(encrypted, work, process.env.BACKUP_ENCRYPTION_KEY);
    const policy = JSON.parse(await readFile(process.env.BACKUP_POLICY_FILE, 'utf8'));
    if (JSON.stringify(pack.manifest.policy) !== JSON.stringify(policy)) throw new Error('La política de cobertura cambió. Se requiere revisión técnica.');
    const catalog = JSON.parse(await sql(catalogSql));
    if (JSON.stringify(pack.catalog) !== JSON.stringify(catalog)) throw new Error('El esquema de la copia no coincide con el actual');
    if (catalog.some((t) => !adminTables.includes(t.name) && !t.pk?.length)) throw new Error('Hay tablas sin clave primaria; requieren recuperación técnica');
    const schemaFile = path.join(work, 'current-schema.sql');
    await command(process.env.BACKUP_PG_DUMP, ['--schema-only', '--schema=public', '--no-owner', '--no-privileges', '--file', schemaFile]);
    if (normalizeSchema(pack.schema) !== normalizeSchema(await readFile(schemaFile, 'utf8'))) throw new Error('El esquema cambió; se requiere una recuperación técnica compatible');
    const comercios = pack.snapshot.rows.filter((r) => r.table === 'comercio').map((r) => ({ id: r.data.id, nombre: r.data.nombre_comercio || r.data.id }));
    for (const comercio of comercios) selectTenant(pack.snapshot, comercio.id, catalog, policy);
    for (const object of pack.storage) if (pack.manifest.comercio_id && !storageBelongsToTenant(object, pack.manifest.comercio_id, policy.storage || {})) throw new Error('Archivo de otro comercio');
    if (!applying) {
      await update({ estado: 'listo', sha256: checksum, resumen: { comercio_id: pack.manifest.comercio_id, fecha: pack.snapshot.manifest.snapshot_at || pack.manifest.created_at, comercios, archivos: pack.storage.length, filas: pack.snapshot.rows.filter((r) => !adminTables.includes(r.table)).length, identidades: 'Se conservan las cuentas de acceso actuales.' }, error: null });
      return;
    }
    const unguarded = await sql("SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN('r','p') AND NOT c.relispartition AND c.relname NOT IN('app_admins','admin_backups','admin_backup_worker','admin_backup_restores','admin_backup_restore_lock') AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='admin_backup_restore_guard' AND t.tgenabled IN('O','A')); ");
    if (Number(unguarded.trim()) !== 0) throw new Error('Hay tablas nuevas sin protección de mantenimiento');
    const storageGuards = await sql("SELECT count(*) FROM pg_trigger WHERE (tgrelid='storage.objects'::regclass AND tgname IN('admin_backup_restore_guard','admin_backup_restore_truncate_guard') OR tgrelid='storage.buckets'::regclass AND tgname='admin_backup_restore_guard') AND tgenabled IN('O','A');");
    if (Number(storageGuards.trim()) !== 3) throw new Error('Falta protección de mantenimiento en Storage');
    stage = 'respaldo previo';
    const { data: prior } = await db.from('admin_backups').select('estado').eq('id', job.backup_previo_id).single();
    if (prior?.estado !== 'completado') await runBackupWorker({ once: true, jobId: job.backup_previo_id, beforeCommand: options.beforeCommand });
    const { data: checked } = await db.from('admin_backups').select('estado').eq('id', job.backup_previo_id).single();
    if (checked?.estado !== 'completado') throw new Error('El respaldo previo no se completó');
    stage = 'datos operativos';
    const before = parseBackupRows(await sql(publicExportSql()));
    let after;
    if (job.comercio_id) {
      after = mergeRestore(before, selectTenant(before, job.comercio_id, catalog, policy, true), selectTenant(pack.snapshot, job.comercio_id, catalog, policy), catalog);
    } else {
      if (pack.manifest.comercio_id) throw new Error('No es una copia general');
      after = { ...pack.snapshot, tables: pack.snapshot.tables.filter((t) => !adminTables.includes(t)) };
    }
    await sql(restoreDataSql(before, after, id));
    stage = 'archivos del alcance seleccionado';
    const { data: lock, error: lockError } = await db.from('admin_backup_restore_lock').select('storage_token').eq('restore_id', id).single();
    if (lockError || !lock) throw new Error('Bloqueo inexistente');
    const apiHeaders = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'x-vortex-restore-token': lock.storage_token };
    const base = process.env.SUPABASE_URL;
    const inventorySql = "SELECT coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name)),'[]'::jsonb) FROM storage.objects WHERE bucket_id<>'admin-backups';";
    const inventory = JSON.parse(await sql(inventorySql));
    const included = (o) => !job.comercio_id || storageBelongsToTenant(o, job.comercio_id, policy.storage || {});
    const source = pack.storage.filter(included);
    const identity = (o) => JSON.stringify([o.bucket_id, o.name]);
    const wanted = new Set(source.map(identity));
    const route = (o) => [o.bucket_id, ...o.name.split('/')].map(encodeURIComponent).join('/');
    for (const object of source) {
      const uploaded = await fetch(`${base}/storage/v1/object/${route(object)}`, { method: 'POST', headers: { ...apiHeaders, 'x-upsert': 'true', 'Content-Type': object.metadata?.mimetype || 'application/octet-stream' }, body: createReadStream(path.join(pack.dir, object.file)), duplex: 'half', signal: AbortSignal.timeout(120000) });
      if (!uploaded.ok) throw new Error('No se pudo recuperar un archivo');
      const verify = await fetch(`${base}/storage/v1/object/authenticated/${route(object)}`, { headers: apiHeaders, signal: AbortSignal.timeout(120000) });
      if (!verify.ok || !verify.body) throw new Error('No se pudo verificar un archivo');
      const hash = createHash('sha256'); for await (const chunk of verify.body) hash.update(chunk);
      if (hash.digest('hex') !== object.sha256) throw new Error('El contenido recuperado no coincide');
    }
    for (const object of inventory.filter(included).filter((o) => !wanted.has(identity(o)))) {
      const deleted = await fetch(`${base}/storage/v1/object/${encodeURIComponent(object.bucket_id)}`, { method: 'DELETE', headers: { ...apiHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [object.name] }), signal: AbortSignal.timeout(60000) });
      if (!deleted.ok) throw new Error('No se pudo retirar un archivo posterior a la copia');
    }
    const finalInventory = JSON.parse(await sql(inventorySql));
    const expected = [...inventory.filter((o) => !included(o)), ...source].map(identity).sort();
    if (JSON.stringify(finalInventory.map(identity).sort()) !== JSON.stringify(expected)) throw new Error('El inventario final no coincide');
    const { error: finishError } = await db.rpc('finish_admin_backup_restore', { p_id: id });
    if (finishError) throw new Error('No se pudo finalizar la restauración');
  } catch (error) {
    const detail = applying ? `Se interrumpió la etapa ${stage}. El sistema sigue en mantenimiento. Revisá el respaldo previo y reanudá el mismo alcance.` : error.message;
    await update({ estado: applying ? 'interrumpido' : 'fallido', error: detail });
  } finally {
    const resolved = path.resolve(work);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('vortex-restore-')) throw new Error('Temporal inválido');
    await rm(resolved, { recursive: true, force: true });
  }
}
