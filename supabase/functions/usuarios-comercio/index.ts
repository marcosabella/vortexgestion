import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método inválido' }, 405);
  let createdId: string | undefined;
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
    const { data: identity, error: authError } = await caller.auth.getUser();
    if (authError || !identity.user) return reply({ error: 'Sesión inválida' }, 401);
    const body = await req.json();
    if (!uuid(body.comercio_id) || !['crear','guardar'].includes(body.action)) return reply({ error: 'Solicitud inválida' }, 400);
    // La RPC comprueba administración y licencia antes de usar service_role.
    const { data: allowed, error: accessError } = await caller.rpc('vortex_listar_usuarios', { p_comercio_id: body.comercio_id });
    if (accessError || !Array.isArray(allowed)) return reply({ error: 'Solo el administrador del comercio puede gestionar usuarios' }, 403);
    if (typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.trim().length > 100 || !['admin','operador'].includes(body.rol) || typeof body.activo !== 'boolean' || typeof body.permisos !== 'object' || !body.permisos || Array.isArray(body.permisos)) return reply({ error: 'Datos de usuario inválidos' }, 400);
    let userId = body.user_id;
    if (body.action === 'crear') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return reply({ error: 'Ingresá un correo válido y una contraseña de entre 8 y 128 caracteres' }, 400);
      if (allowed.some(u => u.email?.toLowerCase() === email)) return reply({ error: 'El usuario ya pertenece al comercio. Usá Editar acceso.' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true, user_metadata: { nombre: body.nombre.trim() }, app_metadata: { vortex_alta_comercio: body.comercio_id, vortex_alta_actor: identity.user.id } });
      if (error || !data.user) return reply({ error: 'No se pudo crear la cuenta. Si el correo ya está registrado en Vortex, conservá su identidad y solicitá la vinculación a administración.' }, 400);
      userId = data.user.id;
      createdId = userId;
    } else {
      if (!uuid(userId) || !allowed.some(u => u.user_id === userId) || !Number.isSafeInteger(body.version)) return reply({ error: 'Usuario no disponible o versión inválida' }, 400);
      // Editar permisos nunca cambia la contraseña global de la persona.
      if (body.password) return reply({ error: 'La contraseña existente se cambia desde Seguridad por su titular' }, 400);
    }
    const { error } = await caller.rpc('vortex_guardar_usuario', {
      p_comercio_id: body.comercio_id, p_user_id: userId, p_nombre: body.nombre.trim(), p_rol: body.rol, p_activo: body.activo,
      p_perfil: String(body.perfil || 'personalizado'), p_permisos: body.permisos, p_version: body.version ?? 0, p_nuevo: body.action === 'crear',
      p_restaurante_roles: body.restaurante_roles || [], p_restaurante_sector_id: body.restaurante_sector_id || null, p_restaurante_cobros: body.restaurante_cobros === true,
    });
    if (error) {
      if (createdId) {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(createdId);
        if (rollbackError) console.error('usuarios-comercio: no se pudo revertir identidad nueva');
        createdId = undefined;
      }
      return reply({ error: error.message }, 400);
    }
    createdId = undefined;
    return reply({ success: true, user_id: userId });
  } catch {
    if (createdId) await admin.auth.admin.deleteUser(createdId);
    return reply({ error: 'No se pudo completar la gestión del usuario' }, 400);
  }
});
