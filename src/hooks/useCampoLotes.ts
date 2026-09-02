import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type {
  CampoLoteCreateParams,
  CampoLoteCreatePayload,
  CampoLoteListItem,
  CampoLoteStatusParams,
  CampoLoteStatusPayload,
  CampoLoteUpdateParams,
  CampoLoteUpdatePayload,
} from "@/types/campo";
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

function campoLoteUpdateErrorMessage(error: unknown) {
  const supabaseError = error as { code?: string; message?: string };
  const message = supabaseError.message?.toLocaleLowerCase("es") ?? "";

  if (supabaseError.code === "23505" && message.includes("codigo")) {
    return "Ya existe un lote con ese código interno en el establecimiento.";
  }
  if (supabaseError.code === "23505" && message.includes("nombre")) {
    return "Ya existe un lote con ese nombre en el establecimiento.";
  }
  if (
    supabaseError.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("no tenés permisos")
  ) {
    return "No tenés permisos para modificar lotes en este comercio.";
  }
  if (supabaseError.code === "PGRST116" || message.includes("lote indicado no es válido")) {
    return "El lote no fue encontrado o no está disponible en el establecimiento activo.";
  }
  if (
    supabaseError.code === "23503" ||
    message.includes("establecimiento o comercio indicado no es válido") ||
    message.includes("establecimiento indicado no existe") ||
    message.includes("establecimiento pertenece a otro comercio")
  ) {
    return "El establecimiento no fue encontrado o no está disponible en el comercio activo.";
  }
  if (message.includes("establecimiento está inactivo")) {
    return "No se pueden modificar lotes mientras el establecimiento está inactivo.";
  }
  return "No se pudo actualizar el lote. Revisá los datos e intentá nuevamente.";
}

function assertCampoLoteWriteAccess(
  comercioId: string | null | undefined,
  establecimientoId: string | null | undefined,
  loteId: string,
  hasAccess: boolean,
  isAdmin: boolean,
  establecimientoAutorizado: boolean,
  establecimientoActivo: boolean,
) {
  if (!isCampoUuid(comercioId) || !isCampoUuid(establecimientoId)) {
    throw new Error("El establecimiento o comercio indicado no es válido.");
  }
  if (!isCampoUuid(loteId)) throw new Error("El lote indicado no es válido.");
  if (!hasAccess || !isAdmin || !establecimientoAutorizado) {
    throw new Error("No tenés permisos para modificar lotes en este comercio.");
  }
  if (!establecimientoActivo) throw new Error("El establecimiento está inactivo.");
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

export function useUpdateCampoLote(
  comercioId?: string | null,
  establecimientoId?: string | null,
  hasAccess = false,
  isAdmin = false,
  establecimientoAutorizado = false,
  establecimientoActivo = false,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ loteId, payload: values }: CampoLoteUpdateParams) => {
      assertCampoLoteWriteAccess(
        comercioId,
        establecimientoId,
        loteId,
        hasAccess,
        isAdmin,
        establecimientoAutorizado,
        establecimientoActivo,
      );

      const nombre = values.nombre.trim();
      if (!nombre) throw new Error("El nombre del lote es obligatorio.");
      if (!Number.isFinite(values.superficie_ha) || values.superficie_ha <= 0) {
        throw new Error("La superficie del lote no es válida.");
      }

      const payload: CampoLoteUpdatePayload = {
        nombre,
        codigo_interno: values.codigo_interno,
        superficie_ha: values.superficie_ha,
        observaciones: values.observaciones,
        activo: values.activo,
      };

      const { data, error } = await supabase
        .from("campo_lotes")
        .update(payload)
        .eq("id", loteId)
        .eq("comercio_id", comercioId)
        .eq("establecimiento_id", establecimientoId)
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["campo", comercioId, "lotes", establecimientoId],
      });
      toast({ title: "Lote actualizado", description: "Los cambios se guardaron correctamente." });
    },
    onError: (error) => {
      toast({
        title: "No se pudo actualizar el lote",
        description: campoLoteUpdateErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

export function useSetCampoLoteStatus(
  comercioId?: string | null,
  establecimientoId?: string | null,
  hasAccess = false,
  isAdmin = false,
  establecimientoAutorizado = false,
  establecimientoActivo = false,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ loteId, nuevoEstado }: CampoLoteStatusParams) => {
      assertCampoLoteWriteAccess(
        comercioId,
        establecimientoId,
        loteId,
        hasAccess,
        isAdmin,
        establecimientoAutorizado,
        establecimientoActivo,
      );

      const payload: CampoLoteStatusPayload = { activo: nuevoEstado };
      const { data, error } = await supabase
        .from("campo_lotes")
        .update(payload)
        .eq("id", loteId)
        .eq("comercio_id", comercioId)
        .eq("establecimiento_id", establecimientoId)
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["campo", comercioId, "lotes", establecimientoId],
      });
      toast({
        title: variables.nuevoEstado ? "Lote reactivado" : "Lote desactivado",
        description: variables.nuevoEstado
          ? "El lote volvió a estar activo."
          : "El lote permanece guardado y puede reactivarse.",
      });
    },
    onError: (error) => {
      toast({
        title: "No se pudo cambiar el estado del lote",
        description: campoLoteUpdateErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}
