import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PARAMETRIZACION, FormatoComprobante, normalizeParametrizacion } from "@/config/parametrizacion";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

export function useComercioParametrizacion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { comercio, isLoading: comercioLoading } = useComercio();
  const comercioId = comercio?.id;
  const query = useQuery({
    queryKey: ["comercio-parametrizacion", comercioId],
    enabled: !comercioLoading && Boolean(comercioId),
    queryFn: async () => {
      if (!comercioId) return DEFAULT_PARAMETRIZACION;

      const { data, error } = await (supabase as any)
        .from("comercio_parametrizacion")
        .select("parametros")
        .eq("comercio_id", comercioId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return normalizeParametrizacion(data?.parametros);
    },
    // Los permisos pueden cambiar desde la administracion mientras el usuario tiene la aplicacion abierta.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    initialData: DEFAULT_PARAMETRIZACION,
  });

  const updateFormatoImpresion = useMutation({
    mutationFn: async ({ comercioId, formato }: { comercioId: string; formato: FormatoComprobante }) => {
      const { data, error } = await (supabase as any).rpc("actualizar_formato_impresion_comercio", {
        p_comercio_id: comercioId,
        p_formato: formato,
      });

      if (error) throw error;
      return normalizeParametrizacion(data);
    },
    onSuccess: (parametros) => {
      queryClient.setQueryData(
        ["comercio-parametrizacion", comercioId],
        parametros,
      );
      toast({ title: "Formato actualizado", description: "El formato de impresion quedo guardado." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo guardar el formato: ${error.message}` });
    },
  });

  return { ...query, updateFormatoImpresion };
}
