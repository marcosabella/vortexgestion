import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useComercio } from "@/hooks/useComercio";
import { useAuth } from "@/contexts/AuthContext";
import { isLegacyDeletedClient } from "@/utils/legacyVisibility";

type ClientePedido = { id: string; nombre: string | null; apellido: string | null; cuit: string | null; telefono: string | null; calle: string | null; numero: string | null; localidad: string | null };
type RestauranteDatabase = Omit<Database, "public"> & { public: Omit<Database["public"], "Functions"> & { Functions: Database["public"]["Functions"] & {
  restaurante_clientes: { Args: { p_comercio_id: string }; Returns: Json };
} } };
const client = supabase as unknown as SupabaseClient<RestauranteDatabase>;
export function useRestauranteClientes() {
  const { comercio } = useComercio();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["restaurante-clientes", comercio?.id, user?.id], enabled: Boolean(comercio && user),
    queryFn: async () => {
      const { data, error } = await client.rpc("restaurante_clientes", { p_comercio_id: comercio!.id });
      if (error) throw error;
      return (data as unknown as ClientePedido[]).filter(cliente => !isLegacyDeletedClient(cliente));
    },
  });
}
