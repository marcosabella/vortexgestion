import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Eye } from "lucide-react";
import { useComercio } from "@/hooks/useComercio";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoTelemetria, useCampoTelemetriaDetalle, useCampoTelemetriaImportar } from "@/hooks/useCampoTelemetria";
import { CampoTelemetriaImportador } from "@/components/campo/CampoTelemetriaImportador";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Summary = Record<string, unknown>;
const show = (value: unknown, suffix = "") => typeof value === "number" ? `${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}${suffix ? ` ${suffix}` : ""}` : "-";

function Comparison({ unit, data }: { unit: string; data: Summary }) {
  const percent = typeof data.diferencia_porcentaje === "number" ? ` (${show(data.diferencia_porcentaje, "%")})` : "";
  return <div className="rounded-md border p-3 text-sm"><strong>Comparacion {unit}</strong><p>Telemetria: {show(data.valor_telemetria, unit)}</p><p>Declarado: {show(data.valor_declarado, unit)}</p><p>Diferencia: {show(data.diferencia, unit)}{percent}</p>{data.disponible === false ? <p className="text-muted-foreground">{String(data.motivo ?? "No disponible").replaceAll("_", " ")}</p> : null}</div>;
}
function Detail({ comercioId, id, allowed }: { comercioId: string; id: string; allowed: boolean }) {
  const { estado, resumen } = useCampoTelemetriaDetalle(comercioId, id, allowed);
  const importer = useCampoTelemetriaImportar(comercioId, allowed);
  const data = (resumen.data ?? {}) as Summary;
  const comparisons = (data.comparaciones ?? {}) as Record<string, Summary>;
  return <Card><CardHeader><CardTitle>Detalle de importacion</CardTitle></CardHeader><CardContent className="space-y-4">
    {estado.isLoading || resumen.isLoading ? <p>Cargando detalle...</p> : null}
    {estado.error || resumen.error ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>No se pudo consultar el resumen oficial.</AlertDescription></Alert> : null}
    {estado.data ? <><div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div>Estado<br/><strong>{String((estado.data as Summary).estado ?? "-")}</strong></div><div>Recibidas<br/><strong>{show((estado.data as Summary).cantidad_recibida)}</strong></div><div>Proxima secuencia<br/><strong>{show((estado.data as Summary).proxima_secuencia)}</strong></div><div>Puede continuar<br/><strong>{(estado.data as Summary).puede_continuar ? "Si" : "No"}</strong></div></div>{(estado.data as Summary).puede_continuar ? <Button variant="outline" disabled={importer.finalizar.isPending} onClick={() => void importer.finalizar.mutateAsync({ id, cancelar: true })}>Cancelar importacion</Button> : null}</> : null}
    {resumen.data ? <><div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div>Duracion<br/><strong>{show(data.duracion_s, "s")}</strong></div><div>Distancia informada<br/><strong>{show(data.distancia_informada_km, "km")}</strong></div><div>Distancia geodesica<br/><strong>{show(data.distancia_geodesica_km, "km")}</strong></div><div>Horas motor<br/><strong>{show(data.horas_motor, "h")}</strong></div><div>Combustible<br/><strong>{show(data.combustible_consumido_l, "L")}</strong></div><div>Velocidad prom./max.<br/><strong>{show(data.velocidad_promedio_kmh, "km/h")} / {show(data.velocidad_maxima_kmh, "km/h")}</strong></div><div>Superficie informada<br/><strong>{show(data.superficie_informada_ha, "ha")}</strong></div><div>Muestras validas/descartadas<br/><strong>{show(data.muestras_validas)} / {show(data.muestras_descartadas)}</strong></div></div>{Array.isArray(data.advertencias) ? data.advertencias.map((warning) => <Alert key={String(warning)}><AlertTriangle className="h-4 w-4"/><AlertDescription>{String(warning).replaceAll("_", " ")}</AlertDescription></Alert>) : null}<div className="grid gap-2 md:grid-cols-3">{["ha", "hora", "km"].map((unit) => <Comparison key={unit} unit={unit} data={comparisons[unit] ?? {}}/>)}</div></> : null}
  </CardContent></Card>;
}

