import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve('private-backups/admin-generator');
const file = path.join(directory, 'generator.env');
try {
  await access(file);
  console.log('La configuración privada ya existe. No se modificó ni se reemplazó la clave.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const identity = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    const result = spawnSync('icacls', [directory, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('No se pudo proteger la carpeta privada; no se generaron secretos.');
  }
  const config = `# Configuración privada. No versionar, publicar ni compartir por chat.
# Completar credenciales y destino antes de iniciar.
SUPABASE_URL=https://zhtqkygjvaaizbdwwsbi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
PGHOST=db.zhtqkygjvaaizbdwwsbi.supabase.co
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=
PGSSLMODE=verify-full
PGSSLROOTCERT=
BACKUP_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}
BACKUP_POLICY_FILE=config/backup-policy.json
BACKUP_WORK_DIR=private-backups/admin
BACKUP_OFFSITE_DIR=
`;
  await writeFile(file, config, { flag: 'wx', mode: 0o600 });
  console.log('Creada configuración privada con clave de cifrado. Guardar una copia segura de la clave.');
}
console.log('Archivo: private-backups/admin-generator/generator.env');
console.log('Completar SUPABASE_SERVICE_ROLE_KEY, PGPASSWORD, PGSSLROOTCERT y BACKUP_OFFSITE_DIR.');
console.log('Comprobar: node --env-file=private-backups/admin-generator/generator.env scripts/admin-backup-worker.mjs --check');
