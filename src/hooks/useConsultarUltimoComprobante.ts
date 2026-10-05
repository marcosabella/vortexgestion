import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DatosArca } from '@/hooks/useConsultarArca';

export const useNombreReceptorArca = (comercioId: string | undefined, cuit: string | undefined, tipoDocumento: number | undefined, enabled: boolean) => {
  const cuitLimpio = cuit?.replace(/\D/g, '') || '';
  return useQuery({
    queryKey: ['arca-nombre-receptor', comercioId, cuitLimpio],
    enabled: enabled && Boolean(comercioId) && tipoDocumento === 80 && cuitLimpio.length === 11,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        data?: DatosArca;
        error?: string;
        advertencia?: string;
      }>('consultar-padron-afip', { body: { cuit: cuitLimpio, comercioId } });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'No se pudo consultar el padrón');
      const nombre = data.data?.razonSocial?.trim()
        || [data.data?.nombre, data.data?.apellido].filter(Boolean).join(' ').trim();
      if (!nombre) throw new Error('El padrón no devolvió el nombre del contribuyente');
      return { nombre, advertencia: data.advertencia };
    },
  });
};

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
