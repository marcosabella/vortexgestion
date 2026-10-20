import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useIsAppAdmin } from "@/hooks/useAdminComercios";
import { INCIDENTES_POR_PAGINA, useIncidentes, type IncidentesFiltros } from "@/hooks/useIncidentes";
import { incidenteModulos } from "@/utils/incidentes";
import type { IncidenteAgrupado } from "@/utils/agruparIncidentes";
import { incidenteEstados, incidenteOrigenes, type Incidente, type IncidenteEstado } from "@/types/incidente";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inicial: IncidentesFiltros = { comercioId: "", modulo: "", estado: "", desde: "", hasta: "", pagina: 0 };
const fechaHora = (value: string) => new Date(value).toLocaleString("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium",
});
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default function AdminIncidentes() {
  const { data: isAdmin, isLoading: adminLoading } = useIsAppAdmin();
  const [filtros, setFiltros] = useState(inicial);
  const [detalle, setDetalle] = useState<Incidente | null>(null);
  const [grupoDetalle, setGrupoDetalle] = useState<IncidenteAgrupado | null>(null);
  const [estado, setEstado] = useState<IncidenteEstado>("pendiente");
  const [notas, setNotas] = useState("");
  const { listado, actualizar, comercios } = useIncidentes(filtros, isAdmin === true);

  if (adminLoading) return <div className="p-8">Cargando permisos...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  const fechaInvalida = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  const total = listado.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / INCIDENTES_POR_PAGINA));
  const pagina = Math.min(filtros.pagina, paginas - 1);
  const filas = (listado.data?.incidentes ?? []).slice(pagina * INCIDENTES_POR_PAGINA, (pagina + 1) * INCIDENTES_POR_PAGINA);
  const cambiar = (campo: keyof Omit<IncidentesFiltros, "pagina">, value: string) => {
    setFiltros((actual) => ({ ...actual, [campo]: value, pagina: 0 }));
  };
  const abrir = (incidente: Incidente) => {
    actualizar.reset();
    setDetalle(incidente);
    setEstado(incidente.estado);
    setNotas(incidente.notas);
  };

  return <div className="container mx-auto space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Activity className="h-6 w-6" />Incidentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Monitoreá errores y avisos de los comercios. Fechas y horas de Argentina (UTC−3).</p>
      </div>
      <Button variant="outline" disabled={listado.isFetching || fechaInvalida} onClick={() => void listado.refetch()}>
        <RefreshCw className={`h-4 w-4 ${listado.isFetching ? "animate-spin" : ""}`} />Actualizar
      </Button>
    </div>
    <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-2"><Label htmlFor="inc-comercio">Comercio</Label>
        <select id="inc-comercio" className={selectClass} value={filtros.comercioId} onChange={(event) => cambiar("comercioId", event.target.value)}>
          <option value="">Todos los comercios</option>
          {comercios.data?.map((comercio) => <option key={comercio.id} value={comercio.id}>{comercio.nombre_comercio}</option>)}
        </select>
        {comercios.isError && <p className="text-xs text-destructive">No se pudo cargar el filtro de comercios. <button className="underline" onClick={() => void comercios.refetch()}>Reintentar</button></p>}
      </div>
      <div className="space-y-2"><Label htmlFor="inc-modulo">Módulo</Label>
        <select id="inc-modulo" className={selectClass} value={filtros.modulo} onChange={(event) => cambiar("modulo", event.target.value)}>
          <option value="">Todos los módulos</option>
          {Object.entries(incidenteModulos).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor="inc-estado">Estado</Label>
        <select id="inc-estado" className={selectClass} value={filtros.estado} onChange={(event) => cambiar("estado", event.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(incidenteEstados).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor="inc-desde">Desde</Label><Input id="inc-desde" type="date" value={filtros.desde} onChange={(event) => cambiar("desde", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="inc-hasta">Hasta</Label><Input id="inc-hasta" type="date" value={filtros.hasta} onChange={(event) => cambiar("hasta", event.target.value)} /></div>
      <div className="sm:col-span-2 lg:col-span-5"><Button size="sm" variant="ghost" onClick={() => setFiltros(inicial)}>Limpiar filtros</Button></div>
    </CardContent></Card>
    <p className="text-sm text-muted-foreground">Errores agrupados por comercio, módulo, origen, código y mensaje. Las cantidades y fechas corresponden a los filtros seleccionados.</p>
    {fechaInvalida ? <p role="alert" className="text-destructive">La fecha desde debe ser anterior o igual a la fecha hasta.</p>
      : listado.isError ? <div role="alert" className="rounded-md border border-destructive p-4 text-sm text-destructive">No se pudieron cargar los incidentes. Verificá que la migración de Incidentes esté aplicada y volvé a intentar.</div>
      : <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Fecha y hora</TableHead><TableHead>Comercio</TableHead><TableHead>Módulo</TableHead><TableHead>Origen</TableHead><TableHead>Incidente</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {listado.isLoading ? <TableRow><TableCell colSpan={7} className="h-28 text-center">Cargando incidentes...</TableCell></TableRow>
              : !filas.length ? <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">No hay incidentes para los filtros seleccionados.</TableCell></TableRow>
              : filas.map((incidente) => <TableRow key={incidente.id}>
                <TableCell className="whitespace-nowrap"><span className="block">Última: {fechaHora(incidente.creado_en)}</span>{incidente.ocurrencias.length > 1 && <span className="block text-xs text-muted-foreground">Primera: {fechaHora(incidente.primeraOcurrencia)}</span>}</TableCell>
                <TableCell className="min-w-40">{incidente.comercio?.nombre_comercio || incidente.comercio_id}</TableCell>
                <TableCell>{incidenteModulos[incidente.modulo] || incidente.modulo}</TableCell>
                <TableCell className="whitespace-nowrap">{incidenteOrigenes[incidente.origen]}</TableCell>
                <TableCell className="min-w-60 max-w-md"><p className="line-clamp-2 break-words">{incidente.mensaje}</p><Badge variant="outline" className="mt-1">{incidente.ocurrencias.length} {incidente.ocurrencias.length === 1 ? "vez" : "veces"}</Badge>{incidente.codigo && <span className="ml-2 text-xs text-muted-foreground">Código: {incidente.codigo}</span>}</TableCell>
                <TableCell><div className="flex flex-col items-start gap-1">{Object.entries(incidenteEstados).map(([key, label]) => {
                  const cantidad = incidente.ocurrencias.filter((ocurrencia) => ocurrencia.estado === key).length;
                  return cantidad > 0 && <Badge key={key} variant={key === "pendiente" ? "destructive" : "secondary"} className="whitespace-nowrap">{label}{cantidad < incidente.ocurrencias.length ? ` (${cantidad})` : ""}</Badge>;
                })}</div></TableCell>
                <TableCell><Button variant="outline" size="sm" onClick={() => { setGrupoDetalle(incidente); abrir(incidente); }}>Ver detalle</Button></TableCell>
              </TableRow>)}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
          <span>{total} incidentes agrupados · {listado.data?.totalOcurrencias ?? 0} apariciones · Página {pagina + 1} de {paginas}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pagina === 0 || listado.isFetching} onClick={() => setFiltros((actual) => ({ ...actual, pagina: pagina - 1 }))}><ChevronLeft className="h-4 w-4" />Anterior</Button>
            <Button size="sm" variant="outline" disabled={pagina + 1 >= paginas || listado.isFetching} onClick={() => setFiltros((actual) => ({ ...actual, pagina: pagina + 1 }))}>Siguiente<ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent></Card>}
    <p className="text-xs text-muted-foreground">Actualización automática cada minuto. Los registros comienzan al habilitar el monitoreo; los errores anteriores no se recuperan. Los avisos pueden incluir validaciones de uso.</p>
    <Dialog open={Boolean(detalle)} onOpenChange={(open) => { if (!open && !actualizar.isPending) setDetalle(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Detalle del incidente</DialogTitle><DialogDescription>{detalle?.comercio?.nombre_comercio} · {detalle && fechaHora(detalle.creado_en)}</DialogDescription></DialogHeader>
        {detalle && <>
          {grupoDetalle && <div className="space-y-2 text-sm">
            <p>{grupoDetalle.ocurrencias.length} apariciones · Primera: {fechaHora(grupoDetalle.primeraOcurrencia)} · Última: {fechaHora(grupoDetalle.creado_en)}</p>
            <Label htmlFor="inc-ocurrencia">Aparición a consultar</Label>
            <select id="inc-ocurrencia" className={selectClass} value={detalle.id} disabled={actualizar.isPending} onChange={(event) => {
              const ocurrencia = grupoDetalle.ocurrencias.find((item) => item.id === event.target.value);
              if (ocurrencia) setDetalle(ocurrencia);
            }}>{grupoDetalle.ocurrencias.map((item, index) => <option key={item.id} value={item.id}>{fechaHora(item.creado_en)} · {incidenteEstados[item.estado]} · #{grupoDetalle.ocurrencias.length - index}</option>)}</select>
            <p className="text-xs text-muted-foreground">El estado y las notas se aplican a las {grupoDetalle.ocurrencias.length} apariciones de este grupo incluidas en los filtros seleccionados. Consultar otra aparición no cambia el seguimiento a guardar.</p>
          </div>}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Módulo</dt><dd>{incidenteModulos[detalle.modulo] || detalle.modulo}</dd></div>
            <div><dt className="text-muted-foreground">Origen</dt><dd>{incidenteOrigenes[detalle.origen]}</dd></div>
            <div><dt className="text-muted-foreground">Pantalla</dt><dd className="break-all">{detalle.ruta}</dd></div>
            <div><dt className="text-muted-foreground">Código</dt><dd>{detalle.codigo || "Sin código"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Detalle</dt><dd className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted p-3">{detalle.mensaje}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Usuario (identificador)</dt><dd className="break-all">{detalle.user_id || "Usuario eliminado"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Última actualización</dt><dd>{fechaHora(detalle.actualizado_en)}</dd></div>
          </dl>
          <div className="space-y-2"><Label htmlFor="inc-detalle-estado">Estado</Label><select id="inc-detalle-estado" className={selectClass} disabled={actualizar.isPending} value={estado} onChange={(event) => setEstado(event.target.value as IncidenteEstado)}>{Object.entries(incidenteEstados).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="inc-notas">Notas de seguimiento</Label><Textarea id="inc-notas" maxLength={2000} disabled={actualizar.isPending} value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Diagnóstico, acciones realizadas o solución..." /></div>
          {actualizar.isError && <p role="alert" className="text-sm text-destructive">No se pudo completar el guardado del grupo. Algunas apariciones pueden haberse actualizado. Reintentá para aplicar el seguimiento a todas.</p>}
          <DialogFooter><Button variant="outline" disabled={actualizar.isPending} onClick={() => setDetalle(null)}>Cerrar</Button><Button disabled={actualizar.isPending} onClick={() => actualizar.mutate({ ids: grupoDetalle ? grupoDetalle.ocurrencias.map((item) => item.id) : [detalle.id], estado, notas }, { onSuccess: () => setDetalle(null) })}>{actualizar.isPending ? "Guardando..." : "Guardar seguimiento del grupo"}</Button></DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
