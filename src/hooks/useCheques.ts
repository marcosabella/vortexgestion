import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Cheque } from '@/types/cheque';
import { toast } from 'sonner';
import { useComercio } from '@/hooks/useComercio';

export const useCheques = () => {
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  const comercioId = comercio?.id;

  const { data: cheques, isLoading, error } = useQuery({
    queryKey: ['cheques', comercioId],
    enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cheques')
        .select(`
          *,
          cliente:clientes(nombre, apellido, cuit),
          proveedor:proveedores(nombre, apellido, razon_social)
        `)
        .eq('comercio_id', comercioId!)
        .order('fecha_vencimiento', { ascending: false });

      if (error) throw error;
      return data as Cheque[];
    },
  });

  const createChequeMutation = useMutation({
    mutationFn: async (cheque: Omit<Cheque, 'id' | 'created_at' | 'updated_at'>) => {
      if (!comercioId) throw new Error('Seleccioná un comercio antes de registrar el cheque.');
      const { data, error } = await supabase
        .from('cheques')
        .insert([{ ...cheque, comercio_id: comercioId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      toast.success('Cheque registrado exitosamente');
    },
    onError: (error) => {
      toast.error('Error al registrar el cheque: ' + error.message);
    },
  });

  const updateChequeMutation = useMutation({
    mutationFn: async ({ id, ...cheque }: Cheque) => {
      if (!comercioId) throw new Error('Seleccioná un comercio antes de actualizar el cheque.');
      const { data, error } = await supabase
        .from('cheques')
        .update(cheque)
        .eq('id', id)
        .eq('comercio_id', comercioId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      toast.success('Cheque actualizado exitosamente');
    },
    onError: (error) => {
      toast.error('Error al actualizar el cheque: ' + error.message);
    },
  });

  const deleteChequeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!comercioId) throw new Error('Seleccioná un comercio antes de eliminar el cheque.');
      const { error } = await supabase
        .from('cheques')
        .delete()
        .eq('id', id)
        .eq('comercio_id', comercioId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      toast.success('Cheque eliminado exitosamente');
    },
    onError: (error) => {
      toast.error('Error al eliminar el cheque: ' + error.message);
    },
  });

  return {
    cheques,
    isLoading,
    error,
    createCheque: createChequeMutation.mutate,
    updateCheque: updateChequeMutation.mutate,
    deleteCheque: deleteChequeMutation.mutate,
    isCreating: createChequeMutation.isPending,
    isUpdating: updateChequeMutation.isPending,
    isDeleting: deleteChequeMutation.isPending,
  };
};
