import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, readFile, unlink } from 'node:fs/promises';
import { createDecipheriv } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile } from './admin-backup-worker.mjs';

export async function decryptBackup(input, output, key, maxBytes = 1024 * 1024 * 1024) {
  if (!/^[0-9a-f]{64}$/i.test(key || '')) throw new Error('Clave AES inválida');
  const size = (await stat(input)).size;
  if (size < 37) throw new Error('Archivo incompleto');
  const file = await open(input, 'r');
  const header = Buffer.alloc(20);
  const tag = Buffer.alloc(16);
  try { await file.read(header, 0, 20, 0); await file.read(tag, 0, 16, size - 16); }
  finally { await file.close(); }
  if (header.subarray(0, 8).toString() !== 'VXBACK01') throw new Error('Formato desconocido');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), header.subarray(8));
  decipher.setAuthTag(tag);
  // El .tar solo es válido si termina exitosamente la autenticación GCM.
  // Reservar la salida antes del pipeline permite limpiar únicamente el archivo
  // creado por esta operación, sin borrar uno que ya existía.
  const destination = await open(output, 'wx', 0o600);
  let expanded = 0;
  const limit = async function* (source) { for await (const chunk of source) { expanded += chunk.length; if (expanded > maxBytes) throw new Error('La copia descomprimida supera el límite permitido'); yield chunk; } };
  try {
    await pipeline(createReadStream(input, { start: 20, end: size - 17 }), decipher, createGunzip(), limit, destination.createWriteStream());
  } catch (error) {
    await destination.close();
    await unlink(output);
    throw error;
  } finally {
    await destination.close();
  }
}

export async function verifyExtracted(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('Manifiesto desconocido');
  const storage = JSON.parse(await readFile(path.join(directory, 'storage.json'), 'utf8'));
  if (!Array.isArray(manifest.files) || !Array.isArray(storage)) throw new Error('Inventario inválido');
  const names = new Set();
  for (const entry of [...manifest.files, ...storage]) {
    if (typeof entry.file !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || names.has(entry.file)) throw new Error('Entrada de manifiesto inválida');
    names.add(entry.file);
    const target = path.resolve(directory, entry.file);
    if (!target.startsWith(path.resolve(directory) + path.sep)) throw new Error('Ruta fuera del respaldo');
    if (await hashFile(target) !== entry.sha256) throw new Error(`Checksum inválido: ${entry.file}`);
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, input, output] = process.argv.slice(2);
  try {
    if (action === 'decrypt' && input && output) await decryptBackup(input, output, process.env.BACKUP_ENCRYPTION_KEY);
    else if (action === 'verify' && input) { await verifyExtracted(input); console.log('Checksums verificados. Esto no reemplaza un ensayo de restauración.'); }
    else throw new Error('Uso: node scripts/verify-admin-backup.mjs decrypt archivo.enc salida.tar | verify carpeta-extraída');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
