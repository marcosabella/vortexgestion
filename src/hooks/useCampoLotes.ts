import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CampoLoteListItem } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

export function useCampoLotes(
  comercioId?: string | null,
  establecimientoId?: string | null,
  hasAccess = false,
  establecimientoAutorizado = false,
) {
  return useQuery({
    queryKey: ["campo", comercioId ?? null, "lotes", establecimientoId ?? null],
    enabled:
      isCampoUuid(comercioId) &&
      isCampoUuid(establecimientoId) &&
      hasAccess &&
      establecimientoAutorizado,
    queryFn: async (): Promise<CampoLoteListItem[]> => {
      if (
        !isCampoUuid(comercioId) ||
        !isCampoUuid(establecimientoId) ||
        !hasAccess ||
        !establecimientoAutorizado
      ) {
        return [];
      }

      const { data, error } = await supabase
        .from("campo_lotes")
        .select("id, nombre, codigo_interno, superficie_ha, observaciones, activo")
        .eq("comercio_id", comercioId)
        .eq("establecimiento_id", establecimientoId)
        .order("nombre", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
