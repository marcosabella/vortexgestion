import { useLayoutEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useComercio } from "@/hooks/useComercio";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { configurarIncidentes, registrarIncidente } from "@/utils/incidentes";
import type { IncidenteRegistro } from "@/types/incidente";

// Tipado local hasta regenerar los tipos con la migración aplicada.
const api = supabase as unknown as {
  rpc(name: "registrar_incidente", args: IncidenteRegistro): PromiseLike<{ error: unknown }>;
};

export function IncidentesMonitor() {
  const { user } = useAuth();
  const { comercio, isLoading } = useComercio();
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    configurarIncidentes(user && comercio && !isLoading ? {
      userId: user.id, comercioId: comercio.id, pathname,
    } : null, async (registro) => { await api.rpc("registrar_incidente", registro); });
  }, [user, comercio, isLoading, pathname]);

  useLayoutEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (event.message) registrarIncidente(event.error || event.message, "navegador");
    };
    const onRejection = (event: PromiseRejectionEvent) => registrarIncidente(event.reason, "navegador");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      configurarIncidentes(null, null);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
