import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { esVistaPreviaReferidos } from "@/utils/referidos";
import type { ProgramaReferidos, Referido } from "@/types/referidos";

export const referidosApi = supabase as SupabaseClient;
export const vistaPreviaReferidos = typeof window !== "undefined" && esVistaPreviaReferidos(window.location.hostname);
export const programaDemo: ProgramaReferidos = {
  campana_id: "vortex-referidos-2026", titulo: "Recomendá Vortex y ganá un mes", codigo: "VX-DE0000000000",
  modal_visto_at: null, notificacion_leida_at: null, pendientes: 0, meses_bonificados: 0,
};
export function useProgramaReferidos() {
  const { comercio } = useComercio();
  return useQuery({
    queryKey: ["programa-referidos", comercio?.id, vistaPreviaReferidos], enabled: Boolean(comercio?.id),
    staleTime: 60000, retry: false,
    queryFn: async (): Promise<ProgramaReferidos | null> => {
      if (vistaPreviaReferidos) return programaDemo;
      const { data, error } = await referidosApi.rpc("mi_programa_referidos", { p_comercio_id: comercio!.id });
      if (error) throw error;
      return data as ProgramaReferidos | null;
    },
  });
}
export function useLeerCampanaReferidos() {
  const { comercio } = useComercio();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (campana: string) => {
      if (!comercio?.id) throw new Error("Seleccioná un comercio");
      if (!vistaPreviaReferidos) {
        const { error } = await referidosApi.rpc("leer_notificacion_referidos", { p_comercio_id: comercio.id, p_campana_id: campana });
        if (error) throw error;
      }
      return comercio.id;
    },
    onSuccess: (id) => client.setQueryData<ProgramaReferidos | null>(["programa-referidos", id, vistaPreviaReferidos], data => data ? { ...data, notificacion_leida_at: new Date().toISOString() } : data),
  });
}
export function useAdminReferidos(pagina: number, enabled: boolean) {
  const client = useQueryClient();
  const listado = useQuery({
    queryKey: ["admin-referidos", pagina], enabled,
    queryFn: async () => {
      if (vistaPreviaReferidos) return { items: [] as Referido[], total: 0 };
      const { data, error, count } = await referidosApi.from("referidos_registros")
        .select("*,consulta:consultas_landing(nombre,negocio,email,telefono),participacion:referidos_participaciones(codigo,comercio:comercio(nombre_comercio))", { count: "exact" })
        .order("creado_en", { ascending: false }).order("id").range(pagina * 20, pagina * 20 + 19);
      if (error) throw error;
      return { items: data as unknown as Referido[], total: count || 0 };
    },
  });
  const gestionar = useMutation({
    mutationFn: async (payload: { p_id: string; p_accion: string; p_nuevo_comercio_id?: string; p_evidencia?: string }) => {
      if (vistaPreviaReferidos) throw new Error("La vista previa local no aplica bonificaciones reales");
      const { error } = await referidosApi.rpc("admin_gestionar_referido", payload);
      if (error) throw new Error(error.code === "23505" ? "Este comercio o CUIT ya tiene una recomendación premiada o con el pago confirmado." : error.message);
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["admin-referidos"] }), client.invalidateQueries({ queryKey: ["programa-referidos"] }), client.invalidateQueries({ queryKey: ["admin-comercios"] }), client.invalidateQueries({ queryKey: ["comercio"] }), client.invalidateQueries({ queryKey: ["notificaciones"] })]);
    },
  });
  return { listado, gestionar };
}
