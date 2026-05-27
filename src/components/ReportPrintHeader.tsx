import { useComercio } from "@/hooks/useComercio";

export const ReportPrintHeader = () => {
  const { comercio } = useComercio();
  const direccion = [comercio?.calle, comercio?.numero, comercio?.localidad, comercio?.provincia]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mb-6 hidden items-center justify-between border-b pb-4 print:flex">
      <div className="flex items-center gap-4">
        {comercio?.logo_url?.trim() && (
          <img
            src={comercio.logo_url}
            alt={`Logo de ${comercio.nombre_comercio}`}
            className="h-16 w-32 object-contain object-left"
          />
        )}
        <div>
          <p className="text-lg font-semibold">{comercio?.nombre_comercio || "Comercio"}</p>
          {direccion && <p className="text-sm text-muted-foreground">{direccion}</p>}
        </div>
      </div>
      {comercio?.cuit && <p className="text-sm">CUIT: {comercio.cuit}</p>}
    </div>
  );
};
