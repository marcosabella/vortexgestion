import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ApicolaApiario, ApicolaCampana, ApicolaCatalogos, ApicolaColmena, ApicolaExistencia, ApicolaFila, ApicolaFiltro, ApicolaInforme } from "@/types/apicola";

const api = supabase as SupabaseClient;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function useApicolaAcceso(comercioId?: string) {
  return useQuery({ queryKey: ["apicola", comercioId, "acceso"], enabled: Boolean(comercioId), retry: false, queryFn: async () => {
    const [lectura, admin, operar] = await Promise.all(["lectura", "admin", "operar"].map(p_nivel => api.rpc("apicola_permiso", { p_comercio: comercioId, p_nivel })));
    if (lectura.error || admin.error || operar.error) throw lectura.error || admin.error || operar.error;
    return { lectura: Boolean(lectura.data), admin: Boolean(admin.data), operar: Boolean(operar.data) };
  } });
}
async function catalogo<T>(tabla: string, comercioId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await api.from(tabla).select("*").eq("comercio_id", comercioId).order("id").range(from, from + 499);
    if (error) throw error;
    rows.push(...data as T[]);
    if (data.length < 500) break;
  }
  return rows;
}
export function useApicolaCatalogos(comercioId?: string, enabled = false) {
  return useQuery({ queryKey: ["apicola", comercioId, "catalogos"], enabled: Boolean(comercioId && enabled), queryFn: async (): Promise<ApicolaCatalogos> => {
    const [campanas, apiarios, colmenas, existencias] = await Promise.all([
      catalogo<ApicolaCampana>("apicola_campanas", comercioId!), catalogo<ApicolaApiario>("apicola_apiarios", comercioId!),
      catalogo<ApicolaColmena>("apicola_colmenas", comercioId!),
      // Esta tabla tiene clave compuesta; se pagina con un orden determinista propio.
      (async () => { const rows: ApicolaExistencia[] = []; for (let from = 0; ; from += 500) {
        const { data, error } = await api.from("apicola_existencias").select("*").eq("comercio_id", comercioId!).order("apiario_id").order("recurso").range(from, from + 499);
        if (error) throw error; rows.push(...data); if (data.length < 500) return rows;
      } })(),
    ]);
    return { campanas: campanas.sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)), apiarios: apiarios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), colmenas: colmenas.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })), existencias };
  } });
}
export function useApicolaListado(comercioId: string | undefined, tabla: string, filtro: ApicolaFiltro, pagina: number, enabled: boolean, tipo?: string, colmenaId?: string) {
  return useQuery({ queryKey: ["apicola", comercioId, tabla, filtro, pagina, tipo, colmenaId], enabled: Boolean(comercioId && enabled), queryFn: async () => {
    let query = api.from(tabla).select("*", { count: "exact" }).eq("comercio_id", comercioId!);
    if (filtro.campana && uuid(filtro.campana)) query = query.eq("campana_id", filtro.campana);
    if (filtro.apiario && uuid(filtro.apiario)) query = tabla === "apicola_movimientos" ? query.or(`origen_apiario_id.eq.${filtro.apiario},destino_apiario_id.eq.${filtro.apiario}`) : query.eq("apiario_id", filtro.apiario);
    if (filtro.desde) query = query.gte("fecha", filtro.desde);
    if (filtro.hasta) query = query.lte("fecha", filtro.hasta);
    if (tipo) query = query.eq("tipo", tipo);
    if (colmenaId && uuid(colmenaId)) query = query.contains("colmena_ids", [colmenaId]);
    const { data, error, count } = await query.order("fecha", { ascending: tabla === "apicola_tareas" }).order("id").range(pagina * 30, pagina * 30 + 29);
    if (error) throw error;
    return { items: data as ApicolaFila[], total: count || 0 };
  } });
}
export function useApicolaInforme(comercioId: string | undefined, filtro: ApicolaFiltro, enabled: boolean) {
  return useQuery({ queryKey: ["apicola", comercioId, "informe", filtro], enabled: Boolean(comercioId && enabled), queryFn: async () => {
    const { data, error } = await api.rpc("apicola_informe", { p_comercio: comercioId, p_campana: filtro.campana || null, p_apiario: filtro.apiario || null, p_desde: filtro.desde || null, p_hasta: filtro.hasta || null });
    if (error) throw error;
    return data as ApicolaInforme;
  } });
}
export function useApicolaOperar(comercioId?: string) {
  const client = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: async ({ accion, datos, clave }: { accion: string; datos: Record<string, unknown>; clave: string }) => {
    if (!comercioId) throw new Error("Seleccioná un comercio");
    const { data, error } = await api.rpc("apicola_operar", { p_comercio: comercioId, p_accion: accion, p_datos: datos, p_clave: clave });
    if (error) throw new Error(error.code === "23505" ? "El código o nombre ya existe en el comercio." : error.message);
    return data;
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ["apicola", comercioId] }); toast({ title: "Registro apícola guardado" }); } });
}
export function useApicolaLinaje(comercioId: string | undefined, colmenaId?: string) {
  return useQuery({ queryKey: ["apicola", comercioId, "linaje", colmenaId], enabled: Boolean(comercioId && colmenaId), queryFn: async () => {
    const { data, error } = await api.from("apicola_parentescos").select("*").eq("comercio_id", comercioId!).or(`origen_colmena_id.eq.${colmenaId},destino_colmena_id.eq.${colmenaId}`);
    if (error) throw error;
    return data as { origen_colmena_id: string; destino_colmena_id: string; movimiento_id: string }[];
  } });
}
