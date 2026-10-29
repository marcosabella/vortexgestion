import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type EstadoConsulta = "nueva" | "contactada" | "archivada";
export type ConsultaLanding = {
  id: string; comercio_id: string | null; nombre: string; negocio: string;
  email: string; telefono: string; mensaje: string; estado: EstadoConsulta;
  creado_en: string; actualizado_en: string;
};
type EnvioConsulta = { p_id: string; p_nombre: string; p_negocio: string; p_email: string; p_telefono: string; p_mensaje: string; p_honey: string };
type ConsultasSchema = {
  public: {
    Tables: { consultas_landing: { Row: ConsultaLanding; Insert: never; Update: never; Relationships: [] } };
    Views: Record<string, never>;
    Functions: {
      enviar_consulta_landing: { Args: EnvioConsulta; Returns: undefined };
      admin_estado_consulta_landing: { Args: { p_id: string; p_estado: EstadoConsulta }; Returns: undefined };
    };
    Enums: Record<string, never>; CompositeTypes: Record<string, never>;
  };
};
const api = supabase as unknown as SupabaseClient<ConsultasSchema>;

export function useEnviarConsultaLanding() {
  return useMutation({
    mutationFn: async (payload: EnvioConsulta) => {
      const { error } = await api.rpc("enviar_consulta_landing", payload).abortSignal(AbortSignal.timeout(20000));
      if (error) throw new Error(error.code === "P0001" ? "Se alcanzó el límite de envíos. Intentá más tarde." : "No pudimos enviar tu consulta. Revisá los datos e intentá nuevamente, o escribinos por correo.");
    },
  });
}

export function useConsultasLanding(estado: EstadoConsulta | "todas", pagina: number) {
  const client = useQueryClient();
  const listado = useQuery({
    queryKey: ["consultas-landing", estado, pagina],
    queryFn: async () => {
      let query = api.from("consultas_landing").select("*", { count: "exact" });
      if (estado !== "todas") query = query.eq("estado", estado);
      const { data, count, error } = await query.order("creado_en", { ascending: false }).order("id").range(pagina * 20, pagina * 20 + 19);
      if (error) throw error;
      return { consultas: data, total: count || 0 };
    },
    refetchInterval: 60000,
  });
  const nuevas = useQuery({
    queryKey: ["consultas-landing", "cantidad-nuevas"],
    queryFn: async () => {
      const { count, error } = await api.from("consultas_landing").select("id", { count: "exact", head: true }).eq("estado", "nueva");
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 60000,
  });
  const actualizar = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoConsulta }) => {
      const { error } = await api.rpc("admin_estado_consulta_landing", { p_id: id, p_estado: estado });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["consultas-landing"] }),
  });
  return { listado, nuevas, actualizar };
}
