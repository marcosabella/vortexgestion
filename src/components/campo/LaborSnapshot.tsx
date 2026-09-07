import type {
  CampoOrdenLaborListItem,
  CampoOrdenLaborLoteListItem,
} from "@/types/campo";
import {
  esMonedaCampo,
  formatoComercial,
  formatoMonetarioCampo,
  importePrevisto,
  nivelLabel,
} from "@/utils/campoComercial";

export function LaborSnapshot({ labor }: { labor: CampoOrdenLaborListItem }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">
        {labor.facturable ? "Facturable" : "No facturable"}
      </p>
      {labor.facturable && (
        <>
          <p>
            Precio snapshot: {labor.precio_unitario_snapshot === null
              ? "Sin precio"
              : esMonedaCampo(labor.moneda_snapshot)
              ? formatoMonetarioCampo(
                labor.precio_unitario_snapshot,
                labor.moneda_snapshot,
              )
              : "Moneda no disponible"}
          </p>
          <p>
            IVA snapshot: {labor.porcentaje_iva_snapshot === null
              ? "Sin IVA"
              : `${formatoComercial(labor.porcentaje_iva_snapshot)} %`}
          </p>
          <p>Origen: {nivelLabel[labor.precio_origen ?? ""] ?? "Sin origen"}</p>
          <p className="text-xs text-muted-foreground">
            Importe previsto: consultar en lotes asignados.
          </p>
        </>
      )}
    </div>
  );
}
export function LaborImportePrevisto(
  { labor, asignaciones }: {
    labor: CampoOrdenLaborListItem;
    asignaciones: CampoOrdenLaborLoteListItem[];
  },
) {
  const importe = importePrevisto(labor, asignaciones);
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <h4 className="font-medium">Importe previsto orientativo</h4>
      {"estado" in importe ? <p>{importe.estado}</p> : (
        <>
          <p>Neto: {formatoMonetarioCampo(importe.neto, importe.moneda)}</p>
          <p>IVA: {formatoMonetarioCampo(importe.iva, importe.moneda)}</p>
          <p className="font-medium">
            Total: {formatoMonetarioCampo(importe.total, importe.moneda)}
          </p>
          <p className="text-xs text-muted-foreground">
            {labor.unidad === "fijo"
              ? "Precio fijo aplicado una sola vez por labor."
              : "Cantidad planificada activa × precio snapshot."}{" "}
            Los importes no se guardan.
          </p>
        </>
      )}
    </div>
  );
}
