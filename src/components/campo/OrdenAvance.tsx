import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCampoOrdenAvance, type CampoOrdenAvanceItem, type CampoOrdenAvanceLabor } from "@/hooks/useCampoOrdenAvance";
import type { CampoOrdenDetail } from "@/types/campo";

const numberFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });
const format = (value: number) => numberFormat.format(value);
const estado = {
  pendiente: { label: "Pendiente", variant: "secondary" as const },
  completo: { label: "Completo", variant: "default" as const },
  sobre_ejecutado: { label: "Sobre-ejecutado", variant: "destructive" as const },
};

function Metrics({ row }: { row: CampoOrdenAvanceItem | CampoOrdenAvanceLabor }) {
  const visual = estado[row.estado];
  return <>
    <div><span className="text-muted-foreground">Planificado:</span> {format(row.planificado)} {row.unidad}</div>
    <div><span className="text-muted-foreground">Ejecutado:</span> {format(row.ejecutado)} {row.unidad}</div>
    <div><span className="text-muted-foreground">Diferencia:</span> {row.diferencia > 0 ? "+" : ""}{format(row.diferencia)} {row.unidad}</div>
    <div className="flex items-center justify-between gap-2"><span>{format(row.porcentaje)}%</span><Badge variant={visual.variant}>{visual.label}</Badge></div>
  </>;
}

export function OrdenAvance({ comercioId, ordenId, access, orden }: { comercioId: string; ordenId: string; access: boolean; orden: CampoOrdenDetail }) {
  const query = useCampoOrdenAvance(comercioId, ordenId, access, orden);
  const data = query.data;
  return <Card>
    <CardHeader><CardTitle>Resumen de avance</CardTitle></CardHeader>
    <CardContent className="space-y-6">
      {query.isLoading ? <p className="py-6 text-center text-muted-foreground">Calculando avance...</p> : query.error ? <p className="py-6 text-center text-destructive">No se pudo cargar el resumen de avance.</p> : !data ? null : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div><p className="text-2xl font-semibold">{data.conteos.labores}</p><p className="text-sm text-muted-foreground">Labores</p></div>
          <div><p className="text-2xl font-semibold">{data.conteos.lotes}</p><p className="text-sm text-muted-foreground">Lotes planificados</p></div>
          <div><p className="text-2xl font-semibold">{data.conteos.confirmados}</p><p className="text-sm text-muted-foreground">Partes confirmados</p></div>
          <div><p className="text-2xl font-semibold">{data.conteos.borradores}</p><p className="text-sm text-muted-foreground">Partes borrador</p></div>
          <div><p className="text-2xl font-semibold">{data.conteos.anulados}</p><p className="text-sm text-muted-foreground">Partes anulados</p></div>
        </div>
        {!data.items.length ? <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">La orden todavía no tiene lotes planificados.</p> : <>
          {!data.items.some((item) => item.ejecutado > 0) && <p className="rounded-md border border-dashed p-4 text-muted-foreground">La planificación todavía no tiene ejecución confirmada.</p>}
          <section className="space-y-3"><h3 className="font-semibold">Por labor</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.labores.map((labor) => <Card key={labor.laborId}><CardContent className="space-y-2 pt-4"><p className="font-medium">{labor.labor}</p><Metrics row={labor} /></CardContent></Card>)}</div></section>
          <section className="space-y-3"><h3 className="font-semibold">Detalle por lote</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.items.map((item) => <Card key={item.asignacionId}><CardContent className="space-y-2 pt-4"><div><p className="font-medium">{item.lote}</p><p className="text-sm text-muted-foreground">{item.codigoLote ?? "Sin código"} · {item.labor}</p></div><Metrics row={item} /></CardContent></Card>)}</div></section>
        </>}
      </>}
    </CardContent>
  </Card>;
}
