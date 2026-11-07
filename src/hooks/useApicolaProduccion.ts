import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { ProduccionApicola } from '@/types/apicolaProduccion';
import type { StockApicola } from '@/types/apicolaComercial';

const api = supabase as SupabaseClient;
export function useApicolaProduccion(comercioId: string, enabled = true) {
  return useQuery({ queryKey: ['apicola', comercioId, 'produccion'], enabled, queryFn: async (): Promise<ProduccionApicola> => {
    const nombres = ['salas', 'analisis', 'cosechas', 'extracciones', 'lotes', 'tambores', 'origenes'] as const;
    const entradas = await Promise.all(nombres.map(async nombre => {
      const tabla = nombre === 'origenes' ? 'apicola_extraccion_origenes' : `apicola_${nombre}`;
      const rows: unknown[] = [];
      for (let desde = 0; ; desde += 500) {
        let query = api.from(tabla).select('*').eq('comercio_id', comercioId);
        query = nombre === 'origenes' ? query.order('extraccion_id').order('cosecha_id') : query.order('id');
        const { data, error } = await query.range(desde, desde + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return [nombre, rows];
      }
    }));
    const { data: stock, error: stockError } = await api.rpc('apicola_stock_consultar', { p_comercio: comercioId });
    if (stockError) throw stockError;
    return { ...Object.fromEntries(entradas), stock: stock as StockApicola } as ProduccionApicola;
  } });
}
export function useApicolaProduccionOperar(comercioId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ accion, datos, clave }: { accion: string; datos: Record<string, unknown>; clave: string }) => {
    const { data, error } = await api.rpc('apicola_produccion_operar', { p_comercio: comercioId, p_accion: accion, p_datos: datos, p_clave: clave });
    if (error) throw new Error(error.code === '23505' ? 'El código ya existe en este comercio.' : error.message);
    return data;
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['apicola', comercioId] }); } });
}
