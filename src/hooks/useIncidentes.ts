import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Incidente, IncidenteEstado } from "@/types/incidente";
import { fetchMasterRecords } from "@/utils/fetchMasterRecords";

// Esquema acotado de la migración pendiente, sin modificar los tipos generados.
type IncidentesSchema = {
  public: {
    Tables: { sistema_incidentes: {
      Row: Omit<Incidente, "comercio">;
      Insert: never;
      Update: never;
      Relationships: [{ foreignKeyName: "sistema_incidentes_comercio_id_fkey"; columns: ["comercio_id"]; isOneToOne: false; referencedRelation: "comercio"; referencedColumns: ["id"] }];
    }; comercio: { Row: { id: string; nombre_comercio: string }; Insert: never; Update: never; Relationships: [] } };
    Views: Record<string, never>;
    Functions: { admin_actualizar_incidente: { Args: { p_id: string; p_estado: string; p_notas: string }; Returns: undefined } };
  };
};
const api = supabase as unknown as SupabaseClient<IncidentesSchema>;
export const INCIDENTES_POR_PAGINA = 50;

export type IncidentesFiltros = {
  comercioId: string;
  modulo: string;
  estado: IncidenteEstado | "";
  desde: string;
  hasta: string;
  pagina: number;
};

export function rangoFechasIncidentes(desde: string, hasta: string) {
  const inicio = desde ? `${desde}T00:00:00-03:00` : undefined;
  const fin = hasta ? new Date(`${hasta}T00:00:00-03:00`) : undefined;
  if (fin) fin.setUTCDate(fin.getUTCDate() + 1);
  return { inicio, fin: fin?.toISOString() };
}

export function useIncidentes(filtros: IncidentesFiltros, isAdmin: boolean) {
  const client = useQueryClient();
  const comercios = useQuery({
    queryKey: ["admin-incidentes-comercios"],
    enabled: isAdmin,
    queryFn: () => fetchMasterRecords<{ id: string; nombre_comercio: string }>((from, to) => supabase
      .from("comercio").select("id, nombre_comercio", { count: "exact" })
      .order("nombre_comercio").order("id").range(from, to)),
  });
  const listado = useQuery({
    queryKey: ["admin-incidentes", filtros],
    enabled: isAdmin && (!filtros.desde || !filtros.hasta || filtros.desde <= filtros.hasta),
    retry: false,
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isAdmin) throw new Error("Acceso no autorizado");
      let query = api.from("sistema_incidentes")
        .select("*, comercio(nombre_comercio)", { count: "exact" });
      if (filtros.comercioId) query = query.eq("comercio_id", filtros.comercioId);
      if (filtros.modulo) query = query.eq("modulo", filtros.modulo);
      if (filtros.estado) query = query.eq("estado", filtros.estado);
      const { inicio, fin } = rangoFechasIncidentes(filtros.desde, filtros.hasta);
      if (inicio) query = query.gte("creado_en", inicio);
      if (fin) query = query.lt("creado_en", fin);
      const desde = filtros.pagina * INCIDENTES_POR_PAGINA;
      const { data, error, count } = await query.order("creado_en", { ascending: false })
        .order("id", { ascending: false }).range(desde, desde + INCIDENTES_POR_PAGINA - 1);
      if (error) throw error;
      return { incidentes: data as Incidente[], total: count ?? 0 };
    },
  });
  const actualizar = useMutation({
    mutationFn: async ({ id, estado, notas }: { id: string; estado: IncidenteEstado; notas: string }) => {
      if (!isAdmin) throw new Error("Acceso no autorizado");
      const { error } = await api.rpc("admin_actualizar_incidente", { p_id: id, p_estado: estado, p_notas: notas });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-incidentes"] }),
  });
  return { listado, actualizar, comercios };
}
