import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CampoEstablecimientoListItem } from "@/types/campo";

export function useCampoEstablecimientos(comercioId?: string | null, hasAccess = false) {
  return useQuery({
    queryKey: ["campo", comercioId ?? null, "establecimientos"],
    enabled: Boolean(comercioId && hasAccess),
    queryFn: async (): Promise<CampoEstablecimientoListItem[]> => {
      if (!comercioId || !hasAccess) return [];

      const { data, error } = await supabase
        .from("campo_establecimientos")
        .select(`
          id,
          nombre,
          codigo_interno,
          cliente_id,
          localidad,
          superficie_total_ha,
          activo,
          cliente:clientes!campo_establecimientos_cliente_id_fkey(
            nombre,
            apellido
          )
        `)
        .eq("comercio_id", comercioId)
        .order("nombre", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
