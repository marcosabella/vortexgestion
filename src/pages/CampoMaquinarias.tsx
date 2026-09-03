import { Tractor } from "lucide-react";
import { CampoCatalogList } from "@/components/campo/CampoCatalogList";
import { MaquinariaForm } from "@/components/campo/MaquinariaForm";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import {
  useCampoMaquinarias,
  useSetCampoMaquinariaStatus,
} from "@/hooks/useCampoMaquinarias";
import { useComercio } from "@/hooks/useComercio";
export default function CampoMaquinarias() {
  const { comercio, isLoading } = useComercio(),
    id = comercio?.id ?? null,
    access = useCampoAccess(id),
    confirmed = access.perteneceAlComercio && !access.isLoading &&
      !access.error,
    query = useCampoMaquinarias(id, confirmed),
    status = useSetCampoMaquinariaStatus(id, confirmed && access.isAdmin);
  return (
    <CampoCatalogList
      title="Maquinarias"
      singular="maquinaria"
      icon={<Tractor className="h-7 w-7" />}
      comercioId={id}
      comercioNombre={comercio?.nombre_comercio ?? null}
      isComercioLoading={isLoading}
      access={access}
      query={query}
      searchLabel="Buscar maquinarias por nombre, código, tipo, marca, modelo, identificación o año"
      searchText={(x) =>
        [
          x.nombre,
          x.codigo_interno,
          x.tipo,
          x.marca,
          x.modelo,
          x.identificacion,
          x.anio,
        ].filter((v) => v !== null).join(" ")}
      headers={["Tipo", "Marca / modelo", "Identificación", "Año"]}
      cells={(x) => [
        x.tipo,
        [x.marca, x.modelo].filter(Boolean).join(" ") || "—",
        x.identificacion || "—",
        x.anio ?? "—",
      ]}
      setStatus={status}
      renderForm={(mode, item, done, saving) => (
        <MaquinariaForm
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
