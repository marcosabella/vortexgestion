import { EstablecimientosList } from "@/components/campo/EstablecimientosList";
import { useComercio } from "@/hooks/useComercio";

export default function CampoEstablecimientos() {
  const { comercio, isLoading } = useComercio();

  return (
    <EstablecimientosList
      comercioId={comercio?.id ?? null}
      comercioNombre={comercio?.nombre_comercio ?? null}
      isComercioLoading={isLoading}
    />
  );
}
