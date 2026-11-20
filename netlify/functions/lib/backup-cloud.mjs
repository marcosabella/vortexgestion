import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { unpackRuntime } from './backup-runtime.mjs';

export const project = 'zhtqkygjvaaizbdwwsbi';
export const supabaseUrl = `https://${project}.supabase.co`;
export function client(token) {
  return createClient(supabaseUrl, process.env.BACKUP_SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
}
export async function authorize(request) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Ingresá con tu cuenta de administrador.'), { status: 401 });
  const db = client();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sesión inválida.'), { status: 401 });
  const { data: admin, error: adminError } = await db.from('app_admins').select('id').eq('user_id', data.user.id).maybeSingle();
  if (adminError || !admin) throw Object.assign(new Error('Solo el administrador general puede gestionar copias.'), { status: 403 });
  return { user: data.user, token, db };
}
export function ready() {
  return Boolean(process.env.BACKUP_SUPABASE_SERVICE_KEY && process.env.BACKUP_MANAGEMENT_TOKEN && /^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || '') && process.env.BACKUP_DISPATCH_SECRET);
}
export const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function prepareCloudEnvironment() {
  if (!ready()) throw new Error('Configuración de respaldos incompleta');
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/cli/login-role`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.BACKUP_MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ read_only: false }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('No se pudo obtener la conexión temporal');
  const role = await response.json();
  if (!role.role || !role.password || role.ttl_seconds < 900) throw new Error('Conexión temporal insuficiente');
  const runtime = await unpackRuntime(path.resolve('netlify/functions/runtime/pg-runtime.tgz'));
  Object.assign(process.env, {
    SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: process.env.BACKUP_SUPABASE_SERVICE_KEY,
    PGHOST: 'aws-1-us-east-1.pooler.supabase.com', PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: `${role.role}.${project}`, PGPASSWORD: role.password,
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: path.join(runtime, 'ca-bundle.crt'), PGCLIENTENCODING: 'UTF8',
    BACKUP_PSQL: path.join(runtime, 'psql'), BACKUP_PG_DUMP: path.join(runtime, 'pg_dump'), BACKUP_TAR: path.join(runtime, 'tar'),
    BACKUP_WORK_DIR: path.join(os.tmpdir(), 'vortex-backups'), BACKUP_CLOUD: 'true', BACKUP_POLICY_FILE: path.resolve('config/backup-policy.json'),
  });
  return runtime;
}
