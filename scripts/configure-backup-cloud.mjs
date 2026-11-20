import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// Preparación autorizada: secretos solo en memoria/carpeta privada y entorno de funciones.
const privateDir = path.resolve('private-backups/admin-generator');
const management = JSON.parse(await readFile(path.join(privateDir, 'management.json'), 'utf8')).token;
const config = await readFile(path.join(privateDir, 'generator.env'), 'utf8');
const key = config.match(/^BACKUP_ENCRYPTION_KEY=([a-f0-9]{64})/im)?.[1];
if (!key) throw new Error('No hay clave de recuperación válida');
const ref = 'zhtqkygjvaaizbdwwsbi';
async function api(route, method = 'GET', body) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${route}`, { method, headers: { Authorization: `Bearer ${management}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Supabase ${route}: HTTP ${r.status}`);
  return r.json();
}
const keys = await api('/api-keys');
const service = keys.find((item) => item.name === 'service_role')?.api_key;
if (!service) throw new Error('No se encontró la credencial de servicio');
const role = await api('/cli/login-role', 'POST', { read_only: false });
const data = gunzipSync(await readFile('netlify/functions/runtime/pg-runtime.tgz'));
let ca;
for (let offset = 0; offset + 512 <= data.length;) {
  const h = data.subarray(offset, offset + 512);
  const name = h.subarray(0, 100).toString().replace(/\0.*$/, '');
  const size = parseInt(h.subarray(124,136).toString().replace(/\0.*$/, '').trim() || '0', 8);
  if (name === './ca-bundle.crt') ca = data.subarray(offset + 512, offset + 512 + size).toString();
  offset += 512 + Math.ceil(size/512)*512;
}
if (!ca) throw new Error('Falta la cadena de certificados');
const rootResponse = await fetch('https://supabase-downloads.s3.amazonaws.com/prod/ssl/prod-ca-2021.crt');
const root = await rootResponse.text();
if (rootResponse.ok && root.includes('-----BEGIN CERTIFICATE-----')) ca += `\n${root}\n`;
const caFile = path.join(privateDir,'ca.pem');
await writeFile(caFile, ca, { mode: 0o600 });
const env = { ...process.env, PGHOST:'aws-1-us-east-1.pooler.supabase.com', PGPORT:'5432', PGDATABASE:'postgres', PGUSER:`${role.role}.${ref}`, PGPASSWORD:role.password, PGSSLMODE:'verify-full', PGSSLROOTCERT:caFile, PGCLIENTENCODING:'UTF8' };
const check = spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c','SELECT 1'], { env, encoding:'utf8', windowsHide:true, timeout:60000 });
if (check.status !== 0 || check.stdout.trim() !== '1') {
  const diagnostic = (check.stderr || check.error?.message || '').replaceAll(role.password, '[oculto]').slice(0,1200);
  throw new Error(`Conexión temporal PostgreSQL rechazada: ${diagnostic}`);
}
console.log('Conexión temporal PostgreSQL y TLS verificadas. No se cambió la contraseña.');
if (process.argv.includes('--check')) process.exit(0);
// La CA es pública y se incluye en el paquete, no en variables limitadas de Lambda.
await writeFile('private-backups/runtime-test/ca-bundle.crt', ca);
const pack = spawnSync('tar',['-czf','netlify/functions/runtime/pg-runtime.tgz','-C','private-backups/runtime-test','.'],{windowsHide:true,encoding:'utf8'});
if(pack.status!==0) throw new Error('No se pudo empaquetar la CA del runtime');
const values = { BACKUP_MANAGEMENT_TOKEN:management, BACKUP_SUPABASE_SERVICE_KEY:service, BACKUP_ENCRYPTION_KEY:key, BACKUP_DISPATCH_SECRET:randomBytes(32).toString('hex') };
const netlifyConfig = JSON.parse(await readFile(path.join(process.env.APPDATA,'netlify/Config/config.json'),'utf8'));
const netlifyToken = netlifyConfig.users[netlifyConfig.userId].auth.token;
const endpoint='https://api.netlify.com/api/v1/accounts/68e392d01bac372ba9d8ea5e/env?site_id=b9996f69-d630-4d0f-ac21-d2a646930add';
const result=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${netlifyToken}`,'Content-Type':'application/json'},body:JSON.stringify(Object.entries(values).map(([key,value])=>({key,values:[{context:'production',value}]}))),signal:AbortSignal.timeout(60000)});
if(!result.ok) {
 const details=await result.json().catch(()=>({}));
 let message=String(details.message||details.error||'');
 for(const secret of Object.values(values)) message=message.replaceAll(secret,'[oculto]');
 throw new Error(`Netlify HTTP ${result.status}: ${message.slice(0,800)}`);
}
console.log('Credenciales de servidor configuradas mediante la API de Netlify (valores ocultos; sin prefijo VITE_).');
