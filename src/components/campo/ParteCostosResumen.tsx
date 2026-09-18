import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCampoCostosParte } from "@/hooks/useCampoCostos";
import { useCampoParteOperarios } from "@/hooks/useCampoParteOperarios";
import { useCampoParteMaquinarias } from "@/hooks/useCampoParteMaquinarias";
import { useCampoParteInsumos } from "@/hooks/useCampoParteInsumos";
import type { CampoOtrosCostosContext } from "@/hooks/useCampoParteOtrosCostos";
import { campoCostoCategorias, formatoCosto } from "@/utils/campoCostos";

const labels = { operarios: "Operarios", maquinarias: "Maquinarias", insumos: "Insumos", otros: "Otros costos" } as const;
const motivos: Record<string, string> = { faltan_horas: "Faltan horas", falta_snapshot: "Falta costo histórico o moneda", cantidad_invalida: "Cantidad no válida" };

export function ParteCostosResumen(x: CampoOtrosCostosContext) {
  const query = useCampoCostosParte(x.comercioId, x.ordenId, x.parteId, x.isAdmin);
  // Reutiliza las consultas operativas para nombres; todos los importes vienen de la RPC.
  const operarios = useCampoParteOperarios(x.comercioId, x.ordenId, x.parteId, x.isAdmin, x.orden, x.parte);
  const maquinarias = useCampoParteMaquinarias(x.comercioId, x.ordenId, x.parteId, x.isAdmin, x.orden, x.parte);
  const insumos = useCampoParteInsumos(x.comercioId, x.ordenId, x.parteId, x.isAdmin, x.orden, x.parte);
  if (!x.isAdmin) return null;
  const data = query.data;
  const nombres = new Map([
    ...(operarios.data?.items ?? []).map(d => [d.id, d.operario?.nombre ?? "Operario"] as const),
    ...(maquinarias.data?.items ?? []).map(d => [d.id, d.maquinaria?.nombre ?? "Maquinaria"] as const),
    ...(insumos.data ?? []).map(d => [d.id, d.insumo?.nombre ?? "Insumo"] as const),
  ]);
  return <Card><CardHeader><CardTitle>Costos internos del parte</CardTitle></CardHeader><CardContent className="space-y-5">
    {query.isPending || query.isFetching ? <p>Cargando resumen de costos...</p> : query.isError || !data || data.estado !== x.parte.estado ? <div className="space-y-2"><p className="text-destructive">No se pudo obtener un resumen actualizado de costos.</p><Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div> : <>
      <p className="text-sm text-muted-foreground">Sólo partes confirmados integran costos efectivos; los demás estados conservan costos cargados como información provisional o histórica. Se incluyen sólo detalles activos, sin conversión entre monedas.</p>
      {data.cantidad_desconocidos > 0 && <div role="status" className="rounded border border-amber-400 bg-amber-50 p-3 text-amber-900">Hay {data.cantidad_desconocidos} costos desconocidos{data.cantidad_desconocidos_sin_moneda > 0 ? ` (${data.cantidad_desconocidos_sin_moneda} sin moneda)` : ""}. Los subtotales y totales son parciales: un costo desconocido no equivale a cero.</div>}
      <div className="grid gap-3 sm:grid-cols-2">{data.totales.map(t => <div key={t.moneda} className="space-y-2 rounded-md border p-4"><h3 className="font-semibold">Total {t.moneda}</h3><p>Costo cargado / {data.estado === "confirmado" ? "confirmado" : data.estado === "anulado" || data.estado === "descartado" ? "histórico" : "provisional"}: <strong className="tabular-nums">{formatoCosto(t.subtotal_conocido, t.moneda)}</strong></p><p>Costo efectivo: <strong className="tabular-nums">{formatoCosto(t.total_efectivo_conocido, t.moneda)}</strong></p>{t.cantidad_desconocidos > 0 && <p className="text-sm text-amber-700">{t.cantidad_desconocidos} costos desconocidos en {t.moneda}.</p>}</div>)}</div>
      {campoCostoCategorias.map(categoria => {
        const detalles = data.detalles.filter(d => d.categoria === categoria), grupos = data.subtotales.filter(g => g.categoria === categoria);
        return <section key={categoria} className="space-y-3 rounded-md border p-3 sm:p-4"><h3 className="font-semibold">{labels[categoria]}</h3>
          {!detalles.length ? <p className="text-sm text-muted-foreground">Sin costos activos cargados.</p> : <>
            <div className="grid gap-3 lg:grid-cols-2">{detalles.map(d => <div key={d.id} className="space-y-1 rounded bg-muted/40 p-3 text-sm"><p className="break-words font-medium">{d.concepto || nombres.get(d.id) || labels[categoria]}</p><p>Cantidad: {d.cantidad === null ? "Desconocida" : d.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 4 })} {d.unidad ?? ""}</p><p>Costo {d.unidad === "hora" ? "por hora" : "unitario"}{categoria === "otros" ? "" : " histórico"}: {d.costo !== null && d.moneda ? formatoCosto(d.costo, d.moneda) : "Desconocido"}</p><p>Subtotal cargado: {d.subtotal !== null && d.moneda ? formatoCosto(d.subtotal, d.moneda) : "Desconocido"}</p>{d.costo_desconocido && <p className="text-amber-700">Costo desconocido: {d.motivos_desconocido.map(m => motivos[m] ?? "Datos incompletos").join(" · ") || "Datos incompletos"}.</p>}</div>)}</div>
            <div className="space-y-2 border-t pt-3">{grupos.map(g => <div key={g.moneda ?? "sin-moneda"} className="text-sm">{g.moneda ? <><p>Subtotal {g.moneda} cargado: <strong>{formatoCosto(g.subtotal_conocido, g.moneda)}</strong></p><p>Subtotal efectivo: {formatoCosto(g.total_efectivo_conocido, g.moneda)}</p></> : <p>Sin moneda: no se asigna a ARS ni USD.</p>}{g.cantidad_desconocidos > 0 && <p className="text-amber-700">{g.cantidad_desconocidos} costos desconocidos; subtotal parcial.</p>}</div>)}</div>
          </>}
        </section>;
      })}
    </>}
  </CardContent></Card>;
}
