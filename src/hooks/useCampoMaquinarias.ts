import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CampoMaquinaria, CampoMaquinariaFormValues } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";
import { campoCatalogError } from "@/utils/campoCatalogErrors";
const key = (id?: string | null) =>
  ["campo", id ?? null, "maquinarias"] as const;
const normalized = (v: CampoMaquinariaFormValues) => {
  const nombre = v.nombre.trim(), tipo = v.tipo.trim(), anio = v.anio.trim();
  if (
    !nombre || !tipo ||
    (anio !== "" &&
      (!/^\d{4}$/.test(anio) || Number(anio) < 1900 || Number(anio) > 2100))
  ) throw new Error("Nombre, tipo o año inválido");
  return {
    nombre,
    codigo_interno: v.codigo_interno.trim() || null,
    tipo,
    marca: v.marca.trim() || null,
    modelo: v.modelo.trim() || null,
    identificacion: v.identificacion.trim() || null,
    anio: anio ? Number(anio) : null,
    observaciones: v.observaciones.trim() || null,
  };
};
function guard(id: string | null | undefined, ok: boolean) {
  if (!isCampoUuid(id) || !ok) {
    throw new Error("Sin permisos para operar sobre maquinarias.");
  }
  return id;
}
export function useCampoMaquinarias(id?: string | null, access = false) {
  return useQuery({
    queryKey: key(id),
    enabled: isCampoUuid(id) && access,
    queryFn: async (): Promise<CampoMaquinaria[]> => {
      const cid = guard(id, access);
      const { data, error } = await supabase.from("campo_maquinarias").select(
        "id,nombre,codigo_interno,tipo,marca,modelo,identificacion,anio,observaciones,activo,created_at,updated_at",
      ).eq("comercio_id", cid).order("nombre").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useCreateCampoMaquinaria(id?: string | null, ok = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: CampoMaquinariaFormValues) => {
      const cid = guard(id, ok),
        payload = { comercio_id: cid, ...normalized(v) };
      const { data, error } = await supabase.from("campo_maquinarias").insert(
        payload,
      ).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(id) });
      toast({ title: "Maquinaria creada" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: campoCatalogError(e, "la maquinaria"),
        variant: "destructive",
      }),
  });
}
export function useUpdateCampoMaquinaria(id?: string | null, ok = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id: rowId, values }: { id: string; values: CampoMaquinariaFormValues },
    ) => {
      const cid = guard(id, ok);
      const { data, error } = await supabase.from("campo_maquinarias").update(
        normalized(values),
      ).eq("id", rowId).eq("comercio_id", cid).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(id) });
      toast({ title: "Maquinaria actualizada" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: campoCatalogError(e, "la maquinaria"),
        variant: "destructive",
      }),
  });
}
export function useSetCampoMaquinariaStatus(id?: string | null, ok = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id: rowId, activo }: { id: string; activo: boolean },
    ) => {
      const cid = guard(id, ok);
      const { data, error } = await supabase.from("campo_maquinarias").update({
        activo,
      }).eq("id", rowId).eq("comercio_id", cid).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: key(id) });
      toast({
        title: v.activo ? "Maquinaria reactivada" : "Maquinaria desactivada",
      });
    },
    onError: (e) =>
      toast({
        title: "No se pudo cambiar el estado",
        description: campoCatalogError(e, "la maquinaria"),
        variant: "destructive",
      }),
  });
}
