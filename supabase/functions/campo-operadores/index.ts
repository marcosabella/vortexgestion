import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
type Action = 'listar' | 'invitar' | 'activar' | 'desactivar';
type RequestBody = { action: Action; comercio_id: string; email?: string; user_id?: string };
type Operador = { user_id: string; email: string; activo: boolean; rol: 'operador' };

function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function normalizeEmail(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }

async function findUserByEmail(url: string, serviceRoleKey: string, email: string) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.trim().toLowerCase() === email);
    if (user || data.users.length < 1000) return user ?? null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ success: false, error: 'No se pudo completar la operación.' }, 400);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') ?? '';
    if (!url || !anonKey || !serviceRoleKey || !authorization.startsWith('Bearer ')) throw new Error('No autorizado');
    const body = await req.json() as RequestBody;
    if (!body || !['listar', 'invitar', 'activar', 'desactivar'].includes(body.action) || !isUuid(body.comercio_id)) throw new Error('Solicitud invalida');
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: identity, error: identityError } = await caller.auth.getUser();
    if (identityError || !identity.user) throw new Error('No autorizado');
    const { data: authorized, error: authorizationError } = await caller.rpc('user_is_comercio_admin', { target_comercio_id: body.comercio_id });
    if (authorizationError || authorized !== true) throw new Error('No autorizado');
    if (body.action === 'listar') {
      const { data, error } = await caller.rpc('campo_listar_operadores_comercio', { p_comercio_id: body.comercio_id });
      if (error) throw error;
      return response({ success: true, operadores: data ?? [] });
    }
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    let userId: string;
    let email: string;
    if (body.action === 'invitar') {
      email = normalizeEmail(body.email);
      if (!email || email.length > 320) throw new Error('Solicitud invalida');
      const existing = await findUserByEmail(url, serviceRoleKey, email);
      if (existing) { userId = existing.id; }
      else {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
        if (error || !data.user) throw new Error('No se pudo invitar al operador');
        userId = data.user.id;
      }
      const { data, error } = await caller.rpc('campo_actualizar_operador_membresia', { p_comercio_id: body.comercio_id, p_user_id: userId, p_activo: true });
      if (error || !data?.[0]) throw new Error('No se pudo gestionar el operador');
      return response({ success: true, operador: { user_id: userId, email, activo: true, rol: 'operador' } satisfies Operador });
    }
    if (!isUuid(body.user_id)) throw new Error('Solicitud invalida');
    userId = body.user_id;
    const { data: membership, error: membershipError } = await caller.from('comercio_usuarios').select('rol').eq('comercio_id', body.comercio_id).eq('user_id', userId).maybeSingle();
    if (membershipError || membership?.rol !== 'operador') throw new Error('No se pudo gestionar el operador');
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError || !authUser.user?.email) throw new Error('No se pudo gestionar el operador');
    email = authUser.user.email.trim().toLowerCase();
    const active = body.action === 'activar';
    const { data, error } = await caller.rpc('campo_actualizar_operador_membresia', { p_comercio_id: body.comercio_id, p_user_id: userId, p_activo: active });
    if (error || !data?.[0]) throw new Error('No se pudo gestionar el operador');
    return response({ success: true, operador: { user_id: userId, email, activo: active, rol: 'operador' } satisfies Operador });
  } catch {
    console.error('campo-operadores: operation failed');
    return response({ success: false, error: 'No se pudo completar la operación.' }, 400);
  }
});
