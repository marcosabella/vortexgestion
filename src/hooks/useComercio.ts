import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Comercio, ComercioFormData } from "@/types/comercio";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type ComercioQueryResult = {
  comercio: Comercio | null;
  comerciosDisponibles: Comercio[];
};

export const useComercio = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [selectedComercioId, setSelectedComercioId] = useState(() =>
    localStorage.getItem("selectedComercioId"),
  );

  useEffect(() => {
    const syncSelectedComercio = () => setSelectedComercioId(localStorage.getItem("selectedComercioId"));
    window.addEventListener("comercio-activo-cambio", syncSelectedComercio);
    window.addEventListener("storage", syncSelectedComercio);
    return () => {
      window.removeEventListener("comercio-activo-cambio", syncSelectedComercio);
      window.removeEventListener("storage", syncSelectedComercio);
    };
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery<ComercioQueryResult>({
    queryKey: ["comercio", selectedComercioId, user?.id],
    enabled: !authLoading && Boolean(user),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!user) {
        return { comercio: null, comerciosDisponibles: [] };
      }

      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal.addEventListener("abort", cancel, { once: true });
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("La carga del comercio demoró demasiado. Revisá la conexión e intentá nuevamente."));
          controller.abort();
        }, 15_000);
      });

      const cargar = async (): Promise<ComercioQueryResult> => {
        const { data: memberships, error: membershipsError } = await supabase
          .from("comercio_usuarios")
          .select("comercio_id")
          .eq("user_id", user.id)
          .eq("activo", true)
          .order("created_at", { ascending: true })
          .abortSignal(controller.signal);

        if (membershipsError) throw membershipsError;
        if (controller.signal.aborted) throw new Error("La carga del comercio fue cancelada.");

        const membershipComercioIds = (memberships || []).map((membership) => membership.comercio_id);
        let comerciosDisponibles: Comercio[] = [];

        if (membershipComercioIds.length > 0) {
          const { data: comercios, error: comerciosError } = await supabase
            .from("comercio")
            .select("*")
            .in("id", membershipComercioIds)
            .eq("activo", true)
            .abortSignal(controller.signal);

          if (comerciosError) throw comerciosError;
          if (controller.signal.aborted) throw new Error("La carga del comercio fue cancelada.");

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
      };

      try {
        return await Promise.race([cargar(), timeout]);
      } finally {
        clearTimeout(timer!);
        signal.removeEventListener("abort", cancel);
      }
    },
  });

  const selectComercio = (comercioId: string) => {
    localStorage.setItem("selectedComercioId", comercioId);
    setSelectedComercioId(comercioId);
    window.dispatchEvent(new Event("comercio-activo-cambio"));
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
    isLoading: authLoading || (Boolean(user) && isLoading),
    error,
    refetch,
    isFetching,
    selectComercio,
    createComercio,
    updateComercio,
  };
};
