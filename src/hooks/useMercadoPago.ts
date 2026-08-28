import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useComercio } from '@/hooks/useComercio';
import { useToast } from '@/hooks/use-toast';

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('mercado-pago', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string; message?: string };
        throw new Error(payload.error || payload.message || error.message);
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== 'Unexpected end of JSON input') throw contextError;
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useMercadoPago() {
  const { comercio } = useComercio();
  const comercioId = comercio?.id;
  const client = useQueryClient();
  const { toast } = useToast();
  const status = useQuery({ queryKey:['mercado-pago',comercioId], enabled:Boolean(comercioId), queryFn:()=>invoke({action:'status',comercioId}) });
  const mutate = useMutation({
    mutationFn:(payload:Record<string,unknown>)=>invoke({...payload,comercioId}),
    onSuccess:()=>client.invalidateQueries({queryKey:['mercado-pago',comercioId]}),
    onError:(error:Error)=>toast({title:'Mercado Pago',description:error.message,variant:'destructive'}),
  });
  return { comercio, status, run:mutate.mutateAsync, isWorking:mutate.isPending };
}
