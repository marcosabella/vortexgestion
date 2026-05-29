import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PARAMETRIZACION, normalizeParametrizacion } from "@/config/parametrizacion";

export function useComercioParametrizacion() {
  return useQuery({
    queryKey: ["comercio-parametrizacion", localStorage.getItem("selectedComercioId")],
    queryFn: async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) return DEFAULT_PARAMETRIZACION;

      const selectedComercioId = localStorage.getItem("selectedComercioId");
      let comercioId = selectedComercioId;

      if (!comercioId) {
        const { data: memberships, error: membershipsError } = await supabase
          .from("comercio_usuarios")
          .select("comercio_id")
          .eq("user_id", user.id)
          .eq("activo", true)
          .order("created_at", { ascending: true });

        if (membershipsError) throw membershipsError;
        if ((memberships || []).length === 1) {
          comercioId = memberships[0].comercio_id;
        }
      }

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
    staleTime: 5 * 60 * 1000,
    initialData: DEFAULT_PARAMETRIZACION,
  });
}
