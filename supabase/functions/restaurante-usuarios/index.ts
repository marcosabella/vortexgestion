import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método inválido' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authorization = req.headers.get('Authorization') || '';
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: identity, error: identityError } = await caller.auth.getUser();
    if (identityError || !identity.user) return reply({ error: 'Sin acceso' }, 401);
    const body = await req.json();
    if (!uuid(body.comercio_id) || !['guardar', 'crear'].includes(body.action)) return reply({ error: 'Solicitud inválida' }, 400);
    const { data: allowed, error: accessError } = await caller.rpc('restaurante_listar_usuarios', { p_comercio_id: body.comercio_id });
    if (accessError || !Array.isArray(allowed)) return reply({ error: 'Sin acceso' }, 403);
    if (typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.trim().length > 100 || !Array.isArray(body.roles) || !body.roles.length || !body.roles.every((r: unknown) => ['mozo','repartidor','cocina','barra'].includes(String(r))) || typeof body.activo !== 'boolean' || typeof body.cobros !== 'boolean') return reply({ error: 'Datos inválidos' }, 400);
    const password = typeof body.password === 'string' ? body.password : '';
    if ((body.action === 'crear' || password) && (password.length < 8 || password.length > 128)) return reply({ error: 'La contraseña debe tener entre 8 y 128 caracteres.' }, 400);
    if (body.roles.some((r: string) => ['cocina','barra'].includes(r)) && (body.roles.length !== 1 || !uuid(body.sector_id))) return reply({ error: 'Preparación requiere un rol y un sector' }, 400);
    if (body.sector_id) {
      const { data: resumen, error } = await caller.rpc('restaurante_resumen', { p_comercio_id: body.comercio_id });
      if (error || !resumen?.sectores?.some((s: { id: string; activo: boolean }) => s.id === body.sector_id && s.activo)) return reply({ error: 'Sector no disponible' }, 400);
    }
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    let userId = body.usuario_id;
    let created = false;
    if (body.action === 'crear') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply({ error: 'Email inválido' }, 400);
      if (allowed.some(u => u.email?.toLowerCase() === email)) return reply({ error: 'Ese email ya pertenece al comercio. Usá Editar acceso.' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) return reply({ error: error?.code === 'email_exists' ? 'Ese email ya tiene una cuenta de Vortex. Usá otro email para la cuenta del restaurante.' : 'No se pudo crear la cuenta. Revisá el email y los requisitos de contraseña.' }, 400);
      userId = data.user.id;
      created = true;
    } else {
      const local = allowed.find(u => u.id === userId && !u.admin);
      if (!uuid(userId) || !local) return reply({ error: 'Usuario no disponible' }, 400);
      if (password) {
        // La contraseña es global. Sólo gestionamos identidades exclusivas de este restaurante.
        const { data: memberships, error } = await admin.from('comercio_usuarios').select('comercio_id,solo_restaurante,rol').eq('user_id', userId);
        if (error || !local.solo_restaurante || memberships?.length !== 1 || memberships[0].comercio_id !== body.comercio_id || !memberships[0].solo_restaurante || memberships[0].rol !== 'operador') return reply({ error: 'La contraseña de esta cuenta compartida se cambia desde Seguridad por su titular.' }, 400);
      }
    }
    const { error } = await caller.rpc('restaurante_guardar_usuario', { p_comercio_id: body.comercio_id, p_usuario_id: userId, p_nombre: body.nombre, p_roles: body.roles, p_sector_id: body.sector_id || null, p_cobros: body.cobros, p_activo: body.activo, p_nuevo: created });
    if (error) {
      if (created) await admin.auth.admin.deleteUser(userId);
      return reply({ error: 'No se guardó el acceso. Revisá las funciones y el sector seleccionado.' }, 400);
    }
    if (!created && password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (error) return reply({ error: 'Se guardaron los roles, pero no se pudo cambiar la contraseña. Revisá sus requisitos y reintentá.' }, 400);
    }
    return reply({ success: true });
  } catch {
    return reply({ error: 'No se pudo gestionar el usuario. Revisá los datos y la configuración de acceso.' }, 400);
  }
});
