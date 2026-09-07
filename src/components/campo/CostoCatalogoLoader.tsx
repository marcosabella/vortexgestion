import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCampoCostosCatalogo, type CampoCostoCategoriaCatalogo } from "@/hooks/useCampoCostos";
import type { CampoCostoCatalogo } from "@/utils/campoCostos";

export function CostoCatalogoLoader({ comercioId, categoria, itemId, isAdmin, children }: {
  comercioId: string; categoria: CampoCostoCategoriaCatalogo; itemId?: string; isAdmin: boolean;
  children: (costo: CampoCostoCatalogo | null) => ReactNode;
}) {
  const query = useCampoCostosCatalogo(comercioId, categoria, isAdmin && Boolean(itemId));
  if (!isAdmin) return null;
  if (!itemId) return children(null);
  if (query.isPending || query.isFetching) return <p>Cargando costo actual...</p>;
  const costo = query.data?.get(itemId);
  if (query.isError || !costo) return <div className="space-y-3"><p>No se pudo cargar el costo actual. Reintentá antes de editar.</p><Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div>;
  return children(costo);
}
