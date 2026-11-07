import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { ApicolaFiltro } from '@/types/apicola';
import type { DocumentoEconomicoApicola, EconomiaApicola, OrigenEconomicoApicola } from '@/types/apicolaEconomia';

const api = supabase as SupabaseClient;
export function useApicolaEconomia(comercioId: string, filtro: ApicolaFiltro, tipo: 'costo' | 'ingreso' | undefined, pagina: number, enabled: boolean) {
  return useQuery({ queryKey: ['apicola', comercioId, 'economia', filtro, tipo, pagina], enabled, queryFn: async (): Promise<EconomiaApicola> => {
    const { data, error } = await api.rpc('apicola_economia_consultar', { p_comercio: comercioId, p_campana: filtro.campana || null, p_apiario: filtro.apiario || null, p_desde: filtro.desde || null, p_hasta: filtro.hasta || null, p_tipo: tipo || null, p_pagina: pagina });
    if (error) throw error;
    return data as EconomiaApicola;
  } });
}
export function useApicolaDocumentosEconomicos(comercioId: string, origen: OrigenEconomicoApicola, busqueda: string, pagina: number, enabled: boolean) {
  return useQuery({ queryKey: ['apicola', comercioId, 'documentos-economicos', origen, busqueda, pagina], enabled: enabled && origen !== 'estimado', queryFn: async () => {
    const { data, error } = await api.rpc('apicola_economia_documentos', { p_comercio: comercioId, p_origen: origen, p_busqueda: busqueda, p_pagina: pagina });
    if (error) throw error;
    return data as { items: DocumentoEconomicoApicola[]; total: number };
  } });
}
export function useApicolaEconomiaOperar(comercioId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ accion, datos, clave }: { accion: 'imputar' | 'anular'; datos: Record<string, unknown>; clave: string }) => {
    const { data, error } = await api.rpc('apicola_economia_operar', { p_comercio: comercioId, p_accion: accion, p_datos: datos, p_clave: clave });
    if (error) throw new Error(error.message);
    return data;
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['apicola', comercioId] }); } });
}
