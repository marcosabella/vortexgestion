import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { AperturaQr, ConsultaMesa, MesaQr } from "@/types/restauranteConsulta";

type ConsultaDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & { Functions: Database["public"]["Functions"] & {
    restaurante_qr_mesas: { Args: { p_comercio_id: string }; Returns: Json };
    restaurante_qr_apertura: { Args: { p_comercio_id: string; p_mesa_id: string }; Returns: Json };
    restaurante_consulta_publica: { Args: { p_qr_token: string; p_apertura_token: string | null }; Returns: Json };
  } };
};
const client = supabase as unknown as SupabaseClient<ConsultaDatabase>;
export function useRestauranteQrMesas(comercioId: string, enabled: boolean) {
  return useQuery({ queryKey: ["restaurante-qr-mesas", comercioId], enabled, staleTime: 0,
    queryFn: async ({ signal }) => {
      const { data, error } = await client.rpc("restaurante_qr_mesas", { p_comercio_id: comercioId }).abortSignal(signal);
      if (error) throw error;
      return data as unknown as MesaQr[];
    },
  });
}
export async function obtenerQrApertura(comercioId: string, mesaId: string) {
  const { data, error } = await client.rpc("restaurante_qr_apertura", { p_comercio_id: comercioId, p_mesa_id: mesaId });
  if (error) throw error;
  return data as unknown as AperturaQr;
}
export function useRestauranteConsulta(qr: string, apertura: string | null, enabled: boolean) {
  return useQuery({ queryKey: ["restaurante-consulta", qr, apertura], enabled,
    gcTime: 0, staleTime: 0, retry: false, refetchInterval: 10000, refetchOnWindowFocus: "always", refetchOnReconnect: "always",
    queryFn: async ({ signal }) => {
      const { data, error } = await client.rpc("restaurante_consulta_publica", { p_qr_token: qr, p_apertura_token: apertura }).abortSignal(signal);
      if (error) throw error;
      return data as unknown as ConsultaMesa;
    },
  });
}
