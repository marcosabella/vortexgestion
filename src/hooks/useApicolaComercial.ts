import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { ApicolaFila, ApicolaFiltro } from '@/types/apicola';
import type { CajaApicola, CatalogoComercialApicola, FuenteCajaApicola, ValoracionStockApicola } from '@/types/apicolaComercial';
const api = supabase as SupabaseClient;
const filtros = (comercioId: string, filtro: ApicolaFiltro, pagina: number) => ({ p_comercio: comercioId, p_campana: filtro.campana || null, p_apiario: filtro.apiario || null, p_desde: filtro.desde || null, p_hasta: filtro.hasta || null, p_pagina: pagina });
async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> { const { data, error } = await api.rpc(nombre, args); if (error) throw new Error(error.message); return data as T; }
export function useApicolaComercialListado(comercioId: string, tipo: string, filtro: ApicolaFiltro, pagina: number, loteId?: string) {
  return useQuery({ queryKey: ['apicola', comercioId, 'comercial', tipo, filtro, pagina, loteId], queryFn: () => rpc<{ items: ApicolaFila[]; total: number }>('apicola_comercial_consultar', { ...filtros(comercioId, filtro, pagina), p_tipo: tipo, p_lote: loteId || null }) });
}
export function useApicolaComercialCatalogo(comercioId: string, tipo: 'insumos' | 'items', busqueda: string, pagina: number, enabled = true) {
  return useQuery({ queryKey: ['apicola', comercioId, 'comercial-catalogo', tipo, busqueda, pagina], enabled, queryFn: () => rpc<{ items: CatalogoComercialApicola[]; total: number }>('apicola_comercial_catalogo', { p_comercio: comercioId, p_tipo: tipo, p_busqueda: busqueda, p_pagina: pagina }) });
}
export function useApicolaCajaFuentes(comercioId: string, busqueda: string, pagina: number, enabled: boolean) {
  return useQuery({ queryKey: ['apicola', comercioId, 'caja-fuentes', busqueda, pagina], enabled, queryFn: () => rpc<{ items: FuenteCajaApicola[]; total: number }>('apicola_caja_fuentes', { p_comercio: comercioId, p_busqueda: busqueda, p_pagina: pagina }) });
}
export function useApicolaCaja(comercioId: string, filtro: ApicolaFiltro, pagina: number, enabled: boolean) {
  return useQuery({ queryKey: ['apicola', comercioId, 'caja', filtro, pagina], enabled, queryFn: () => rpc<CajaApicola>('apicola_caja_consultar', filtros(comercioId, filtro, pagina)) });
}
export function useApicolaValoracion(comercioId: string, filtro: ApicolaFiltro, precio: number | null, moneda: string, enabled: boolean) {
  return useQuery({ queryKey: ['apicola', comercioId, 'valoracion', filtro.campana, filtro.apiario, precio, moneda], enabled, queryFn: () => rpc<ValoracionStockApicola>('apicola_valorar_stock', { p_comercio: comercioId, p_campana: filtro.campana || null, p_apiario: filtro.apiario || null, p_precio_kg: precio, p_moneda: moneda }) });
}
export function useApicolaComercialOperar(comercioId: string, caja = false) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (d: { accion: string; datos: Record<string, unknown>; clave: string }) => rpc('apicola_' + (caja ? 'caja' : 'comercial') + '_operar', { p_comercio: comercioId, p_accion: d.accion, p_datos: d.datos, p_clave: d.clave }), onSuccess: () => {
    void client.invalidateQueries({ queryKey: ['apicola', comercioId] }); void client.invalidateQueries({ queryKey: ['productos'] }); void client.invalidateQueries({ queryKey: ['productos-pagina'] });
  } });
}
