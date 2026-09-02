import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type {
  CampoClienteOption,
  CampoEstablecimientoListItem,
  CampoOrdenDetail,
  CampoOrdenUpdateParams,
  CampoOrdenUpdatePayload,
  CampoOrdenStatusParams,
  CampoOrdenStatusPayload,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

function campoOrdenUpdateErrorMessage(error: unknown) {
  const supabaseError = error as { code?: string; message?: string };
  const message = supabaseError.message?.toLocaleLowerCase("es") ?? "";

  if (supabaseError.code === "23505" && message.includes("codigo")) {
    return "Ya existe una orden con ese código interno en el comercio.";
  }
  if (message.includes("campo_cliente_no_coincide_establecimiento") || message.includes("cliente seleccionado no coincide")) {
    return "El cliente seleccionado no coincide con el establecimiento.";
  }
  if (message.includes("campo_establecimiento_inactivo") || message.includes("establecimiento seleccionado está inactivo")) {
    return "El establecimiento seleccionado está inactivo.";
  }
  if (message.includes("campo_cliente_invalido") || message.includes("cliente seleccionado no es válido")) {
    return "El cliente seleccionado no es válido para el comercio activo.";
  }
  if (message.includes("campo_establecimiento_invalido") || message.includes("establecimiento seleccionado no es válido")) {
    return "El establecimiento seleccionado no es válido para el comercio activo.";
  }
  if (message.includes("campo_planificacion_congelada") || message.includes("orden ya no está en borrador")) {
    return "La orden ya no está en borrador y no puede editarse.";
  }
  if (message.includes("orden no encontrada o sin acceso")) {
    return "Orden no encontrada o sin acceso.";
  }
  if (supabaseError.code === "PGRST116") {
    return "La orden no fue encontrada o ya no está en borrador.";
  }
  if (
    supabaseError.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("no tenés permisos")
  ) {
    return "No tenés permisos para editar esta orden.";
  }
  return "No se pudo actualizar la orden. Revisá los datos e intentá nuevamente.";
}

export function useCampoOrdenDetalle(
  comercioId?: string | null,
  ordenId?: string | null,
  hasAccess = false,
) {
  return useQuery({
    queryKey: ["campo", comercioId ?? null, "orden", ordenId ?? null],
    enabled: isCampoUuid(comercioId) && isCampoUuid(ordenId) && hasAccess,
    queryFn: async (): Promise<CampoOrdenDetail | null> => {
      if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !hasAccess) return null;

      const { data, error } = await supabase
        .from("campo_ordenes_trabajo")
        .select(`
          id,
          numero,
          codigo_interno,
          estado,
          cliente_id,
          establecimiento_id,
          fecha_inicio_planificada,
          fecha_fin_planificada,
          descripcion,
          observaciones,
          iniciada_at,
          finalizada_at,
          cancelada_at,
          created_at,
          updated_at,
          cliente:clientes!campo_ordenes_trabajo_cliente_id_fkey(
            nombre,
            apellido
          ),
          establecimiento:campo_establecimientos!campo_ordenes_trabajo_establecimiento_id_fkey(
            nombre,
            activo
          )
        `)
        .eq("id", ordenId)
        .eq("comercio_id", comercioId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateCampoOrden(
  comercioId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  ordenAutorizada: CampoOrdenDetail | null | undefined,
  clientesAutorizados: CampoClienteOption[],
  establecimientosAutorizados: CampoEstablecimientoListItem[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ordenId, payload: values }: CampoOrdenUpdateParams) => {
      if (!isCampoUuid(comercioId) || !hasAccess || !isAdmin) {
        throw new Error("No tenés permisos para editar esta orden.");
      }
      if (!isCampoUuid(ordenId) || !ordenAutorizada || ordenAutorizada.id !== ordenId) {
        throw new Error("Orden no encontrada o sin acceso.");
      }
      if (ordenAutorizada.estado !== "borrador") {
        throw new Error("La orden ya no está en borrador.");
      }
      if (!isCampoUuid(values.cliente_id) || !clientesAutorizados.some((cliente) => cliente.id === values.cliente_id)) {
        throw new Error("El cliente seleccionado no es válido para el comercio activo.");
      }

      const establecimiento = establecimientosAutorizados.find((item) => item.id === values.establecimiento_id);
      if (!isCampoUuid(values.establecimiento_id) || !establecimiento) {
        throw new Error("El establecimiento seleccionado no es válido para el comercio activo.");
      }
      if (!establecimiento.activo) {
        throw new Error("El establecimiento seleccionado está inactivo.");
      }
      if (establecimiento.cliente_id !== values.cliente_id) {
        throw new Error("El cliente seleccionado no coincide con el establecimiento.");
      }

      const payload: CampoOrdenUpdatePayload = {
        cliente_id: values.cliente_id,
        establecimiento_id: values.establecimiento_id,
        codigo_interno: values.codigo_interno,
        fecha_inicio_planificada: values.fecha_inicio_planificada,
        fecha_fin_planificada: values.fecha_fin_planificada,
        descripcion: values.descripcion,
        observaciones: values.observaciones,
      };

      const { data, error } = await supabase
        .from("campo_ordenes_trabajo")
        .update(payload)
        .eq("id", ordenId)
        .eq("comercio_id", comercioId)
        .eq("estado", "borrador")
        .select("id, numero, estado")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "ordenes"] }),
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", variables.ordenId] }),
      ]);
      toast({ title: "Cabecera actualizada", description: "Los cambios de la orden se guardaron correctamente." });
    },
    onError: (error) => {
      toast({ title: "No se pudo actualizar la orden", description: campoOrdenUpdateErrorMessage(error), variant: "destructive" });
    },
  });
}

