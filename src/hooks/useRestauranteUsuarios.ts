import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database, Json } from "@/integrations/supabase/types";
import type { RolRestaurante } from "@/config/restauranteRoles";
import type { PermisoRestaurante } from "@/types/restaurante";

type DB = Omit<Database, "public"> & { public: Omit<Database["public"], "Functions"> & { Functions: Database["public"]["Functions"] & {
  restaurante_mi_acceso: { Args: { p_comercio_id: string }; Returns: Json };
  restaurante_listar_usuarios: { Args: { p_comercio_id: string }; Returns: Json };
} } };
const client = supabase as unknown as SupabaseClient<DB>;
export type UsuarioRestaurante = { id: string; email: string; nombre: string; admin: boolean; solo_restaurante: boolean; activo: boolean; roles: RolRestaurante[]; permisos: PermisoRestaurante[]; sector_id: string | null };
export function useRestauranteAcceso(comercioId?: string) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["restaurante-acceso", comercioId, user?.id], enabled: Boolean(comercioId && user), refetchInterval: 5000, queryFn: async () => {
    const { data, error } = await client.rpc("restaurante_mi_acceso", { p_comercio_id: comercioId! });
    if (error) throw error;
    return data as unknown as { solo_restaurante: boolean; admin: boolean; permisos: PermisoRestaurante[] } | null;
  } });
}
export function useRestauranteUsuarios(comercioId?: string) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["restaurante-usuarios", comercioId, user?.id], enabled: Boolean(comercioId && user), queryFn: async () => {
    const { data, error } = await client.rpc("restaurante_listar_usuarios", { p_comercio_id: comercioId! });
    if (error) throw error;
    return data as unknown as UsuarioRestaurante[];
  } });
  const mutation = useMutation({ gcTime: 0, mutationFn: async (values: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<{ success: boolean; error?: string }>("restaurante-usuarios", { body: { ...values, comercio_id: comercioId } });
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      throw new Error(details?.error || "No se pudo gestionar el usuario.");
    }
    if (error || !data?.success) throw new Error(data?.error || "No se pudo gestionar el usuario.");
  }, onSuccess: async () => {
    await Promise.all(["restaurante-usuarios", "restaurante", "restaurante-acceso"].map(key => cache.invalidateQueries({ queryKey: [key] })));
  } });
  return { query, mutation };
}
