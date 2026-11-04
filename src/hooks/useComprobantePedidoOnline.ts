import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useComercio } from '@/hooks/useComercio';
import { useToast } from '@/hooks/use-toast';
import { rpcEmisorFiscal } from '@/hooks/useEmisoresFiscales';
import type { TipoComprobante } from '@/types/venta';

interface ComprobanteGenerado { venta_id: string; numero_comprobante: string; reutilizado: boolean }
export function useComprobantePedidoOnline() {
  const { comercio } = useComercio();
  const cache = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ pedidoId, tipo, emisorId }: { pedidoId: string; tipo: TipoComprobante; emisorId?: string }) => {
      if (!comercio?.id) throw new Error('Seleccioná un comercio');
      const { data, error } = await rpcEmisorFiscal<ComprobanteGenerado>('generar_comprobante_pedido_online', {
        p_pedido_id: pedidoId, p_comercio_id: comercio.id, p_tipo: tipo, p_emisor_id: emisorId || null,
      });
      if (error) throw new Error(error.message);
      if (!data?.venta_id) throw new Error('Actualizá el pedido para verificar si el comprobante se generó');
      return data;
    },
    onSuccess: data => toast({ title: data.reutilizado ? 'El pedido ya tiene comprobante' : 'Comprobante generado', description: data.numero_comprobante }),
    onError: (error: Error) => toast({ title: 'No se pudo generar el comprobante', description: error.message, variant: 'destructive' }),
    onSettled: () => {
      for (const key of ['pedidos-online', 'ventas', 'caja-diaria-ventas', 'cajas-diarias']) cache.invalidateQueries({ queryKey: [key] });
    },
  });
}
