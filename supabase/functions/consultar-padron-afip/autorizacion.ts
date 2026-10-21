import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

export async function getAuthorizedComercioId(req: Request, supabase: SupabaseClient, requestedComercioId?: string, altaComercio = false): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!token) throw new Error('Usuario no autenticado');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Sesion invalida');

  if (altaComercio) {
    const { data: admin, error } = await supabase.from('app_admins')
      .select('id').eq('user_id', userData.user.id).maybeSingle();
    if (error || !admin) throw new Error('No tiene permisos de administrador');
    // La consulta usa únicamente una membresía propia del administrador.
    // Nunca tomar certificados de un comercio ajeno para completar un alta.
  }

  let query = supabase.from('comercio_usuarios').select('comercio_id')
    .eq('user_id', userData.user.id).eq('activo', true).eq('solo_restaurante', false);
  if (requestedComercioId) query = query.eq('comercio_id', requestedComercioId);
  const { data, error } = await query;
  if (!error && altaComercio && !requestedComercioId && !data?.length) return null;
  if (error || !data?.length) throw new Error('No tiene acceso al comercio solicitado');
  if (!requestedComercioId && data.length > 1) throw new Error('Debe indicar el comercio para esta consulta');
  return data[0].comercio_id;
}
