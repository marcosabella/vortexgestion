import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import type { ReciboPagoCliente } from "@/types/recibo-pago-cliente";

export function useRecibosPagoCliente(clienteId: string) {
  const { comercio } = useComercio();
  return useQuery({
    queryKey: ["recibos-pago-cliente", comercio?.id, clienteId],
    enabled: Boolean(comercio?.id && clienteId),
    queryFn: async () => {
      const recibos: ReciboPagoCliente[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("recibos_pago_cliente").select("*")
          .eq("comercio_id", comercio!.id).eq("cliente_id", clienteId)
          .order("numero", { ascending: false }).range(from, from + 999);
        if (error) throw error;
        recibos.push(...(data || []) as unknown as ReciboPagoCliente[]);
        if (!data || data.length < 1000) break;
      }
      return recibos;
    },
  });
}
