import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useComercio } from '@/hooks/useComercio';
import { isLegacyDeletedClient } from '@/utils/legacyVisibility';

export interface Cliente {
  id?: string;
  nombre: string;
  apellido: string;
  cuit: string;
  calle: string;
  numero: string;
  codigo_postal: string;
  localidad: string;
  provincia: string;
  telefono?: string;
  email?: string;
  situacion_afip: string;
  ingresos_brutos?: string;
  tipo_persona: 'fisica' | 'juridica';
  cliente_usuarios?: Array<{ user_id: string; metodo: 'email_verificado' | 'creado_pedido' | 'manual'; created_at: string }>;
}

export function useClientes() {
  const { comercio } = useComercio(); const comercioId = comercio?.id;
  return useQuery({
    queryKey: ['clientes', comercioId], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('clientes')
        .select('*, cliente_usuarios(user_id,metodo,created_at)')
        .eq('comercio_id', comercioId)
        .order('apellido', { ascending: true });
      
      if (error) throw error;
      return (data as Cliente[]).filter((cliente) => !isLegacyDeletedClient(cliente));
    },
  });
}

export function useCreateCliente() {
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  
  return useMutation({
    mutationFn: async (cliente: Omit<Cliente, 'id'>) => {
      if (!comercio?.id) throw new Error('Seleccioná un comercio antes de crear el cliente.');
      const { data, error } = await supabase
        .from('clientes')
        .insert([{ ...cliente, comercio_id: comercio.id }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast({
        title: "Cliente creado",
        description: "El cliente se ha agregado correctamente.",
      });
    }
  });
}

export function useUpdateCliente() {
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  
  return useMutation({
    mutationFn: async ({ id, ...cliente }: Cliente) => {
      if (!comercio?.id) throw new Error('Seleccioná un comercio antes de actualizar el cliente.');
      const { data, error } = await supabase
        .from('clientes')
        .update(cliente)
        .eq('id', id)
        .eq('comercio_id', comercio.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast({
        title: "Cliente actualizado",
        description: "Los datos del cliente se han actualizado correctamente.",
      });
    }
  });
}

export function useDeleteCliente() {
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (!comercio?.id) throw new Error('Seleccioná un comercio antes de eliminar el cliente.');
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id)
        .eq('comercio_id', comercio.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast({
        title: "Cliente eliminado",
        description: "El cliente se ha eliminado correctamente.",
      });
    }
  });
}