export default function CampoTelemetria() {
  const { comercio, isLoading } = useComercio();
  const comercioId = comercio?.id ?? null;
  const access = useCampoAccess(comercioId);
  const allowed = access.perteneceAlComercio && !access.isLoading && access.isAdmin;
  const query = useCampoTelemetria(comercioId, allowed);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [formato, setFormato] = useState("");
  const [maquinaria, setMaquinaria] = useState("");
  const [orden, setOrden] = useState("");
  const [parte, setParte] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const rows = useMemo(() => query.data?.filter((row) => {
    const text = [row.nombre_archivo, row.formato, row.origen, row.estado, row.maquinaria?.nombre].filter(Boolean).join(" ").toLowerCase();
    const date = row.created_at.slice(0, 10);
    return (!search || text.includes(search.toLowerCase())) && (!estado || row.estado === estado) && (!formato || row.formato === formato) && (!maquinaria || row.maquinaria_id === maquinaria) && (!orden || row.orden_id === orden) && (!parte || row.parte_id === parte) && (!desde || date >= desde) && (!hasta || date <= hasta);
  }) ?? [], [query.data, search, estado, formato, maquinaria, orden, parte, desde, hasta]);
  if (isLoading || access.isLoading) return <div className="p-6">Cargando telemetria...</div>;
  if (!allowed) return <div className="container mx-auto p-6"><Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>Solo los administradores del comercio pueden importar y consultar esta pantalla.</AlertDescription></Alert></div>;
  const options = query.data ?? [];
  return <div className="container mx-auto space-y-6 p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h1 className="flex items-center gap-2 text-2xl font-bold"><Activity/>Telemetria</h1><span className="text-sm text-muted-foreground">Datos normalizados por archivo</span></div><CampoTelemetriaImportador comercioId={comercioId!} allowed={allowed}/><Card><CardHeader><CardTitle>Importaciones</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 md:grid-cols-4"><input className="rounded-md border bg-background p-2" placeholder="Buscar archivo, maquinaria u origen" value={search} onChange={(event) => setSearch(event.target.value)}/><select className="rounded-md border bg-background p-2" value={maquinaria} onChange={(event) => setMaquinaria(event.target.value)}><option value="">Toda maquinaria</option>{options.map((row) => <option key={row.maquinaria_id} value={row.maquinaria_id}>{row.maquinaria?.nombre ?? "Maquinaria"}</option>)}</select><select className="rounded-md border bg-background p-2" value={estado} onChange={(event) => setEstado(event.target.value)}><option value="">Todos los estados</option><option value="iniciada">Iniciada</option><option value="cargando">Cargando</option><option value="finalizada">Finalizada</option><option value="cancelada">Cancelada</option></select><select className="rounded-md border bg-background p-2" value={formato} onChange={(event) => setFormato(event.target.value)}><option value="">Todos los formatos</option><option value="csv">CSV</option><option value="gpx">GPX</option></select><select className="rounded-md border bg-background p-2" value={orden} onChange={(event) => setOrden(event.target.value)}><option value="">Toda orden</option>{options.filter((row) => row.orden_id).map((row) => <option key={row.orden_id} value={row.orden_id!}>Orden vinculada</option>)}</select><select className="rounded-md border bg-background p-2" value={parte} onChange={(event) => setParte(event.target.value)}><option value="">Todo parte</option>{options.filter((row) => row.parte_id).map((row) => <option key={row.parte_id} value={row.parte_id!}>Parte vinculado</option>)}</select><input className="rounded-md border bg-background p-2" type="date" value={desde} onChange={(event) => setDesde(event.target.value)} aria-label="Desde"/><input className="rounded-md border bg-background p-2" type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} aria-label="Hasta"/></div>{query.isLoading ? <p>Cargando importaciones...</p> : null}{query.error ? <p className="text-destructive">No se pudieron cargar las importaciones.</p> : null}{!query.isLoading && !query.error && rows.length === 0 ? <p className="text-muted-foreground">No hay importaciones para los filtros elegidos.</p> : null}<div className="grid gap-3 md:hidden">{rows.map((row) => <Card key={row.id}><CardContent className="space-y-2 p-4 text-sm"><strong>{row.maquinaria?.nombre ?? "Maquinaria"}</strong><p>{row.formato.toUpperCase()} - {row.origen} - {row.cantidad_muestras} muestras</p><Badge>{row.estado}</Badge><Button size="sm" variant="outline" onClick={() => setSelected(row.id)}><Eye className="mr-2 h-4 w-4"/>Ver detalle</Button></CardContent></Card>)}</div><div className="hidden overflow-x-auto md:block">{rows.map((row) => <div className="grid grid-cols-6 items-center border-b py-3 text-sm" key={row.id}><span>{row.maquinaria?.nombre ?? "Maquinaria"}</span><span>{row.formato.toUpperCase()}</span><span>{row.origen}</span><span>{row.cantidad_muestras}</span><Badge className="w-fit">{row.estado}</Badge><Button size="sm" variant="outline" className="w-fit" onClick={() => setSelected(row.id)}>Detalle</Button></div>)}</div></CardContent></Card>{selected ? <Detail comercioId={comercioId!} id={selected} allowed={allowed}/> : null}</div>;
}
