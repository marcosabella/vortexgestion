import { Users } from "lucide-react";
import { CampoCatalogList } from "@/components/campo/CampoCatalogList";
import { OperarioForm } from "@/components/campo/OperarioForm";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import {
  useCampoOperarios,
  useSetCampoOperarioStatus,
} from "@/hooks/useCampoOperarios";
import { useComercio } from "@/hooks/useComercio";
export default function CampoOperarios() {
  const { comercio, isLoading } = useComercio(),
    id = comercio?.id ?? null,
    access = useCampoAccess(id),
    confirmed = access.perteneceAlComercio && !access.isLoading &&
      !access.error,
    query = useCampoOperarios(id, confirmed),
    status = useSetCampoOperarioStatus(id, confirmed && access.isAdmin);
  return (
    <CampoCatalogList
      title="Operarios"
      singular="operario"
      icon={<Users className="h-7 w-7" />}
      comercioId={id}
      comercioNombre={comercio?.nombre_comercio ?? null}
      isComercioLoading={isLoading}
      access={access}
      query={query}
      searchLabel="Buscar operarios por nombre, código, documento o teléfono"
      searchText={(x) =>
        [x.nombre, x.codigo_interno, x.documento, x.telefono].filter(Boolean)
          .join(" ")}
      headers={["Documento", "Teléfono"]}
      cells={(x) => [x.documento || "—", x.telefono || "—"]}
      setStatus={status}
      renderForm={(mode, item, done, saving) => (
        <OperarioForm
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
