import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database, Json } from "@/integrations/supabase/types";

type DB = Omit<Database, "public"> & { public: Omit<Database["public"], "Functions"> & { Functions: Database["public"]["Functions"] & {
  restaurante_terminales_listar: { Args: { p_comercio_id: string }; Returns: Json };
  restaurante_terminal_revocar: { Args: { p_comercio_id: string; p_id: string }; Returns: string };
} } };
const client = supabase as unknown as SupabaseClient<DB>;
export type TerminalRestaurante = { id: string; nombre: string; vence_at: string; revocada: boolean };
export const restauranteTerminalKey = "vortex-restaurante-terminal";

export async function restaurantePinRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>("restaurante-pin", { body });
  if (error instanceof FunctionsHttpError) {
    const details = await error.context.json().catch(() => null);
    throw new Error(details?.error || "No se pudo completar el acceso por PIN.");
  }
  if (error || !data || data.error) throw new Error(data?.error || "No se pudo completar el acceso por PIN.");
  return data;
}

export function useRestauranteTerminalAcceso(comercioId?: string, enabled = true) {
  const { user } = useAuth();
  const token = localStorage.getItem(restauranteTerminalKey);
  return useQuery({
    queryKey: ["restaurante-terminal-acceso", comercioId, user?.id],
    enabled: enabled && Boolean(comercioId && user && token),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: 5000,
    queryFn: () => restaurantePinRequest<{ comercio_id: string }>({
      action: "validar_terminal", token, comercio_id: comercioId,
    }),
  });
}

export function useRestaurantePin(comercioId?: string) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["restaurante-terminales", comercioId, user?.id], enabled: Boolean(comercioId && user), queryFn: async () => {
    const { data, error } = await client.rpc("restaurante_terminales_listar", { p_comercio_id: comercioId! });
    if (error) throw error;
    return data as unknown as { terminales: TerminalRestaurante[]; usuarios: string[] };
  } });
  const mutation = useMutation({ gcTime: 0, mutationFn: async (values: Record<string, unknown>) => {
    if (!comercioId) throw new Error("Seleccioná un comercio.");
    if (values.action === "revocar") {
      const { error } = await client.rpc("restaurante_terminal_revocar", { p_comercio_id: comercioId, p_id: String(values.id) });
      if (error) throw error;
      return;
    }
    const result = await restaurantePinRequest<{ token?: string; id?: string }>({ ...values, comercio_id: comercioId });
    if (values.action === "crear_terminal") {
      if (!result.token) throw new Error("No se recibió la habilitación de la terminal.");
      localStorage.setItem(restauranteTerminalKey, result.token);
    }
  }, onSuccess: async () => {
    await cache.invalidateQueries({ queryKey: ["restaurante-terminales"] });
    await cache.invalidateQueries({ queryKey: ["restaurante-terminal-acceso"] });
  } });
  return { query, mutation };
}
