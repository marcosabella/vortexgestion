import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type {
  CampoLoteListItem,
  CampoOrdenDetail,
  CampoOrdenLaborListItem,
  CampoOrdenLaborLoteCreateParams,
  CampoOrdenLaborLoteCreatePayload,
  CampoOrdenLaborLoteListItem,
  CampoOrdenLaborLoteStatusParams,
  CampoOrdenLaborLoteStatusPayload,
  CampoOrdenLaborLoteUpdateParams,
  CampoOrdenLaborLoteUpdatePayload,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

function assignmentErrorMessage(error: unknown) {
  const safeError = error as { code?: string; message?: string };
  const message = safeError.message?.toLocaleLowerCase("es") ?? "";

  if (safeError.code === "23505" || message.includes("lote ya está asignado")) return "El lote ya está asignado a esta labor.";
  if (message.includes("campo_cantidad_fijo_debe_ser_uno")) return "Para una labor fija, la cantidad planificada debe ser exactamente 1.";
  if (safeError.code === "23514" || message.includes("cantidad planificada no es válida")) return "La cantidad planificada debe ser un número mayor que cero.";
  if (message.includes("campo_planificacion_congelada") || message.includes("orden ya no está en borrador")) return "La orden ya no está en borrador y no admite nuevas asignaciones.";
  if (message.includes("orden no encontrada o sin acceso")) return "Orden no encontrada o sin acceso.";
  if (message.includes("campo_labor_inactiva") || message.includes("labor está inactiva")) return "No se pueden asignar lotes a una labor inactiva.";
  if (message.includes("campo_labor_invalida") || message.includes("labor no pertenece")) return "La labor no fue encontrada o no pertenece a la orden autorizada.";
  if (message.includes("campo_lote_fuera_establecimiento")) return "El lote no pertenece al establecimiento de la orden.";
  if (message.includes("campo_lote_inactivo") || message.includes("lote está inactivo")) return "El lote seleccionado está inactivo.";
  if (message.includes("campo_lote_invalido") || message.includes("lote no está disponible")) return "El lote no fue encontrado o no está disponible para esta orden.";
  if (message.includes("asignación no encontrada o sin acceso")) return "Asignación no encontrada o sin acceso.";
  if (message.includes("campo_establecimiento_inactivo") || message.includes("establecimiento está inactivo")) return "No se pueden asignar lotes mientras el establecimiento esté inactivo.";
  if (safeError.code === "PGRST116") return "No se pudo confirmar la asignación del lote.";
  if (safeError.code === "42501" || message.includes("row-level security") || message.includes("permission denied") || message.includes("no tenés permisos")) {
    return "No tenés permisos para modificar asignaciones de esta labor.";
  }
  return "No se pudo asignar el lote. Revisá los datos e intentá nuevamente.";
}

export function useCampoOrdenLaborLotes(
  comercioId?: string | null,
  ordenId?: string | null,
  laborId?: string | null,
  hasAccess = false,
  ordenAutorizada?: CampoOrdenDetail | null,
  laborAutorizada?: CampoOrdenLaborListItem | null,
) {
  const authorized = Boolean(
    ordenAutorizada?.id === ordenId &&
    laborAutorizada?.id === laborId &&
    laborAutorizada?.orden_id === ordenId,
  );

  return useQuery({
    queryKey: ["campo", comercioId ?? null, "orden", ordenId ?? null, "labor", laborId ?? null, "lotes"],
    enabled: isCampoUuid(comercioId) && isCampoUuid(ordenId) && isCampoUuid(laborId) && hasAccess && authorized,
    queryFn: async (): Promise<CampoOrdenLaborLoteListItem[]> => {
      if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !isCampoUuid(laborId) || !hasAccess || !authorized) return [];

      const { data, error } = await supabase
        .from("campo_orden_labor_lotes")
        .select(`
          id,
          orden_labor_id,
          lote_id,
          cantidad_planificada,
          observaciones,
          activo,
          created_at,
          updated_at,
          lote:campo_lotes!campo_orden_labor_lotes_lote_id_fkey(
            nombre,
            codigo_interno,
            superficie_ha,
            activo,
            establecimiento_id
          )
        `)
        .eq("comercio_id", comercioId)
        .eq("orden_labor_id", laborId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCampoOrdenLaborLote(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  ordenAutorizada: CampoOrdenDetail | null | undefined,
  laborAutorizada: CampoOrdenLaborListItem | null | undefined,
  lotesAutorizados: CampoLoteListItem[],
  asignacionesAutorizadas: CampoOrdenLaborLoteListItem[],
) {
  const queryClient = useQueryClient();
  const laborId = laborAutorizada?.id;

  return useMutation({
    mutationFn: async (values: CampoOrdenLaborLoteCreateParams) => {
      if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !isCampoUuid(laborId) || !isCampoUuid(values.lote_id) || !hasAccess || !isAdmin) {
        throw new Error("No tenés permisos para asignar lotes a esta labor.");
      }
      if (!ordenAutorizada || ordenAutorizada.id !== ordenId) throw new Error("Orden no encontrada o sin acceso.");
      if (ordenAutorizada.estado !== "borrador") throw new Error("La orden ya no está en borrador.");
      if (ordenAutorizada.establecimiento?.activo !== true) throw new Error("El establecimiento está inactivo.");
      if (!laborAutorizada || laborAutorizada.orden_id !== ordenId) throw new Error("La labor no pertenece a la orden autorizada.");
      if (!laborAutorizada.activo) throw new Error("La labor está inactiva.");

      const lote = lotesAutorizados.find((item) => item.id === values.lote_id);
      if (!lote) throw new Error("El lote no está disponible para esta orden.");
      if (!lote.activo) throw new Error("El lote está inactivo.");
      if (asignacionesAutorizadas.some((item) => item.lote_id === lote.id)) throw new Error("El lote ya está asignado a esta labor.");
      if (!Number.isFinite(values.cantidad_planificada) || values.cantidad_planificada <= 0) throw new Error("La cantidad planificada no es válida.");
      if (laborAutorizada.unidad === "fijo" && values.cantidad_planificada !== 1) throw new Error("campo_cantidad_fijo_debe_ser_uno");

      const payload: CampoOrdenLaborLoteCreatePayload = {
        comercio_id: comercioId,
        orden_labor_id: laborId,
        lote_id: lote.id,
        cantidad_planificada: values.cantidad_planificada,
        observaciones: values.observaciones?.trim() || null,
      };

      const { data, error } = await supabase
        .from("campo_orden_labor_lotes")
        .insert(payload)
        .select(`
          id,
          orden_labor_id,
          lote_id,
          cantidad_planificada,
          observaciones,
          activo
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "labor", laborId, "lotes"] });
      toast({ title: "Lote asignado" });
    },
    onError: (error) => {
      toast({ title: "No se pudo asignar el lote", description: assignmentErrorMessage(error), variant: "destructive" });
    },
  });
}

function assertAssignmentWrite(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null | undefined,
  labor: CampoOrdenLaborListItem | null | undefined,
  assignment: CampoOrdenLaborLoteListItem | null | undefined,
  asignacionId: string,
  loteId: string,
) {
  if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !isCampoUuid(labor?.id) || !isCampoUuid(asignacionId) || !isCampoUuid(loteId) || !hasAccess || !isAdmin) throw new Error("No tenés permisos para modificar esta asignación.");
  if (!orden || orden.id !== ordenId) throw new Error("Orden no encontrada o sin acceso.");
  if (orden.estado !== "borrador") throw new Error("La orden ya no está en borrador.");
  if (orden.establecimiento?.activo !== true) throw new Error("El establecimiento está inactivo.");
  if (!labor || labor.orden_id !== ordenId) throw new Error("campo_labor_invalida");
  if (!assignment || assignment.id !== asignacionId || assignment.orden_labor_id !== labor.id || assignment.lote_id !== loteId) throw new Error("Asignación no encontrada o sin acceso.");
}

export function useUpdateCampoOrdenLaborLote(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null | undefined,
  labor: CampoOrdenLaborListItem | null | undefined,
  assignment: CampoOrdenLaborLoteListItem | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ asignacionId, loteId, payload: values }: CampoOrdenLaborLoteUpdateParams) => {
      assertAssignmentWrite(comercioId, ordenId, hasAccess, isAdmin, orden, labor, assignment, asignacionId, loteId);
      if (!labor?.activo) throw new Error("La labor está inactiva.");
      if (!Number.isFinite(values.cantidad_planificada) || values.cantidad_planificada <= 0) throw new Error("La cantidad planificada no es válida.");
      if (labor.unidad === "fijo" && values.cantidad_planificada !== 1) throw new Error("campo_cantidad_fijo_debe_ser_uno");
      const payload: CampoOrdenLaborLoteUpdatePayload = {
        cantidad_planificada: values.cantidad_planificada,
        observaciones: values.observaciones?.trim() || null,
      };
      const { data, error } = await supabase.from("campo_orden_labor_lotes").update(payload)
        .eq("id", asignacionId).eq("comercio_id", comercioId).eq("orden_labor_id", labor.id).eq("lote_id", loteId)
        .select("id, cantidad_planificada, activo").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "labor", labor?.id, "lotes"] });
      toast({ title: "Asignación actualizada" });
    },
    onError: (error) => toast({ title: "No se pudo actualizar la asignación", description: assignmentErrorMessage(error), variant: "destructive" }),
  });
}

export function useSetCampoOrdenLaborLoteStatus(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null | undefined,
  labor: CampoOrdenLaborListItem | null | undefined,
  assignment: CampoOrdenLaborLoteListItem | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ asignacionId, loteId, nuevoEstado }: CampoOrdenLaborLoteStatusParams) => {
      assertAssignmentWrite(comercioId, ordenId, hasAccess, isAdmin, orden, labor, assignment, asignacionId, loteId);
      if (nuevoEstado && !labor?.activo) throw new Error("La labor está inactiva.");
      if (nuevoEstado && assignment?.lote?.activo !== true) throw new Error("El lote está inactivo.");
      const payload: CampoOrdenLaborLoteStatusPayload = { activo: nuevoEstado };
      const { data, error } = await supabase.from("campo_orden_labor_lotes").update(payload)
        .eq("id", asignacionId).eq("comercio_id", comercioId).eq("orden_labor_id", labor?.id).eq("lote_id", loteId)
        .select("id, activo").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "labor", labor?.id, "lotes"] });
      toast({ title: variables.nuevoEstado ? "Asignación reactivada" : "Asignación desactivada" });
    },
    onError: (error) => toast({ title: "No se pudo cambiar el estado de la asignación", description: assignmentErrorMessage(error), variant: "destructive" }),
  });
}
