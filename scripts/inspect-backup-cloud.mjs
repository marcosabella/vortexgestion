// Diagnóstico de infraestructura. Nunca imprime tokens ni valores de variables.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const config = JSON.parse(await readFile(path.join(process.env.APPDATA, 'netlify/Config/config.json'), 'utf8'));
const token = config.users[config.userId].auth.token;
const site = JSON.parse(await readFile('.netlify/state.json', 'utf8')).siteId;
async function get(route) {
  const response = await fetch(`https://api.netlify.com/api/v1${route}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Netlify HTTP ${response.status}`);
  return response.json();
}
try {
  const info = await get(`/sites/${site}`);
  const variables = await get(`/accounts/${info.account_id}/env?site_id=${site}`);
  const keys = variables.map((v) => v.key).sort();
  console.log(JSON.stringify({ site: info.name, environmentKeys: keys, backupMetadata: variables.filter((v)=>v.key.startsWith('BACKUP_')).map((v)=>({key:v.key,scopes:v.scopes,contexts:v.values?.map((x)=>x.context)})), buildEnvironmentKeys: Object.keys(info.build_settings?.env || {}).sort(), hasDatabaseConnection: keys.some((key) => /DATABASE_URL|PGPASSWORD|SUPABASE_DB_PASSWORD/.test(key)), hasBackupEncryptionKey: keys.includes('BACKUP_ENCRYPTION_KEY') }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
