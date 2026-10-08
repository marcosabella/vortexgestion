import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useComercio } from "@/hooks/useComercio";
import { useRestauranteAcceso } from "@/hooks/useRestauranteUsuarios";
import { Button } from "@/components/ui/button";

export function RestauranteAcceso({ children }: { children: ReactNode }) {
  const { comercio } = useComercio();
  const query = useRestauranteAcceso(comercio?.id);
  const location = useLocation();
  if (!comercio) return children;
  if (query.isPending) return <p className="p-6">Verificando acceso…</p>;
  if (query.error) return <div className="grid gap-3 p-6" role="alert"><p>No se pudo verificar el acceso. Se necesita instalar la actualización de usuarios de Restaurante.</p><Button onClick={() => void query.refetch()}>Reintentar</Button></div>;
  const acceso = query.data;
  if (acceso?.solo_restaurante && location.pathname !== "/seguridad") {
    if (!acceso.permisos.length) return <p className="p-6" role="alert">Tu acceso a Restaurante está desactivado. Comunicate con el administrador.</p>;
    const vista = location.pathname.split("/")[2];
    if (!location.pathname.startsWith("/restaurante/") || !acceso.permisos.includes(vista as typeof acceso.permisos[number])) {
      return <Navigate to={`/restaurante/${acceso.permisos[0]}`} replace />;
    }
  }
  return children;
}
