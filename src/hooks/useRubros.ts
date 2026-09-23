import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Rubro } from "@/types/producto";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

export const useRubros = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { comercio } = useComercio(); const comercioId = comercio?.id;

  const {
    data: rubros = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["rubros", comercioId], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubros")
        .select("*")
        .eq("comercio_id", comercioId!)
        .order("nombre", { ascending: true });

      if (error) throw error;
      return data as Rubro[];
    },
  });

  const createRubroMutation = useMutation({
    mutationFn: async (rubro: Omit<Rubro, "id" | "created_at" | "updated_at">) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de crear el rubro.");
      const { data, error } = await supabase
        .from("rubros")
        .insert([{ ...rubro, comercio_id: comercioId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubros"] });
      toast({
        title: "Éxito",
        description: "Rubro creado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al crear rubro: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateRubroMutation = useMutation({
    mutationFn: async ({ id, ...rubro }: Partial<Rubro> & { id: string }) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de actualizar el rubro.");
      const { data, error } = await supabase
        .from("rubros")
        .update(rubro)
        .eq("id", id)
        .eq("comercio_id", comercioId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubros"] });
      toast({
        title: "Éxito",
        description: "Rubro actualizado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar rubro: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteRubroMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de eliminar el rubro.");
      const { error } = await supabase.from("rubros").delete().eq("id", id).eq("comercio_id", comercioId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubros"] });
      toast({
        title: "Éxito",
        description: "Rubro eliminado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar rubro: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    rubros,
    isLoading,
    error,
    createRubro: createRubroMutation.mutate,
    updateRubro: updateRubroMutation.mutate,
    deleteRubro: deleteRubroMutation.mutate,
    isCreating: createRubroMutation.isPending,
    isUpdating: updateRubroMutation.isPending,
    isDeleting: deleteRubroMutation.isPending,
  };
};
