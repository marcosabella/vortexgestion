import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CampoOrdenListItem } from "@/types/campo";

export function useCampoOrdenes(comercioId?: string | null, hasAccess = false) {
  return useQuery({
    queryKey: ["campo", comercioId ?? null, "ordenes"],
    enabled: Boolean(comercioId && hasAccess),
    queryFn: async (): Promise<CampoOrdenListItem[]> => {
      if (!comercioId || !hasAccess) return [];

      const { data, error } = await supabase
        .from("campo_ordenes_trabajo")
        .select(`
          id,
          numero,
          codigo_interno,
          estado,
          fecha_inicio_planificada,
          fecha_fin_planificada,
          descripcion,
          cliente_id,
          establecimiento_id,
          created_at,
          cliente:clientes!campo_ordenes_trabajo_cliente_id_fkey(
            nombre,
            apellido
          ),
          establecimiento:campo_establecimientos!campo_ordenes_trabajo_establecimiento_id_fkey(
            nombre
          )
        `)
        .eq("comercio_id", comercioId)
        .order("numero", { ascending: false })
        .order("id", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}
