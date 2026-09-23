import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Marca } from "@/types/producto";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

export const useMarcas = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { comercio } = useComercio(); const comercioId = comercio?.id;

  const {
    data: marcas = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["marcas", comercioId], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marcas")
        .select("*")
        .eq("comercio_id", comercioId!)
        .order("nombre", { ascending: true });

      if (error) throw error;
      return data as Marca[];
    },
  });

  const createMarcaMutation = useMutation({
    mutationFn: async (marca: Omit<Marca, "id" | "created_at" | "updated_at">) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de crear la marca.");
      const { data, error } = await supabase
        .from("marcas")
        .insert([{ ...marca, comercio_id: comercioId }])
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
      if (!comercioId) throw new Error("Seleccioná un comercio antes de actualizar la marca.");
      const { data, error } = await supabase
        .from("marcas")
        .update(marca)
        .eq("id", id)
        .eq("comercio_id", comercioId)
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
      if (!comercioId) throw new Error("Seleccioná un comercio antes de eliminar la marca.");
      const { error } = await supabase.from("marcas").delete().eq("id", id).eq("comercio_id", comercioId);
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
