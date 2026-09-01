import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type CampoMembership = {
  rol: string;
};

export function useCampoAccess(comercioId?: string | null) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["campo", comercioId ?? null, "access", userId],
    enabled: Boolean(comercioId && userId),
    queryFn: async (): Promise<CampoMembership | null> => {
      if (!comercioId || !userId) return null;

      const { data, error } = await supabase
        .from("comercio_usuarios")
        .select("rol")
        .eq("comercio_id", comercioId)
        .eq("user_id", userId)
        .eq("activo", true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const rol = query.data?.rol ?? null;
  const perteneceAlComercio = Boolean(query.data && comercioId && userId);

  return {
    isLoading: query.isLoading,
    error: query.error,
    rol,
    isAdmin: perteneceAlComercio && rol === "admin",
    perteneceAlComercio,
  };
}
