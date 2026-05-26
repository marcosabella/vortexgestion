import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
}

export function useClientes() {
  return useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('apellido', { ascending: true });
      
      if (error) throw error;
      return data as Cliente[];
    },
  });
}

export function useCreateCliente() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (cliente: Omit<Cliente, 'id'>) => {
      const { data, error } = await supabase
        .from('clientes')
        .insert([cliente])
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
  
  return useMutation({
    mutationFn: async ({ id, ...cliente }: Cliente) => {
      const { data, error } = await supabase
        .from('clientes')
        .update(cliente)
        .eq('id', id)
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
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id);
      
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