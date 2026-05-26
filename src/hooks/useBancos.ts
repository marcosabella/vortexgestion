import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Banco } from "@/types/banco";
import { useToast } from "@/hooks/use-toast";

export const useBancos = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: bancos = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["bancos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bancos")
        .select("*")
        .order("nombre_banco", { ascending: true });

      if (error) throw error;
      return data as Banco[];
    },
  });

  // Get active banks only
  const {
    data: bancosActivos = [],
    isLoading: isLoadingActivos,
  } = useQuery({
    queryKey: ["bancos", "activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bancos")
        .select("*")
        .eq("activo", true)
        .order("nombre_banco", { ascending: true });

      if (error) throw error;
      return data as Banco[];
    },
  });

  const createBancoMutation = useMutation({
    mutationFn: async (banco: Omit<Banco, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("bancos")
        .insert([banco])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      toast({
        title: "Éxito",
        description: "Banco registrado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al registrar banco: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateBancoMutation = useMutation({
    mutationFn: async ({ id, banco }: { id: string; banco: Omit<Banco, "id" | "created_at" | "updated_at"> }) => {
      const { data, error } = await supabase
        .from("bancos")
        .update(banco)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      toast({
        title: "Éxito",
        description: "Banco actualizado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar banco: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteBancoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bancos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      toast({
        title: "Éxito",
        description: "Banco eliminado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar banco: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    bancos,
    bancosActivos,
    isLoading,
    isLoadingActivos,
    error,
    createBanco: createBancoMutation.mutate,
    updateBanco: updateBancoMutation.mutate,
    deleteBanco: deleteBancoMutation.mutate,
    isCreating: createBancoMutation.isPending,
    isUpdating: updateBancoMutation.isPending,
    isDeleting: deleteBancoMutation.isPending,
  };
};