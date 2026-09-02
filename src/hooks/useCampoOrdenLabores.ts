import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type {
  CampoOrdenDetail,
  CampoOrdenLaborCreateParams,
  CampoOrdenLaborCreatePayload,
  CampoOrdenLaborListItem,
  CampoOrdenLaborUnidad,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

const unidades: CampoOrdenLaborUnidad[] = ["ha", "hora", "km", "tonelada", "unidad", "fijo"];

function createErrorMessage(error: unknown) {
  const safeError = error as { code?: string; message?: string };
  const message = safeError.message?.toLocaleLowerCase("es") ?? "";

  if (safeError.code === "23505" && message.includes("codigo")) return "Ya existe una labor con ese código dentro de la orden.";
  if (safeError.code === "23505" && message.includes("nombre")) return "Ya existe una labor con ese nombre dentro de la orden.";
  if (message.includes("campo_orden_invalida") || message.includes("orden no encontrada o sin acceso")) return "Orden no encontrada o sin acceso.";
  if (message.includes("campo_planificacion_congelada") || message.includes("orden ya no está en borrador")) return "La orden ya no está en borrador y no admite nuevas labores.";
  if (message.includes("campo_establecimiento_inactivo") || message.includes("establecimiento está inactivo")) return "No se pueden agregar labores mientras el establecimiento esté inactivo.";
  if ((safeError.code === "23514" && message.includes("unidad")) || message.includes("unidad seleccionada no es válida")) return "La unidad seleccionada no es válida.";
  if ((safeError.code === "23514" && message.includes("posicion")) || message.includes("posición no es válida")) return "La posición debe ser un entero mayor o igual a cero.";
  if (safeError.code === "PGRST116") return "No se pudo confirmar la creación de la labor.";
  if (safeError.code === "42501" || message.includes("row-level security") || message.includes("permission denied") || message.includes("no tenés permisos")) {
    return "No tenés permisos para crear labores en esta orden.";
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
      await queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId, "labores"] });
      toast({ title: "Labor creada" });
    },
    onError: (error) => {
      toast({ title: "No se pudo crear la labor", description: createErrorMessage(error), variant: "destructive" });
    },
  });
}
