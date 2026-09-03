import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CampoOperario, CampoOperarioFormValues } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";
import { campoCatalogError } from "@/utils/campoCatalogErrors";

const key = (comercioId?: string | null) =>
  ["campo", comercioId ?? null, "operarios"] as const;
const normalized = (v: CampoOperarioFormValues) => ({
  nombre: v.nombre.trim(),
  codigo_interno: v.codigo_interno.trim() || null,
  documento: v.documento.trim() || null,
  telefono: v.telefono.trim() || null,
  observaciones: v.observaciones.trim() || null,
});
function guard(comercioId: string | null | undefined, allowed: boolean) {
  if (!isCampoUuid(comercioId) || !allowed) {
    throw new Error("Sin permisos para operar sobre operarios.");
  }
  return comercioId;
}

export function useCampoOperarios(
  comercioId?: string | null,
  hasAccess = false,
) {
  return useQuery({
    queryKey: key(comercioId),
    enabled: isCampoUuid(comercioId) && hasAccess,
    queryFn: async (): Promise<CampoOperario[]> => {
      const id = guard(comercioId, hasAccess);
      const { data, error } = await supabase.from("campo_operarios").select(
        "id,nombre,codigo_interno,documento,telefono,observaciones,activo,created_at,updated_at",
      ).eq("comercio_id", id).order("nombre").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useCreateCampoOperario(
  comercioId?: string | null,
  allowed = false,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: CampoOperarioFormValues) => {
      const id = guard(comercioId, allowed);
      const payload = { comercio_id: id, ...normalized(v) };
      if (!payload.nombre) throw new Error("Nombre inválido");
      const { data, error } = await supabase.from("campo_operarios").insert(
        payload,
      ).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(comercioId) });
      toast({ title: "Operario creado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: campoCatalogError(e, "el operario"),
        variant: "destructive",
      }),
  });
}
export function useUpdateCampoOperario(
  comercioId?: string | null,
  allowed = false,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id, values }: { id: string; values: CampoOperarioFormValues },
    ) => {
      const cid = guard(comercioId, allowed);
      const payload = normalized(values);
      if (!payload.nombre) throw new Error("Nombre inválido");
      const { data, error } = await supabase.from("campo_operarios").update(
        payload,
      ).eq("id", id).eq("comercio_id", cid).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(comercioId) });
      toast({ title: "Operario actualizado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: campoCatalogError(e, "el operario"),
        variant: "destructive",
      }),
  });
}
export function useSetCampoOperarioStatus(
  comercioId?: string | null,
  allowed = false,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const cid = guard(comercioId, allowed);
      const { data, error } = await supabase.from("campo_operarios").update({
        activo,
      }).eq("id", id).eq("comercio_id", cid).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: key(comercioId) });
      toast({
        title: v.activo ? "Operario reactivado" : "Operario desactivado",
      });
    },
    onError: (e) =>
      toast({
        title: "No se pudo cambiar el estado",
        description: campoCatalogError(e, "el operario"),
        variant: "destructive",
      }),
  });
}
