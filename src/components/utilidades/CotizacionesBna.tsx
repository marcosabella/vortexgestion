import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import Grilla from "./GrillaUtilidades";
import { BNA_FUENTE, consultarBna } from "@/utils/bna";

const pesos = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
export default function CotizacionesBna({ comercioId }: { comercioId: string }) {
  const [filtro, setFiltro] = useState("");
  const query = useQuery({ queryKey: ["utilidades-bna", comercioId], queryFn: ({ signal }) => consultarBna(signal), retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false });
  const items = query.data?.detalle.filter(item => (item.codigoMoneda+" "+item.descripcion).toLocaleLowerCase().includes(filtro.toLocaleLowerCase())) || [];
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <h2 className="text-lg font-semibold">Banco Nación · Cotización billetes</h2>
      <Button disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{query.isFetching ? "Consultando…" : "Actualizar BNA"}</Button>
      <a href={BNA_FUENTE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline">Ver sitio oficial<ExternalLink className="h-3 w-3" /></a>
      <span className="text-xs text-muted-foreground">Última publicación disponible.</span>
    </div>
    {query.isFetching && <p role="status" className="text-sm text-muted-foreground">Consultando billetes del Banco Nación…</p>}
    {query.isError && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{query.error.message}</p>}
    {query.data && !query.isFetching && !query.isError && <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"><p className="font-medium">Fecha publicada por BNA: {query.data.fecha.split("-").reverse().join("/")} · {query.data.hora}</p><p className="text-xs text-muted-foreground">Consulta realizada: {new Date(query.data.consultadoEn).toLocaleString("es-AR")}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Label htmlFor="bna-filtro">Buscar moneda</Label><Input id="bna-filtro" className="w-full sm:w-64" placeholder="USD, euro, real…" value={filtro} onChange={e=>setFiltro(e.target.value)} /></div>
      <Grilla titulo="Billetes Banco Nación" columnas={["Código", "Moneda", "Unidad cotizada", "Compra en pesos", "Venta en pesos"]} filas={items.map(item=>[item.codigoMoneda,item.descripcion,item.unidades===100?"100 unidades":"1 unidad",<span className="whitespace-nowrap">{pesos(item.compra)}</span>,<span className="whitespace-nowrap">{pesos(item.venta)}</span>])} vacia="No hay monedas que coincidan con la búsqueda." />
      <p className="text-xs text-muted-foreground">Fuente: tabla oficial de Billetes del Banco Nación. El real se publica por cada 100 unidades. Para consultar otros días, usá Ver histórico en el sitio oficial; en BCRA · Divisas podés filtrar por fecha.</p>
    </>}
  </section>;
}
