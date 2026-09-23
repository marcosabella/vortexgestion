import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useComercio } from '@/hooks/useComercio';

export interface Proveedor {
  id?: string;
  nombre: string;
  apellido?: string;
  razon_social?: string;
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

export function useProveedores() {
  const { comercio } = useComercio(); const comercioId = comercio?.id;
  return useQuery({
    queryKey: ['proveedores', comercioId], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('comercio_id', comercioId)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data as Proveedor[];
    },
  });
}

export function useCreateProveedor() {
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  
  return useMutation({
    mutationFn: async (proveedor: Omit<Proveedor, 'id'>) => {
      if (!comercio?.id) throw new Error('Seleccioná un comercio antes de crear el proveedor.');
      const { data, error } = await supabase
        .from('proveedores')
        .insert([{ ...proveedor, comercio_id: comercio.id }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast({
        title: "Proveedor creado",
        description: "El proveedor se ha agregado correctamente.",
      });
    }
  });
}

export function useUpdateProveedor() {
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  
  return useMutation({
    mutationFn: async ({ id, ...proveedor }: Proveedor) => {
      if (!comercio?.id) throw new Error('Seleccioná un comercio antes de actualizar el proveedor.');
      const { data, error } = await supabase
        .from('proveedores')
        .update(proveedor)
        .eq('id', id)
        .eq('comercio_id', comercio.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast({
        title: "Proveedor actualizado",
        description: "Los datos del proveedor se han actualizado correctamente.",
      });
    }
  });
}

export function useDeleteProveedor() {
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (!comercio?.id) throw new Error('Seleccioná un comercio antes de eliminar el proveedor.');
      const { error } = await supabase
        .from('proveedores')
        .delete()
        .eq('id', id)
        .eq('comercio_id', comercio.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast({
        title: "Proveedor eliminado",
        description: "El proveedor se ha eliminado correctamente.",
      });
    }
  });
}
