import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CampoClienteOption } from "@/types/campo";

export function useCampoClientes(comercioId?: string | null, hasAccess = false) {
  return useQuery({
    queryKey: ["campo", comercioId ?? null, "clientes"],
    enabled: Boolean(comercioId && hasAccess),
    queryFn: async (): Promise<CampoClienteOption[]> => {
      if (!comercioId || !hasAccess) return [];

      const { data, error } = await supabase
        .from("clientes")
        .select("id, nombre, apellido, tipo_persona")
        .eq("comercio_id", comercioId)
        .order("nombre", { ascending: true })
        .order("apellido", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
