import { Package } from "lucide-react";
import { CampoCatalogList } from "@/components/campo/CampoCatalogList";
import { InsumoForm } from "@/components/campo/InsumoForm";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import {
  useCampoInsumos,
  useSetCampoInsumoStatus,
} from "@/hooks/useCampoInsumos";
import { useComercio } from "@/hooks/useComercio";
import type { CampoInsumUnidad } from "@/types/campo";
const labels: Record<CampoInsumUnidad, string> = {
  litro: "Litros",
  kilogramo: "Kilogramos",
  tonelada: "Toneladas",
  unidad: "Unidades",
  bolsa: "Bolsas",
  metro: "Metros",
  dosis: "Dosis",
};
export default function CampoInsumos() {
  const { comercio, isLoading } = useComercio(),
    id = comercio?.id ?? null,
    access = useCampoAccess(id),
    confirmed = access.perteneceAlComercio && !access.isLoading &&
      !access.error,
    query = useCampoInsumos(id, confirmed),
    status = useSetCampoInsumoStatus(id, confirmed && access.isAdmin);
  return (
    <CampoCatalogList
      title="Insumos"
      singular="insumo"
      icon={<Package className="h-7 w-7" />}
      comercioId={id}
      comercioNombre={comercio?.nombre_comercio ?? null}
      isComercioLoading={isLoading}
      access={access}
      query={query}
      searchLabel="Buscar insumos por nombre, código o unidad"
      searchText={(x) =>
        [
          x.nombre,
          x.codigo_interno,
          x.unidad,
          labels[x.unidad as CampoInsumUnidad],
        ].filter(Boolean).join(" ")}
      headers={["Unidad"]}
      cells={(x) => [labels[x.unidad as CampoInsumUnidad] ?? x.unidad]}
      setStatus={status}
      renderForm={(mode, item, done, saving) => (
        <InsumoForm
          mode={mode}
          item={item}
          comercioId={id!}
          allowed={confirmed && access.isAdmin}
          onSuccess={done}
          onSaving={saving}
        />
      )}
    />
  );
}
