import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { project } from '../netlify/functions/lib/backup-cloud.mjs';

const directory = path.resolve('private-backups/admin-generator');
const destination = path.join(directory, 'local-service.env');
try {
  await access(destination);
  console.log('El servicio local ya tiene configuración privada. No se reemplazaron credenciales ni claves.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const { token } = JSON.parse(await readFile(path.join(directory, 'management.json'), 'utf8'));
  const original = await readFile(path.join(directory, 'generator.env'), 'utf8');
  const key = original.match(/^BACKUP_ENCRYPTION_KEY=([a-f0-9]{64})/im)?.[1];
  if (!key || !token) throw new Error('Falta la clave o la sesión privada de administración existente.');
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/api-keys`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`No se pudo consultar la credencial de servicio (HTTP ${response.status}).`);
  const keys = await response.json();
  const service = keys.find((entry) => entry.name === 'service_role')?.api_key;
  if (!service) throw new Error('No se encontró la credencial de servicio.');
  const values = {
    BACKUP_MANAGEMENT_TOKEN: token,
    BACKUP_SUPABASE_SERVICE_KEY: service,
    BACKUP_ENCRYPTION_KEY: key,
    BACKUP_DISPATCH_SECRET: randomBytes(32).toString('hex'),
    BACKUP_RESTORE_ENABLED: 'false',
  };
  await writeFile(destination, '# Sólo servidor local. No publicar ni copiar al frontend.\n' + Object.entries(values).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Configuración guardada en la carpeta privada existente. Se conservó la clave de recuperación. Restauración deshabilitada.');
}
console.log('Inicio: node scripts/local-backup-service.mjs · Comprobación: node scripts/local-backup-job.mjs --check');
