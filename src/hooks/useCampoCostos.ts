import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isCampoUuid } from "@/utils/campo";
import { campoCostoCatalogoSchema, campoCostosCatalogoKey, campoCostosKey, campoCostosParteSchema } from "@/utils/campoCostos";

export type CampoCostoCategoriaCatalogo = "operarios" | "maquinarias" | "insumos";
const rpcCatalogo = { operarios: "campo_costos_operarios", maquinarias: "campo_costos_maquinarias", insumos: "campo_costos_insumos" } as const;
export function useCampoCostosCatalogo(c: string, categoria: CampoCostoCategoriaCatalogo, isAdmin: boolean) {
  return useQuery({
    gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryKey: campoCostosCatalogoKey(c, categoria), enabled: isAdmin && isCampoUuid(c),
    queryFn: async () => {
      if (!isAdmin || !isCampoUuid(c)) throw new Error("Costos no disponibles.");
      const { data, error } = await supabase.rpc(rpcCatalogo[categoria], { p_comercio_id: c });
      if (error) throw new Error("No se pudieron cargar los costos.");
      const parsed = campoCostoCatalogoSchema.array().safeParse(data);
      if (!parsed.success) throw new Error("Costos no disponibles.");
      return new Map(parsed.data.map(v => [v.id, v]));
    },
  });
}
export function useCampoCostosParte(c: string, o: string, p: string, isAdmin: boolean) {
  return useQuery({
    gcTime: 0, queryKey: campoCostosKey(c, o, p), enabled: isAdmin && [c, o, p].every(isCampoUuid),
    queryFn: async () => {
      if (!isAdmin || ![c, o, p].every(isCampoUuid)) throw new Error("Costos no disponibles.");
      const { data, error } = await supabase.rpc("campo_costos_parte", { p_parte_id: p });
      if (error) throw new Error("No se pudieron cargar los costos.");
      const parsed = campoCostosParteSchema.safeParse(data);
      if (!parsed.success || parsed.data.comercio_id !== c || parsed.data.orden_id !== o || parsed.data.parte_id !== p) throw new Error("Costos no disponibles.");
      return parsed.data;
    },
  });
}
