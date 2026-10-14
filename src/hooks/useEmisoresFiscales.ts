import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import type { EmisorFiscal, GuardarEmisorFiscal } from "@/types/emisorFiscal";

type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };
export const rpcEmisorFiscal = <T,>(name: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult<T>> }).rpc(name, args);

export function useEmisoresFiscales(enabled = true) {
  const { comercio } = useComercio();
  return useQuery({
    queryKey: ["emisores-fiscales", comercio?.id], enabled: enabled && Boolean(comercio?.id),
    queryFn: async () => {
      const { data, error } = await rpcEmisorFiscal<EmisorFiscal[]>("listar_emisores_fiscales", { p_comercio_id: comercio!.id });
      if (error?.code === "PGRST202" || error?.message.includes("Could not find the function")) {
        throw new Error("La base de datos conectada todavía no tiene instalada la migración de múltiples CUIT. Debe aplicarse antes de agregar o seleccionar emisores fiscales.");
      }
      if (error) throw new Error(`No se pudieron cargar los emisores fiscales: ${error.message}`);
      return data || [];
    },
  });
}

export function useGuardarEmisorFiscal() {
  const { comercio } = useComercio();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (emisor: GuardarEmisorFiscal) => {
      if (!comercio?.id) throw new Error("Seleccioná un comercio.");
      const { data, error } = await rpcEmisorFiscal<string>("guardar_emisor_fiscal", { p_comercio_id: comercio.id, p_datos: emisor });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ["emisores-fiscales"] }); client.invalidateQueries({ queryKey: ["afip-config"] }); },
  });
}
