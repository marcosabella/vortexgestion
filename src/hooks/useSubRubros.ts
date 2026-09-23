import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SubRubro } from "@/types/producto";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

export const useSubRubros = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { comercio } = useComercio(); const comercioId = comercio?.id;

  const {
    data: subrubros = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["subrubros", comercioId], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subrubros")
        .select(`
          *,
          rubro:rubros(nombre)
        `)
        .eq("comercio_id", comercioId!)
        .order("nombre", { ascending: true });

      if (error) throw error;
      return data as SubRubro[];
    },
  });

  const createSubRubroMutation = useMutation({
    mutationFn: async (subrubro: Omit<SubRubro, "id" | "created_at" | "updated_at">) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de crear el subrubro.");
      const { data, error } = await supabase
        .from("subrubros")
        .insert([{ ...subrubro, comercio_id: comercioId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subrubros"] });
      toast({
        title: "Éxito",
        description: "SubRubro creado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al crear subrubro: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateSubRubroMutation = useMutation({
    mutationFn: async ({ id, ...subrubro }: Partial<SubRubro> & { id: string }) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de actualizar el subrubro.");
      const { data, error } = await supabase
        .from("subrubros")
        .update(subrubro)
        .eq("id", id)
        .eq("comercio_id", comercioId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subrubros"] });
      toast({
        title: "Éxito",
        description: "SubRubro actualizado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar subrubro: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteSubRubroMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de eliminar el subrubro.");
      const { error } = await supabase.from("subrubros").delete().eq("id", id).eq("comercio_id", comercioId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subrubros"] });
      toast({
        title: "Éxito",
        description: "SubRubro eliminado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar subrubro: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    subrubros,
    isLoading,
    error,
    createSubRubro: createSubRubroMutation.mutate,
    updateSubRubro: updateSubRubroMutation.mutate,
    deleteSubRubro: deleteSubRubroMutation.mutate,
    isCreating: createSubRubroMutation.isPending,
    isUpdating: updateSubRubroMutation.isPending,
    isDeleting: deleteSubRubroMutation.isPending,
  };
};