function campoOrdenStatusErrorMessage(error: unknown) {
  const safeError = error as { code?: string; message?: string };
  const message = safeError.message?.toLocaleLowerCase("es") ?? "";

  if (message.includes("campo_orden_sin_labores_activas")) return "La orden necesita al menos una labor activa.";
  if (message.includes("campo_labor_sin_lotes_activos")) return "Cada labor activa debe tener al menos un lote activo asignado.";
  if (message.includes("campo_asignacion_no_disponible_planificar")) return "Revisá que los lotes estén activos, pertenezcan al establecimiento y tengan cantidades válidas.";
  if (message.includes("campo_establecimiento_no_disponible_planificar")) return "El establecimiento debe estar activo para planificar.";
  if (message.includes("campo_cliente_no_coincide_establecimiento")) return "El cliente de la orden ya no coincide con el establecimiento.";
  if (message.includes("campo_transicion_orden_no_habilitada") || message.includes("campo_planificacion_congelada") || message.includes("estado actual no coincide")) return "La orden cambió de estado. Actualizá la página e intentá nuevamente.";
  if (message.includes("orden no está disponible o su estado cambió")) return "La orden no está disponible o su estado cambió.";
  if (safeError.code === "PGRST116") return "La orden no está disponible o su estado cambió.";
  if (safeError.code === "42501" || message.includes("row-level security") || message.includes("permission denied") || message.includes("no tenés permisos")) return "No tenés permisos para cambiar el estado de esta orden.";
  return "No se pudo cambiar el estado de la orden. Intentá nuevamente.";
}

export function useSetCampoOrdenStatus(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ estadoActual, nuevoEstado }: CampoOrdenStatusParams) => {
      if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !hasAccess || !isAdmin) throw new Error("No tenés permisos para cambiar el estado de esta orden.");
      if (!orden || orden.id !== ordenId) throw new Error("La orden no está disponible o su estado cambió.");
      if (orden.estado !== estadoActual) throw new Error("El estado actual no coincide.");
      const transitionAllowed = (estadoActual === "borrador" && nuevoEstado === "planificada") || (estadoActual === "planificada" && nuevoEstado === "borrador");
      if (!transitionAllowed) throw new Error("campo_transicion_orden_no_habilitada");
      if (nuevoEstado === "planificada" && orden.establecimiento?.activo !== true) throw new Error("campo_establecimiento_no_disponible_planificar");

      const payload: CampoOrdenStatusPayload = { estado: nuevoEstado };
      const { data, error } = await supabase
        .from("campo_ordenes_trabajo")
        .update(payload)
        .eq("id", ordenId)
        .eq("comercio_id", comercioId)
        .eq("estado", estadoActual)
        .select("id, numero, estado")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "ordenes"] }),
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId] }),
      ]);
      toast({ title: data.estado === "planificada" ? `Orden N.º ${data.numero} planificada` : `Orden N.º ${data.numero} reabierta como borrador` });
    },
    onError: (error) => toast({ title: "No se pudo cambiar el estado", description: campoOrdenStatusErrorMessage(error), variant: "destructive" }),
  });
}
