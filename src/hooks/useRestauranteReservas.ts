import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useAuth } from "@/contexts/AuthContext";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ReservaRestaurante } from "@/types/restauranteReservas";

type DB = Omit<Database, "public"> & { public: Omit<Database["public"], "Functions"> & { Functions: Database["public"]["Functions"] & {
  restaurante_reservas_listar: { Args: { p_comercio_id: string; p_desde: string; p_hasta: string }; Returns: Json };
} } };
const client = supabase as unknown as SupabaseClient<DB>;
export function useRestauranteReservas(fecha: string) {
  const { comercio } = useComercio(); const { user } = useAuth();
  return useQuery({ queryKey: ["restaurante", comercio?.id, user?.id, "reservas", fecha], enabled: Boolean(comercio && user && fecha), refetchInterval: 5000, queryFn: async () => {
    const desde = new Date(`${fecha}T00:00:00`); const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1);
    const { data, error } = await client.rpc("restaurante_reservas_listar", { p_comercio_id: comercio!.id, p_desde: desde.toISOString(), p_hasta: hasta.toISOString() });
    if (error) throw error;
    return data as unknown as ReservaRestaurante[];
  } });
}
