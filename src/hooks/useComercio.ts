import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Comercio, ComercioFormData } from "@/types/comercio";
import { useToast } from "@/hooks/use-toast";

type ComercioQueryResult = {
  comercio: Comercio | null;
  comerciosDisponibles: Comercio[];
};

export const useComercio = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedComercioId, setSelectedComercioId] = useState(() =>
    localStorage.getItem("selectedComercioId"),
  );

  const { data, isLoading } = useQuery<ComercioQueryResult>({
    queryKey: ["comercio", selectedComercioId],
    queryFn: async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        return { comercio: null, comerciosDisponibles: [] };
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("comercio_usuarios")
        .select("comercio_id")
        .eq("user_id", user.id)
        .eq("activo", true)
        .order("created_at", { ascending: true });

      if (membershipsError) throw membershipsError;

      const membershipComercioIds = (memberships || []).map((membership) => membership.comercio_id);
      let comerciosDisponibles: Comercio[] = [];

      if (membershipComercioIds.length > 0) {
        const { data: comercios, error: comerciosError } = await supabase
          .from("comercio")
          .select("*")
          .in("id", membershipComercioIds)
          .eq("activo", true);

        if (comerciosError) throw comerciosError;

        const comerciosById = new Map((comercios || []).map((comercio) => [comercio.id, comercio as Comercio]));
        comerciosDisponibles = membershipComercioIds
          .map((comercioId) => comerciosById.get(comercioId))
          .filter(Boolean) as Comercio[];
      }

      const selectedStillAvailable = selectedComercioId
        ? comerciosDisponibles.some((comercio) => comercio.id === selectedComercioId)
        : false;

      if (selectedComercioId && !selectedStillAvailable) {
        localStorage.removeItem("selectedComercioId");
      }

      if (selectedStillAvailable) {
        return {
          comercio: comerciosDisponibles.find((comercio) => comercio.id === selectedComercioId) || null,
          comerciosDisponibles,
        };
      }

      if (comerciosDisponibles.length === 1) {
        localStorage.setItem("selectedComercioId", comerciosDisponibles[0].id);
        return {
          comercio: comerciosDisponibles[0],
          comerciosDisponibles,
        };
      }

      return {
        comercio: null,
        comerciosDisponibles,
      };
    },
  });

  const selectComercio = (comercioId: string) => {
    localStorage.setItem("selectedComercioId", comercioId);
    setSelectedComercioId(comercioId);
  };

  const createComercio = useMutation({
    mutationFn: async (formData: ComercioFormData) => {
      const { data, error } = await supabase
        .from("comercio")
        .insert(formData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comercio"] });
      toast({
        title: "Éxito",
        description: "Datos del comercio guardados correctamente",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: `No se pudo guardar: ${error.message}`,
      });
    },
  });

  const updateComercio = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: ComercioFormData }) => {
      const { data, error } = await supabase
        .from("comercio")
        .update(formData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comercio"] });
      toast({
        title: "Éxito",
        description: "Datos del comercio actualizados correctamente",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: `No se pudo actualizar: ${error.message}`,
      });
    },
  });

  return {
    comercio: data?.comercio ?? null,
    comerciosDisponibles: data?.comerciosDisponibles ?? [],
    isLoading,
    selectComercio,
    createComercio,
    updateComercio,
  };
};
