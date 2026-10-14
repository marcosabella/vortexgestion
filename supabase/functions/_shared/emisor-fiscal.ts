import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

type ContextoFiscal = {
  emisorId?: string | null;
  snapshot?: { cuit_emisor?: string; punto_venta?: number; ambiente?: string } | null;
  ventaLegacy?: boolean;
  permitirPredeterminado?: boolean;
};

// El llamador valida previamente la pertenencia del usuario al comercio.
export async function resolverConfiguracionFiscal(db: SupabaseClient, comercioId: string, contexto: ContextoFiscal = {}) {
  let emisorId = contexto.emisorId;
  if (!emisorId && !contexto.ventaLegacy) {
    const { data: parametros, error } = await db.from('comercio_parametrizacion').select('parametros').eq('comercio_id', comercioId).maybeSingle();
    if (error) throw new Error('No se pudo verificar la configuración fiscal del comercio');
    if (parametros?.parametros?.funciones?.multiples_cuit === true) {
      if (!contexto.permitirPredeterminado) throw new Error('Seleccione el emisor fiscal para esta operación');
      const { data: predeterminado, error: defaultError } = await db.from('emisores_fiscales').select('id').eq('comercio_id', comercioId).eq('activo', true).eq('predeterminado', true).maybeSingle();
      if (defaultError || !predeterminado) throw new Error('Configure un emisor fiscal predeterminado');
      emisorId = predeterminado.id;
    }
  }
  if (emisorId) {
    const { data, error } = await db.from('emisores_fiscales').select('*').eq('id', emisorId).eq('comercio_id', comercioId).eq('activo', true).maybeSingle();
    if (error || !data) throw new Error('El emisor fiscal no está activo o no pertenece al comercio');
    if (contexto.snapshot && (data.cuit_emisor !== contexto.snapshot.cuit_emisor || data.punto_venta !== contexto.snapshot.punto_venta || data.ambiente !== contexto.snapshot.ambiente)) throw new Error('La identidad del emisor no coincide con la registrada en la venta');
    if (contexto.emisorId && contexto.ventaLegacy === false && !contexto.snapshot) throw new Error('La venta no tiene una identidad fiscal registrada');
    return data;
  }
  const { data, error } = await db.from('afip_config').select('*').eq('comercio_id', comercioId).eq('activo', true).maybeSingle();
  if (error || !data) throw new Error('No hay configuración ARCA activa para el comercio');
  return data;
}
