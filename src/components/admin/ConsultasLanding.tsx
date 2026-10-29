import { useState } from "react";
import { Inbox, RefreshCw } from "lucide-react";
import { useConsultasLanding, type EstadoConsulta } from "@/hooks/useConsultasLanding";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const estados: Record<EstadoConsulta, string> = { nueva: "Nueva", contactada: "Contactada", archivada: "Archivada" };
export function ConsultasLanding() {
  const [estado, setEstado] = useState<EstadoConsulta | "todas">("nueva");
  const [pagina, setPagina] = useState(0);
  const { listado, nuevas, actualizar } = useConsultasLanding(estado, pagina);
  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg"><Inbox className="h-5 w-5" />Consultas de la landing{nuevas.data !== undefined && <Badge>{nuevas.data} nuevas</Badge>}</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">Estado
            <select className="min-h-11 rounded-md border bg-background px-3" value={estado} onChange={e => { setEstado(e.target.value as typeof estado); setPagina(0); }}>
              <option value="todas">Todas</option>{Object.entries(estados).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" disabled={listado.isFetching} onClick={() => { void listado.refetch(); void nuevas.refetch(); }}><RefreshCw aria-hidden="true" className="h-4 w-4" />Actualizar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {listado.isLoading && <p role="status">Cargando consultas…</p>}
        {listado.isError && <p role="alert" className="text-destructive">No se pudieron cargar las consultas. Verificá que la migración de la bandeja esté instalada y volvé a intentar.</p>}
        {actualizar.isError && <p role="alert" className="text-destructive">No se pudo cambiar el estado. Volvé a intentar.</p>}
        {!listado.isLoading && !listado.isError && !listado.data?.consultas.length && <p className="text-sm text-muted-foreground">No hay consultas para este filtro.</p>}
        {listado.data?.consultas.map(consulta => (
          <article key={consulta.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 break-words"><h3 className="font-semibold">{consulta.negocio}</h3><p className="text-sm">{consulta.nombre}</p><time className="text-xs text-muted-foreground" dateTime={consulta.creado_en}>{new Date(consulta.creado_en).toLocaleString("es-AR")}</time></div>
              <Badge variant="outline">{estados[consulta.estado]}</Badge>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{consulta.mensaje}</p>
            <p className="break-all text-sm">Email: {consulta.email}{consulta.telefono && <><br />Teléfono: {consulta.telefono}</>}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="sm" variant="outline"><a href={`mailto:${encodeURIComponent(consulta.email)}?subject=${encodeURIComponent("Tu consulta sobre Vortex")}`}>Responder por correo</a></Button>
              <label className="flex flex-wrap items-center gap-2 text-sm">Estado de la consulta
                <select aria-label={`Estado de la consulta de ${consulta.nombre}`} className="min-h-11 rounded-md border bg-background px-3" value={consulta.estado} disabled={actualizar.isPending} onChange={e => actualizar.mutate({ id: consulta.id, estado: e.target.value as EstadoConsulta })}>
                  {Object.entries(estados).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </div>
          </article>
        ))}
        {listado.data && listado.data.total > 20 && <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!pagina || listado.isFetching} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span className="text-sm">Página {pagina + 1} · {listado.data.total} consultas</span><Button variant="outline" disabled={(pagina + 1) * 20 >= listado.data.total || listado.isFetching} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>}
      </CardContent>
    </Card>
  );
}
