import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAccesoComercio } from '@/hooks/useUsuariosComercio';

type CampoRole = "admin" | "operador";
type CampoMembership = { rol: CampoRole };

export function useCampoAccess(comercioId?: string | null) {
  const accesoGeneral = useAccesoComercio();
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
      return data as CampoMembership | null;
    },
  });

  const rol = query.data?.rol ?? null;
  const perteneceAlComercio = Boolean(query.data && comercioId && userId);
  const operarioQuery = useQuery({
    queryKey: ["campo", comercioId ?? null, "access", userId, "operario"],
    enabled: Boolean(comercioId && userId && perteneceAlComercio && accesoGeneral.data && (accesoGeneral.data.admin || !accesoGeneral.data.configurado || accesoGeneral.data.permisos.campo?.includes('consultar'))),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_operarios")
        .select("id,nombre,codigo_interno,activo")
        .eq("comercio_id", comercioId!)
        .eq("user_id", userId!)
        .eq("activo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isAdmin = perteneceAlComercio && (rol === "admin" || (accesoGeneral.data?.configurado && accesoGeneral.data.permisos.campo?.includes('administrar')));
  const isOperador = perteneceAlComercio && rol === "operador" && (!accesoGeneral.data?.configurado || Boolean(accesoGeneral.data.permisos.campo?.includes('operar')));

  return {
    isLoading: query.isLoading || (operarioQuery.isLoading && perteneceAlComercio),
    error: query.error ?? operarioQuery.error,
    user,
    userId,
    rol,
    isAdmin,
    isOperador,
    perteneceAlComercio,
    operarioVinculado: operarioQuery.data ?? null,
    operadorVinculado: isOperador && Boolean(operarioQuery.data),
    puedeCrearPartes: isAdmin || (isOperador && Boolean(operarioQuery.data)),
  };
}
