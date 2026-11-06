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
    // La campaña puede activarse mientras el comercio mantiene su sesión abierta.
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    queryFn: async (): Promise<ProgramaReferidos | null> => {
      if (vistaPreviaReferidos) return programaDemo;
      const { data, error } = await referidosApi.rpc("mi_programa_referidos", { p_comercio_id: comercio!.id });
      if (error) throw error;
      return data as ProgramaReferidos | null;
    },
  });
}
export interface ParticipacionCampana {
  comercio_id: string;
  modal_visto_at: string | null;
  notificacion_leida_at: string | null;
}
export function useAdminCampanaReferidos(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-campana-referidos"], enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data: campana, error } = await referidosApi.from("referidos_campanas")
        .select("*").eq("activa", true).maybeSingle();
      if (error) throw error;
      if (!campana || campana.aviso_estado === "eliminado") return null;
      const participaciones: ParticipacionCampana[] = [];
      // Leer todas las páginas para no truncar el estado a 1000 comercios.
      for (let desde = 0; ; desde += 500) {
        const { data, error: participacionesError } = await referidosApi.from("referidos_participaciones")
          .select("comercio_id,modal_visto_at,notificacion_leida_at")
          .eq("campana_id", campana.id).order("comercio_id").range(desde, desde + 499);
        if (participacionesError) throw participacionesError;
        participaciones.push(...(data as ParticipacionCampana[]));
        if (data.length < 500) break;
      }
      return { ...campana, participaciones } as { id: string; titulo: string; aviso_estado?: "activo" | "archivado" | "eliminado"; creada_en?: string; mensaje?: string | null; condiciones?: string | null; participaciones: ParticipacionCampana[] };
    },
  });
}
export function useEditarCampanaReferidos() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { p_id: string; p_titulo: string; p_mensaje: string; p_condiciones: string }) => {
      const { error } = await referidosApi.rpc("admin_editar_campana_referidos", payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["admin-campana-referidos"] }), client.invalidateQueries({ queryKey: ["programa-referidos"] })]);
    },
  });
}
export function useEstadoAvisoReferidos() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { p_id: string; p_accion: "archivar" | "restaurar" | "eliminar" }) => {
      const { error } = await referidosApi.rpc("admin_estado_aviso_referidos", payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["admin-campana-referidos"] }), client.invalidateQueries({ queryKey: ["programa-referidos"] })]);
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
