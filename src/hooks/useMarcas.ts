import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Marca } from "@/types/producto";
import { useToast } from "@/hooks/use-toast";

export const useMarcas = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: marcas = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["marcas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marcas")
        .select("*")
        .order("nombre", { ascending: true });

      if (error) throw error;
      return data as Marca[];
    },
  });

  const createMarcaMutation = useMutation({
    mutationFn: async (marca: Omit<Marca, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("marcas")
        .insert([marca])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marcas"] });
      toast({
        title: "Éxito",
        description: "Marca creada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al crear marca: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMarcaMutation = useMutation({
    mutationFn: async ({ id, ...marca }: Partial<Marca> & { id: string }) => {
      const { data, error } = await supabase
        .from("marcas")
        .update(marca)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marcas"] });
      toast({
        title: "Éxito",
        description: "Marca actualizada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar marca: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMarcaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marcas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marcas"] });
      toast({
        title: "Éxito",
        description: "Marca eliminada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar marca: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    marcas,
    isLoading,
    error,
    createMarca: createMarcaMutation.mutate,
    updateMarca: updateMarcaMutation.mutate,
    deleteMarca: deleteMarcaMutation.mutate,
    isCreating: createMarcaMutation.isPending,
    isUpdating: updateMarcaMutation.isPending,
    isDeleting: deleteMarcaMutation.isPending,
  };
};