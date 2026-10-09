import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { hashPin, hashTerminal, secreto } from './crypto.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método inválido' }, 405);
  try {
    const text = await req.text(); if (text.length > 4096) return reply({ error: 'Solicitud inválida' }, 400);
    const body = JSON.parse(text);
    const url = Deno.env.get('SUPABASE_URL')!; const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === 'listar' || body.action === 'ingresar' || body.action === 'validar_terminal') {
      if (typeof body.token !== 'string' || !/^[0-9a-f]{64}$/.test(body.token)) return reply({ error: 'Terminal no habilitada o vencida' }, 403);
      const tokenHash = await hashTerminal(body.token);
      const { data: info, error } = await admin.rpc('restaurante_terminal_info', { p_token_hash: tokenHash });
      if (error || !info) return reply({ error: 'Terminal no habilitada o vencida' }, 403);
      if (body.action === 'validar_terminal') {
        if (!uuid(body.comercio_id) || info.comercio_id !== body.comercio_id) return reply({ error: 'La terminal no pertenece al comercio activo' }, 403);
        const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
        const { data: identity, error: identityError } = await caller.auth.getUser();
        if (identityError || !identity.user) return reply({ error: 'Sin acceso' }, 401);
        const { data: permitido, error: accessError } = await caller.rpc('restaurante_acceso', { p_comercio: info.comercio_id });
        if (accessError || permitido !== true) return reply({ error: 'Este usuario no tiene acceso al restaurante del comercio activo' }, 403);
        return reply({ comercio_id: info.comercio_id });
      }
      if (body.action === 'listar') return reply({ nombre: info.nombre, usuarios: info.usuarios });
      if (!uuid(body.usuario_id) || typeof body.pin !== 'string' || !/^\d{6}$/.test(body.pin)) return reply({ error: 'Elegí una persona e ingresá un PIN de 6 dígitos' }, 400);
      const { data: pin, error: pinError } = await admin.from('restaurante_pines').select('salt').eq('comercio_id', info.comercio_id).eq('usuario_id', body.usuario_id).maybeSingle();
      if (pinError) return reply({ error: 'No se pudo verificar el acceso' }, 503);
      const candidate = pin ? await hashPin(body.pin, pin.salt) : '';
      const { data: verified, error: verifyError } = await admin.rpc('restaurante_pin_verificar', { p_token_hash: tokenHash, p_usuario_id: body.usuario_id, p_hash: candidate });
      if (verifyError || !verified) return reply({ error: 'PIN incorrecto o acceso bloqueado. Después de varios intentos, esperá 15 minutos o consultá al administrador.' }, 401);
      // Generar y consumir el token en el servidor no envía correos ni expone el enlace.
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: verified.email });
      if (linkError || link.user?.id !== verified.usuario_id || !link.properties?.hashed_token) return reply({ error: 'No se pudo iniciar la sesión' }, 503);
      const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: login, error: loginError } = await auth.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
      if (loginError || !login.session || login.user?.id !== verified.usuario_id) return reply({ error: 'No se pudo iniciar la sesión' }, 503);
      return reply({ access_token: login.session.access_token, refresh_token: login.session.refresh_token, comercio_id: verified.comercio_id });
    }
    if (!['guardar_pin', 'crear_terminal'].includes(body.action) || !uuid(body.comercio_id)) return reply({ error: 'Solicitud inválida' }, 400);
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
    const { data: identity, error: identityError } = await caller.auth.getUser();
    if (identityError || !identity.user) return reply({ error: 'Sin acceso' }, 401);
    const { error: accessError } = await caller.rpc('restaurante_listar_usuarios', { p_comercio_id: body.comercio_id });
    if (accessError) return reply({ error: 'Sólo administración puede gestionar PIN y terminales' }, 403);
    if (body.action === 'crear_terminal') {
      if (typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.trim().length > 100) return reply({ error: 'Indicá el nombre de la terminal' }, 400);
      const token = secreto();
      const { data, error } = await caller.rpc('restaurante_terminal_crear', { p_comercio_id: body.comercio_id, p_nombre: body.nombre, p_token_hash: await hashTerminal(token) });
      if (error) return reply({ error: 'No se pudo habilitar la terminal' }, 400);
      return reply({ token, id: data });
    }
    if (!uuid(body.usuario_id) || (body.pin !== null && (typeof body.pin !== 'string' || !/^\d{6}$/.test(body.pin)))) return reply({ error: 'Definí un PIN de 6 dígitos' }, 400);
    const salt = body.pin === null ? null : secreto();
    const { error } = await caller.rpc('restaurante_pin_guardar', { p_comercio_id: body.comercio_id, p_usuario_id: body.usuario_id, p_hash: salt ? await hashPin(body.pin, salt) : null, p_salt: salt });
    if (error) return reply({ error: error.message }, 400);
    return reply({ success: true });
  } catch { return reply({ error: 'No se pudo completar el acceso. Revisá los datos e intentá nuevamente.' }, 400); }
});
