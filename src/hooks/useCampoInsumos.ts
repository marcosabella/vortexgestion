import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type {
  CampoInsumo,
  CampoInsumoFormValues,
  CampoInsumUnidad,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";
import { campoCatalogError } from "@/utils/campoCatalogErrors";
export const campoInsumoUnidades: CampoInsumUnidad[] = [
  "litro",
  "kilogramo",
  "tonelada",
  "unidad",
  "bolsa",
  "metro",
  "dosis",
];
const key = (id?: string | null) => ["campo", id ?? null, "insumos"] as const;
const normalized = (v: CampoInsumoFormValues) => {
  const nombre = v.nombre.trim();
  if (!nombre || !campoInsumoUnidades.includes(v.unidad)) {
    throw new Error("Nombre o unidad inválida");
  }
  return {
    nombre,
    codigo_interno: v.codigo_interno.trim() || null,
    unidad: v.unidad,
    observaciones: v.observaciones.trim() || null,
  };
};
function guard(id: string | null | undefined, ok: boolean) {
  if (!isCampoUuid(id) || !ok) {
    throw new Error("Sin permisos para operar sobre insumos.");
  }
  return id;
}
export function useCampoInsumos(id?: string | null, access = false) {
  return useQuery({
    queryKey: key(id),
    enabled: isCampoUuid(id) && access,
    queryFn: async (): Promise<CampoInsumo[]> => {
      const cid = guard(id, access);
      const { data, error } = await supabase.from("campo_insumos").select(
        "id,nombre,codigo_interno,unidad,observaciones,activo,created_at,updated_at",
      ).eq("comercio_id", cid).order("nombre").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useCreateCampoInsumo(id?: string | null, ok = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: CampoInsumoFormValues) => {
      const cid = guard(id, ok),
        payload = { comercio_id: cid, ...normalized(v) };
      const { data, error } = await supabase.from("campo_insumos").insert(
        payload,
      ).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(id) });
      toast({ title: "Insumo creado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: campoCatalogError(e, "el insumo"),
        variant: "destructive",
      }),
  });
}
export function useUpdateCampoInsumo(id?: string | null, ok = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id: rowId, values }: { id: string; values: CampoInsumoFormValues },
    ) => {
      const cid = guard(id, ok);
      const { data, error } = await supabase.from("campo_insumos").update(
        normalized(values),
      ).eq("id", rowId).eq("comercio_id", cid).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(id) });
      toast({ title: "Insumo actualizado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: campoCatalogError(e, "el insumo"),
        variant: "destructive",
      }),
  });
}
export function useSetCampoInsumoStatus(id?: string | null, ok = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id: rowId, activo }: { id: string; activo: boolean },
    ) => {
      const cid = guard(id, ok);
      const { data, error } = await supabase.from("campo_insumos").update({
        activo,
      }).eq("id", rowId).eq("comercio_id", cid).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: key(id) });
      toast({ title: v.activo ? "Insumo reactivado" : "Insumo desactivado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo cambiar el estado",
        description: campoCatalogError(e, "el insumo"),
        variant: "destructive",
      }),
  });
}
