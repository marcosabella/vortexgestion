import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

// Siempre usar con el cliente service_role después de validar el JWT.
export async function assertPermisoUsuario(db: SupabaseClient, userId: string, comercioId: string, modulo: string, accion: string, soloAsignados = false) {
  const { data, error } = await db.rpc(soloAsignados ? 'vortex_permiso_asignado_servicio' : 'vortex_permiso_servicio', {
    p_user_id: userId, p_comercio_id: comercioId, p_modulo: modulo, p_accion: accion,
  });
  if (error || data !== true) throw new Error('No tenés permiso para esta operación');
}
