import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConsultarUltimoComprobanteParams {
  tipoComprobante: string;
}

interface ConsultarUltimoComprobanteResponse {
  success: boolean;
  ultimoNumero?: number;
  puntoVenta?: number;
  tipoComprobante?: string;
  ambiente?: string;
  error?: string;
}

export const useConsultarUltimoComprobante = () => {
  return useMutation({
    mutationFn: async ({ tipoComprobante }: ConsultarUltimoComprobanteParams) => {
      const { data, error } = await supabase.functions.invoke<ConsultarUltimoComprobanteResponse>(
        'consultar-ultimo-comprobante',
        {
          body: { tipoComprobante },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Error al consultar último comprobante');
      }

      return data;
    },
    onError: (error: Error) => {
      toast.error('Error al consultar último comprobante', {
        description: error.message,
      });
    },
  });
};
