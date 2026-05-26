import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { AfipConfig, AfipConfigInsert, AfipConfigUpdate } from '@/types/afip';

export function useAfipConfig() {
  return useQuery({
    queryKey: ['afip-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('afip_config')
        .select('*')
        .eq('activo', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as AfipConfig | null;
    },
  });
}

export function useCreateAfipConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: AfipConfigInsert) => {
      const { data, error } = await supabase
        .from('afip_config')
        .insert([config])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['afip-config'] });
      toast({
        title: "Configuración AFIP creada",
        description: "La configuración de AFIP se ha guardado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo guardar la configuración: ${error.message}`,
        variant: "destructive",
      });
    }
  });
}

export function useUpdateAfipConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...config }: AfipConfig) => {
      const { data, error } = await supabase
        .from('afip_config')
        .update(config)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['afip-config'] });
      toast({
        title: "Configuración actualizada",
        description: "La configuración de AFIP se ha actualizado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo actualizar la configuración: ${error.message}`,
        variant: "destructive",
      });
    }
  });
}

export function useDeleteAfipConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('afip_config')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['afip-config'] });
      toast({
        title: "Configuración eliminada",
        description: "La configuración de AFIP se ha eliminado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo eliminar la configuración: ${error.message}`,
        variant: "destructive",
      });
    }
  });
}
