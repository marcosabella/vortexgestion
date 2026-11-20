import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: user, error: authError } = await client.auth.getUser(token);
    if (authError || !user.user) return reply({ error: 'Sesión inválida' }, 401);
    const { data: admin, error: adminError } = await client.from('app_admins').select('id').eq('user_id', user.user.id).maybeSingle();
    if (adminError || !admin) return reply({ error: 'Solo el administrador general puede descargar respaldos' }, 403);
    const body = await req.json();
    if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return reply({ error: 'Identificador inválido' }, 400);
    const { data: backup, error } = await client.from('admin_backups').select('estado, archivo').eq('id', body.id).single();
    if (error || !backup || backup.estado !== 'completado' || !backup.archivo) return reply({ error: 'El respaldo no está disponible' }, 404);
    const { data: link, error: signError } = await client.storage.from('admin-backups').createSignedUrl(backup.archivo, 60, { download: true });
    if (signError) throw signError;
    return reply({ url: link.signedUrl });
  } catch {
    return reply({ error: 'No se pudo generar la descarga del respaldo' }, 500);
  }
});
