import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CampoOrdenDetail, CampoParte } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";
import { campoCostosKey, campoOtroCostoSchema, type CampoOtroCostoValues } from "@/utils/campoCostos";
import { toast } from "@/hooks/use-toast";
import { invalidateCampoResumenEconomico } from "@/hooks/useCampoResumenEconomico";

export type CampoOtroCosto = Pick<Database["public"]["Tables"]["campo_parte_otros_costos"]["Row"],
  "id" | "concepto" | "cantidad" | "costo_unitario" | "moneda" | "observaciones" | "activo">;
export type CampoOtrosCostosContext = { comercioId: string; ordenId: string; parteId: string; isAdmin: boolean; orden: CampoOrdenDetail; parte: CampoParte };
const key = (x: CampoOtrosCostosContext) => ["campo", x.comercioId, "orden", x.ordenId, "parte", x.parteId, "otros-costos"] as const;
function authorized(x: CampoOtrosCostosContext) {
  return x.isAdmin && [x.comercioId, x.ordenId, x.parteId].every(isCampoUuid) &&
    x.orden.id === x.ordenId && x.parte.id === x.parteId && x.parte.orden_id === x.ordenId;
}
export function campoOtrosCostosEditable(x: CampoOtrosCostosContext) {
  return authorized(x) && x.parte.estado === "borrador" && !["finalizada", "cancelada"].includes(x.orden.estado);
}
export function useCampoParteOtrosCostos(x: CampoOtrosCostosContext) {
  return useQuery({ gcTime: 0, queryKey: key(x), enabled: authorized(x), queryFn: async (): Promise<CampoOtroCosto[]> => {
    if (!authorized(x)) throw new Error("Costos no disponibles.");
    // Esta tabla es exclusivamente administrativa; los snapshots no se consultan.
    const { data, error } = await supabase.from("campo_parte_otros_costos")
      .select("id,concepto,cantidad,costo_unitario,moneda,observaciones,activo")
      .eq("comercio_id", x.comercioId).eq("parte_id", x.parteId).order("created_at").order("id");
    if (error) throw new Error("No se pudieron cargar los otros costos.");
    return data ?? [];
  } });
}
type Cambio = { accion: "crear"; values: CampoOtroCostoValues } |
  { accion: "editar"; id: string; values: CampoOtroCostoValues } |
  { accion: "estado"; id: string; activo: boolean };
export function useGuardarCampoParteOtroCosto(x: CampoOtrosCostosContext) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (v: Cambio) => {
    if (!campoOtrosCostosEditable(x)) throw new Error("No se puede editar este parte.");
    if (v.accion !== "crear" && !isCampoUuid(v.id)) throw new Error("Registro no disponible.");
    if (v.accion === "estado") {
      const { error } = await supabase.from("campo_parte_otros_costos").update({ activo: v.activo })
        .eq("id", v.id).eq("comercio_id", x.comercioId).eq("parte_id", x.parteId).select("id").single();
      if (error) throw new Error("No se pudo cambiar el estado.");
      return;
    }
    const values = campoOtroCostoSchema.parse(v.values);
    const payload = {
      concepto: values.concepto, cantidad: Number(values.cantidad.replace(",", ".")),
      costo_unitario: Number(values.costo_unitario.replace(",", ".")), moneda: values.moneda,
      observaciones: values.observaciones || null, activo: values.activo,
    };
    const result = v.accion === "crear"
      ? await supabase.from("campo_parte_otros_costos").insert({ comercio_id: x.comercioId, parte_id: x.parteId, ...payload }).select("id").single()
      : await supabase.from("campo_parte_otros_costos").update(payload).eq("id", v.id).eq("comercio_id", x.comercioId).eq("parte_id", x.parteId).select("id").single();
    if (result.error) throw new Error("No se pudo guardar el costo.");
  }, onSuccess: async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: key(x), exact: true }),
      qc.invalidateQueries({ queryKey: campoCostosKey(x.comercioId, x.ordenId, x.parteId), exact: true }),
      invalidateCampoResumenEconomico(qc, x.comercioId, x.ordenId),
    ]);
    toast({ title: "Costo actualizado" });
  }, onError: () => toast({ title: "No se pudo guardar", description: "Revisá los datos. Se requiere un parte en borrador, una orden no terminal y permiso de administrador.", variant: "destructive" }) });
}
