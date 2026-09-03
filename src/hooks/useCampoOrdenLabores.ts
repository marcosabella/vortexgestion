import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type {
  CampoOrdenDetail,
  CampoOrdenLaborCreateParams,
  CampoOrdenLaborCreatePayload,
  CampoOrdenLaborListItem,
  CampoOrdenLaborLoteListItem,
  CampoOrdenLaborStatusParams,
  CampoOrdenLaborStatusPayload,
  CampoOrdenLaborUpdateParams,
  CampoOrdenLaborUpdatePayload,
  CampoOrdenLaborUnidad,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

const unidades: CampoOrdenLaborUnidad[] = ["ha", "hora", "km", "tonelada", "unidad", "fijo"];

function laborErrorMessage(error: unknown) {
  const safeError = error as { code?: string; message?: string };
  const message = safeError.message?.toLocaleLowerCase("es") ?? "";

  if (safeError.code === "23505" && message.includes("codigo")) return "Ya existe una labor con ese código dentro de la orden.";
  if (safeError.code === "23505" && message.includes("nombre")) return "Ya existe una labor con ese nombre dentro de la orden.";
  if (message.includes("campo_orden_invalida") || message.includes("orden no encontrada o sin acceso")) return "Orden no encontrada o sin acceso.";
  if (message.includes("campo_labor_invalida")) return "La labor no fue encontrada o no pertenece a la orden autorizada.";
  if (message.includes("campo_planificacion_congelada") || message.includes("orden ya no está en borrador")) return "La orden ya no está en borrador y no admite nuevas labores.";
  if (message.includes("campo_establecimiento_inactivo") || message.includes("establecimiento está inactivo")) return "No se pueden agregar labores mientras el establecimiento esté inactivo.";
  if ((safeError.code === "23514" && message.includes("unidad")) || message.includes("unidad seleccionada no es válida")) return "La unidad seleccionada no es válida.";
  if ((safeError.code === "23514" && message.includes("posicion")) || message.includes("posición no es válida")) return "La posición debe ser un entero mayor o igual a cero.";
  if (message.includes("campo_cantidad_fijo_debe_ser_uno") || message.includes("todas las asignaciones deben tener cantidad 1")) return "Para usar Fijo por lote, todas las asignaciones deben tener cantidad 1.";
  if (safeError.code === "PGRST116") return "No se pudo confirmar la creación de la labor.";
  if (safeError.code === "42501" || message.includes("row-level security") || message.includes("permission denied") || message.includes("no tenés permisos")) {
    return "No tenés permisos para modificar labores en esta orden.";
  }
  return "No se pudo crear la labor. Revisá los datos e intentá nuevamente.";
}

export function useCampoOrdenLabores(
  comercioId?: string | null,
  ordenId?: string | null,
  hasAccess = false,
  ordenAutorizada?: CampoOrdenDetail | null,
) {
  const authorized = Boolean(ordenAutorizada && ordenAutorizada.id === ordenId);

  return useQuery({
    queryKey: ["campo", comercioId ?? null, "orden", ordenId ?? null, "labores"],
    enabled: isCampoUuid(comercioId) && isCampoUuid(ordenId) && hasAccess && authorized,
    queryFn: async (): Promise<CampoOrdenLaborListItem[]> => {
      if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !hasAccess || !authorized) return [];

      const { data, error } = await supabase
        .from("campo_orden_labores")
        .select(`
          id,
          orden_id,
          nombre,
          codigo_interno,
          descripcion,
          unidad,
          posicion,
          activo,
          created_at,
          updated_at
        `)
        .eq("comercio_id", comercioId)
        .eq("orden_id", ordenId)
        .order("posicion", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCampoOrdenLabor(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  ordenAutorizada: CampoOrdenDetail | null | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CampoOrdenLaborCreateParams) => {
      if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !hasAccess || !isAdmin) {
        throw new Error("No tenés permisos para crear labores en esta orden.");
      }
      if (!ordenAutorizada || ordenAutorizada.id !== ordenId) throw new Error("Orden no encontrada o sin acceso.");
      if (ordenAutorizada.estado !== "borrador") throw new Error("La orden ya no está en borrador.");
      if (ordenAutorizada.establecimiento?.activo !== true) throw new Error("El establecimiento está inactivo.");
      const nombre = values.nombre.trim();
      if (!nombre) throw new Error("El nombre de la labor es obligatorio.");
      if (!unidades.includes(values.unidad as CampoOrdenLaborUnidad)) throw new Error("La unidad seleccionada no es válida.");
      if (!Number.isSafeInteger(values.posicion) || values.posicion < 0) throw new Error("La posición no es válida.");

      const payload: CampoOrdenLaborCreatePayload = {
        comercio_id: comercioId,
        orden_id: ordenId,
        nombre,
        codigo_interno: values.codigo_interno?.trim() || null,
        descripcion: values.descripcion?.trim() || null,
        unidad: values.unidad,
        posicion: values.posicion,
      };

      const { data, error } = await supabase
        .from("campo_orden_labores")
        .insert(payload)
        .select(`
          id,
          nombre,
          codigo_interno,
          descripcion,
          unidad,
          posicion,
          activo
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "labores"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "avance"], exact: true }),
      ]);
      toast({ title: "Labor creada" });
    },
    onError: (error) => {
      toast({ title: "No se pudo crear la labor", description: laborErrorMessage(error), variant: "destructive" });
    },
  });
}

function assertLaborWrite(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  laborId: string,
  hasAccess: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null | undefined,
  labor: CampoOrdenLaborListItem | null | undefined,
) {
  if (!isCampoUuid(comercioId) || !isCampoUuid(ordenId) || !isCampoUuid(laborId) || !hasAccess || !isAdmin) throw new Error("No tenés permisos para modificar esta labor.");
  if (!orden || orden.id !== ordenId) throw new Error("Orden no encontrada o sin acceso.");
  if (orden.estado !== "borrador") throw new Error("La orden ya no está en borrador.");
  if (orden.establecimiento?.activo !== true) throw new Error("El establecimiento está inactivo.");
  if (!labor || labor.id !== laborId || labor.orden_id !== ordenId) throw new Error("campo_labor_invalida");
}

export function useUpdateCampoOrdenLabor(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null | undefined,
  labor: CampoOrdenLaborListItem | null | undefined,
  asignaciones: CampoOrdenLaborLoteListItem[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ laborId, payload: values }: CampoOrdenLaborUpdateParams) => {
      assertLaborWrite(comercioId, ordenId, laborId, hasAccess, isAdmin, orden, labor);
      if (values.unidad === "fijo" && labor?.unidad !== "fijo" && asignaciones.some((item) => item.cantidad_planificada !== 1)) {
        throw new Error("Para usar Fijo por lote, todas las asignaciones deben tener cantidad 1.");
      }
      const payload: CampoOrdenLaborUpdatePayload = {
        nombre: values.nombre.trim(),
        codigo_interno: values.codigo_interno?.trim() || null,
        descripcion: values.descripcion?.trim() || null,
        unidad: values.unidad,
        posicion: values.posicion,
      };
      if (!payload.nombre || !unidades.includes(payload.unidad as CampoOrdenLaborUnidad) || !Number.isSafeInteger(payload.posicion) || payload.posicion < 0) throw new Error("Los datos de la labor no son válidos.");

      const { data, error } = await supabase.from("campo_orden_labores").update(payload)
        .eq("id", laborId).eq("comercio_id", comercioId).eq("orden_id", ordenId)
        .select("id, unidad, activo").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "labores"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "avance"], exact: true }),
      ]);
      toast({ title: "Labor actualizada" });
    },
    onError: (error) => toast({ title: "No se pudo actualizar la labor", description: laborErrorMessage(error), variant: "destructive" }),
  });
}

export function useSetCampoOrdenLaborStatus(
  comercioId: string | null | undefined,
  ordenId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null | undefined,
  labor: CampoOrdenLaborListItem | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ laborId, nuevoEstado }: CampoOrdenLaborStatusParams) => {
      assertLaborWrite(comercioId, ordenId, laborId, hasAccess, isAdmin, orden, labor);
      const payload: CampoOrdenLaborStatusPayload = { activo: nuevoEstado };
      const { data, error } = await supabase.from("campo_orden_labores").update(payload)
        .eq("id", laborId).eq("comercio_id", comercioId).eq("orden_id", ordenId)
        .select("id, activo").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "labores"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "avance"], exact: true }),
      ]);
      toast({ title: variables.nuevoEstado ? "Labor reactivada" : "Labor desactivada" });
    },
    onError: (error) => toast({ title: "No se pudo cambiar el estado de la labor", description: laborErrorMessage(error), variant: "destructive" }),
  });
}
