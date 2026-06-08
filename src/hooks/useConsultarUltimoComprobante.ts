import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConsultarUltimoComprobanteParams {
  tipoComprobante: string;
  comercioId: string;
}

interface ConsultarUltimoComprobanteResponse {
  success: boolean;
  comercioId?: string;
  ultimoNumero?: number;
  puntoVenta?: number;
  tipoComprobante?: string;
  ambiente?: string;
  error?: string;
}

export const useConsultarUltimoComprobante = () => {
  return useMutation({
    mutationFn: async ({ tipoComprobante, comercioId }: ConsultarUltimoComprobanteParams) => {
      if (!comercioId) {
        throw new Error('Debe seleccionar un comercio para consultar');
      }

      const { data, error } = await supabase.functions.invoke<ConsultarUltimoComprobanteResponse>(
        'consultar-ultimo-comprobante',
        {
          body: { tipoComprobante, comercioId },
        }
      );

      if (error) {
        let errorMessage = error.message;
        const context = (error as any).context;

        if (context && typeof context.json === 'function') {
          try {
            const errorBody = await context.json();
            errorMessage = errorBody?.error || errorMessage;
          } catch (parseError) {
            console.error('No se pudo leer el detalle del error de ultimo comprobante:', parseError);
          }
        }

        throw new Error(errorMessage);
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
