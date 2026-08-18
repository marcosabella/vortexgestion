import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";

export type EstadoPedidoOnline = "recibido" | "confirmado" | "preparando" | "listo" | "entregado" | "cancelado";

export function usePedidosOnline() {
  const { comercio } = useComercio();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["pedidos-online", comercio?.id], enabled: Boolean(comercio?.id), refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("pedidos_online")
        .select("*, pedido_online_items(*)").eq("comercio_id", comercio!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoPedidoOnline }) => {
      const { data, error } = await (supabase as any).rpc("actualizar_estado_pedido_online", { p_pedido_id: id, p_estado: estado });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pedidos-online"] }); queryClient.invalidateQueries({ queryKey: ["productos"] }); toast({ title: "Pedido actualizado" }); },
    onError: (error: Error) => toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" }),
  });
  return { pedidos: query.data || [], isLoading: query.isLoading, actualizarEstado: update.mutate, isUpdating: update.isPending };
}
