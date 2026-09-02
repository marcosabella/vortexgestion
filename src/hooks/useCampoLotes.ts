import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CampoLoteCreateParams, CampoLoteCreatePayload, CampoLoteListItem } from "@/types/campo";
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

function campoLoteCreateErrorMessage(error: unknown) {
  const supabaseError = error as { code?: string; message?: string };
  const message = supabaseError.message?.toLocaleLowerCase("es") ?? "";

  if (supabaseError.code === "23505" && message.includes("codigo")) {
    return "Ya existe un lote con ese código interno en el establecimiento.";
  }
  if (supabaseError.code === "23505" && message.includes("nombre")) {
    return "Ya existe un lote con ese nombre en el establecimiento.";
  }
  if (
    supabaseError.code === "23503" ||
    message.includes("establecimiento o comercio indicado no es válido") ||
    message.includes("establecimiento indicado no existe") ||
    message.includes("establecimiento pertenece a otro comercio")
  ) {
    return "El establecimiento no fue encontrado o no está disponible en el comercio activo.";
  }
  if (
    supabaseError.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("no tenés permisos")
  ) {
    return "No tenés permisos para crear lotes en este comercio.";
  }
  if (message.includes("establecimiento está inactivo")) {
    return "No se pueden crear lotes en un establecimiento inactivo.";
  }
  return "No se pudo crear el lote. Revisá los datos e intentá nuevamente.";
}

export function useCreateCampoLote(
  comercioId?: string | null,
  establecimientoId?: string | null,
  hasAccess = false,
  isAdmin = false,
  establecimientoAutorizado = false,
  establecimientoActivo = false,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CampoLoteCreateParams) => {
      if (!isCampoUuid(comercioId) || !isCampoUuid(establecimientoId)) {
        throw new Error("El establecimiento o comercio indicado no es válido.");
      }
      if (!hasAccess || !isAdmin || !establecimientoAutorizado) {
        throw new Error("No tenés permisos para crear lotes en este comercio.");
      }
      if (!establecimientoActivo) {
        throw new Error("El establecimiento está inactivo.");
      }

      const nombre = values.nombre.trim();
      if (!nombre) throw new Error("El nombre del lote es obligatorio.");
      if (!Number.isFinite(values.superficie_ha) || values.superficie_ha <= 0) {
        throw new Error("La superficie del lote no es válida.");
      }

      const payload: CampoLoteCreatePayload = {
        comercio_id: comercioId,
        establecimiento_id: establecimientoId,
        nombre,
        codigo_interno: values.codigo_interno,
        superficie_ha: values.superficie_ha,
        observaciones: values.observaciones,
        activo: values.activo,
      };

      const { data, error } = await supabase
        .from("campo_lotes")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["campo", comercioId, "lotes", establecimientoId],
      });
      toast({
        title: "Lote creado",
        description: "El lote quedó registrado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "No se pudo crear el lote",
        description: campoLoteCreateErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}
