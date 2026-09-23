import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Banco } from "@/types/banco";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

export const useBancos = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { comercio } = useComercio(); const comercioId = comercio?.id;

  const {
    data: bancos = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["bancos", comercioId], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bancos")
        .select("*")
        .eq("comercio_id", comercioId!)
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
    queryKey: ["bancos", comercioId, "activos"], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bancos")
        .select("*")
        .eq("comercio_id", comercioId!)
        .eq("activo", true)
        .order("nombre_banco", { ascending: true });

      if (error) throw error;
      return data as Banco[];
    },
  });

  const createBancoMutation = useMutation({
    mutationFn: async (banco: Omit<Banco, "id" | "created_at" | "updated_at">) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de registrar el banco.");
      const { data, error } = await supabase
        .from("bancos")
        .insert([{ ...banco, comercio_id: comercioId }])
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
      if (!comercioId) throw new Error("Seleccioná un comercio antes de actualizar el banco.");
      const { data, error } = await supabase
        .from("bancos")
        .update(banco)
        .eq("id", id)
        .eq("comercio_id", comercioId)
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
      if (!comercioId) throw new Error("Seleccioná un comercio antes de eliminar el banco.");
      const { error } = await supabase.from("bancos").delete().eq("id", id).eq("comercio_id", comercioId);
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
