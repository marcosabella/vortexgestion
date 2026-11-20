import { open, mkdir, readFile, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { decryptBackup, verifyExtracted } from './verify-admin-backup.mjs';
import { parseBackupRows } from './backup-data-sql.mjs';
import { UUID } from './backup-selection.mjs';

export async function extractBackupTar(archive, directory, maxBytes = 1024 * 1024 * 1024) {
  await mkdir(directory, { mode: 0o700 });
  const handle = await open(archive, 'r');
  const size = (await handle.stat()).size;
  const seen = new Set();
  let total = 0;
  try {
    for (let offset = 0; offset + 512 <= size;) {
      const h = Buffer.alloc(512);
      await handle.read(h, 0, 512, offset);
      if (h.every((b) => b === 0)) return;
      const str = (a, b) => h.subarray(a, b).toString().replace(/\0.*$/, '');
      const checksum = parseInt(str(148, 156).trim(), 8);
      const computed = [...h].reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0);
      if (checksum !== computed) throw new Error('Cabecera tar alterada');
      const raw = str(0, 100);
      const name = raw.replace(/^\.\//, '');
      const length = parseInt(str(124, 136).trim() || '0', 8);
      const type = h[156];
      if (!Number.isSafeInteger(length) || length < 0 || offset + 512 + length > size || (total += length) > maxBytes || str(345, 500)) throw new Error('Archivo excedido o formato tar no compatible');
      if (type === 53) {
        if (!['.', '', 'storage/', 'storage'].includes(name) || length !== 0) throw new Error('Directorio no permitido');
        if (name.startsWith('storage')) await mkdir(path.join(directory, 'storage'), { recursive: true, mode: 0o700 });
      } else if (type === 48 || type === 0) {
        if (!/^(manifest\.json|storage\.json|catalog\.json|schema\.sql|tenant\.ndjson|public\.ndjson|database\.dump|storage\/[0-9]+\.bin)$/.test(name) || seen.has(name)) throw new Error('Entrada tar no permitida o duplicada');
        seen.add(name);
        await mkdir(path.dirname(path.join(directory, name)), { recursive: true, mode: 0o700 });
        if (length) await pipeline(createReadStream(archive, { start: offset + 512, end: offset + 511 + length }), createWriteStream(path.join(directory, name), { flags: 'wx', mode: 0o600 }));
        else { const empty = await open(path.join(directory, name), 'wx', 0o600); await empty.close(); }
      } else throw new Error('Enlaces y extensiones tar no permitidos');
      offset += 512 + Math.ceil(length / 512) * 512;
    }
    throw new Error('Tar incompleto');
  } finally { await handle.close(); }
}

export async function loadRestorePackage(encrypted, work, key) {
  // Primero autenticar GCM; nunca extraer un tar cuyo descifrado haya fallado.
  await decryptBackup(encrypted, path.join(work, 'source.tar'), key);
  const dir = path.join(work, 'extracted');
  await extractBackupTar(path.join(work, 'source.tar'), dir);
  const manifest = await verifyExtracted(dir);
  if (manifest.restore_version !== 2 || (manifest.comercio_id !== null && !UUID.test(manifest.comercio_id))) throw new Error('La copia no tiene el índice de restauración compatible. Generá una copia nueva.');
  const required = ['schema.sql', 'catalog.json', 'storage.json', manifest.comercio_id ? 'tenant.ndjson' : 'public.ndjson'];
  if (required.some((file) => !manifest.files.some((entry) => entry.file === file))) throw new Error('Falta un archivo obligatorio en el manifiesto');
  const snapshot = parseBackupRows(await readFile(path.join(dir, manifest.comercio_id ? 'tenant.ndjson' : 'public.ndjson'), 'utf8'));
  if (snapshot.manifest.comercio_id !== manifest.comercio_id) throw new Error('Alcance inconsistente');
  const storage = JSON.parse(await readFile(path.join(dir, 'storage.json'), 'utf8'));
  const objects = new Set();
  if (!Array.isArray(storage) || storage.length !== manifest.storage_files) throw new Error('Inventario de archivos incompleto');
  for (const entry of storage) {
    const id = JSON.stringify([entry.bucket_id, entry.name]);
    if (!/^[a-zA-Z0-9_-]+$/.test(entry.bucket_id) || entry.bucket_id === 'admin-backups' || typeof entry.name !== 'string' || !entry.name || entry.name.split('/').some((v) => v === '.' || v === '..') || !/^storage\/[0-9]+\.bin$/.test(entry.file) || objects.has(id)) throw new Error('Archivo Storage inválido');
    objects.add(id);
    if (!(await stat(path.join(dir, entry.file))).isFile()) throw new Error('Archivo ausente');
  }
  return { dir, manifest, snapshot, storage, catalog: JSON.parse(await readFile(path.join(dir, 'catalog.json'), 'utf8')), schema: await readFile(path.join(dir, 'schema.sql'), 'utf8') };
}
