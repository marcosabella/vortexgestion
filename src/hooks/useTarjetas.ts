import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TarjetaCredito, TarjetaCuota, TarjetaConCuotas } from "@/types/tarjeta";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

export const useTarjetas = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { comercio } = useComercio(); const comercioId = comercio?.id;

  const {
    data: tarjetas = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tarjetas", comercioId], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarjetas_credito")
        .select(`
          *,
          tarjeta_cuotas(*)
        `)
        .eq("comercio_id", comercioId!)
        .order("nombre", { ascending: true });

      if (error) throw error;
      return data as TarjetaCredito[];
    },
  });

  // Get active credit cards with their installments
  const {
    data: tarjetasActivas = [],
    isLoading: isLoadingActivas,
  } = useQuery({
    queryKey: ["tarjetas", comercioId, "activas"], enabled: Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarjetas_credito")
        .select(`
          *,
          tarjeta_cuotas!inner(*)
        `)
        .eq("comercio_id", comercioId!)
        .eq("activa", true)
        .eq("tarjeta_cuotas.activa", true)
        .order("nombre", { ascending: true });

      if (error) throw error;
      
      // Transform data to include available installments
      const tarjetasConCuotas: TarjetaConCuotas[] = data.map(tarjeta => ({
        ...tarjeta,
        cuotas_disponibles: tarjeta.tarjeta_cuotas || []
      }));

      return tarjetasConCuotas;
    },
  });

  const createTarjetaMutation = useMutation({
    mutationFn: async (tarjeta: Omit<TarjetaCredito, "id" | "created_at" | "updated_at">) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de registrar la tarjeta.");
      const { data, error } = await supabase
        .from("tarjetas_credito")
        .insert([{ ...tarjeta, comercio_id: comercioId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarjetas"] });
      toast({
        title: "Éxito",
        description: "Tarjeta registrada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al registrar tarjeta: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateTarjetaMutation = useMutation({
    mutationFn: async ({ id, tarjeta }: { id: string; tarjeta: Omit<TarjetaCredito, "id" | "created_at" | "updated_at"> }) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de actualizar la tarjeta.");
      const { data, error } = await supabase
        .from("tarjetas_credito")
        .update(tarjeta)
        .eq("id", id)
        .eq("comercio_id", comercioId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarjetas"] });
      toast({
        title: "Éxito",
        description: "Tarjeta actualizada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar tarjeta: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteTarjetaMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de eliminar la tarjeta.");
      const { error } = await supabase.from("tarjetas_credito").delete().eq("id", id).eq("comercio_id", comercioId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarjetas"] });
      toast({
        title: "Éxito",
        description: "Tarjeta eliminada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar tarjeta: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    tarjetas,
    tarjetasActivas,
    isLoading,
    isLoadingActivas,
    error,
    createTarjeta: createTarjetaMutation.mutate,
    updateTarjeta: updateTarjetaMutation.mutate,
    deleteTarjeta: deleteTarjetaMutation.mutate,
    isCreating: createTarjetaMutation.isPending,
    isUpdating: updateTarjetaMutation.isPending,
    isDeleting: deleteTarjetaMutation.isPending,
  };
};
