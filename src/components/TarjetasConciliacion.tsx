import { useMemo, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useConciliacionTarjetas, PagoTarjetaConciliacion } from "@/hooks/useConciliacionTarjetas";
import { useTarjetas } from "@/hooks/useTarjetas";

const currency = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value || 0);

const statusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  conciliada: "Conciliada",
  con_diferencia: "Con diferencia",
  anulada: "Anulada",
};

export const TarjetasConciliacion = () => {
  const { pagos, isLoading, registrarConciliacion, isRegistrando } = useConciliacionTarjetas();
  const { tarjetas } = useTarjetas();
  const [desde, setDesde] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tarjetaId, setTarjetaId] = useState("todas");
  const [estado, setEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [netoAcreditado, setNetoAcreditado] = useState(0);
  const [fechaAcreditacion, setFechaAcreditacion] = useState(format(new Date(), "yyyy-MM-dd"));
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const filtrados = useMemo(() => pagos.filter((pago) => {
    const fechaVenta = pago.venta?.fecha_venta?.slice(0, 10) || "";
    const coincideBusqueda = !busqueda.trim()
      || pago.venta?.numero_comprobante?.toLowerCase().includes(busqueda.toLowerCase())
      || pago.venta?.cliente_nombre?.toLowerCase().includes(busqueda.toLowerCase())
      || pago.referencia_liquidacion?.toLowerCase().includes(busqueda.toLowerCase());
    return fechaVenta >= desde
      && fechaVenta <= hasta
      && (tarjetaId === "todas" || pago.tarjeta?.id === tarjetaId)
      && (estado === "todos" || pago.estado_conciliacion === estado)
      && coincideBusqueda;
  }), [pagos, desde, hasta, tarjetaId, estado, busqueda]);

  const seleccion = useMemo(
    () => filtrados.filter((pago) => seleccionados.includes(pago.id)),
    [filtrados, seleccionados],
  );
  const seleccionables = filtrados.filter((pago) => pago.estado_conciliacion === "pendiente");
  const totalCobrado = filtrados.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
  const totalComision = filtrados.reduce((sum, pago) => sum + Number(pago.monto_comision_estimado || 0), 0);
  const totalNeto = filtrados.reduce((sum, pago) => sum + Number(pago.monto_neto_estimado || 0), 0);
  const totalPendiente = filtrados
    .filter((pago) => pago.estado_conciliacion === "pendiente")
    .reduce((sum, pago) => sum + Number(pago.monto_neto_estimado || 0), 0);

  const abrirConciliacion = (pagosSeleccionados: PagoTarjetaConciliacion[]) => {
    setSeleccionados(pagosSeleccionados.map((pago) => pago.id));
    setNetoAcreditado(pagosSeleccionados.reduce((sum, pago) => sum + Number(pago.monto_neto_estimado || 0), 0));
    setFechaAcreditacion(format(new Date(), "yyyy-MM-dd"));
    setReferencia("");
    setObservaciones("");
    setDialogOpen(true);
  };

  const guardar = async () => {
    await registrarConciliacion({
      pagos: seleccion,
      montoNetoAcreditado: netoAcreditado,
      fechaAcreditacion,
      referencia,
      observaciones,
    });
    setDialogOpen(false);
    setSeleccionados([]);
  };

  if (isLoading) return <div className="py-10 text-center text-muted-foreground">Cargando conciliaciones...</div>;

  return (
    <div className="space-y-5 pt-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cobrado con tarjetas</CardTitle></CardHeader><CardContent className="text-xl font-bold">{currency(totalCobrado)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Comisiones estimadas</CardTitle></CardHeader><CardContent className="text-xl font-bold text-destructive">-{currency(totalComision)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Neto esperado</CardTitle></CardHeader><CardContent className="text-xl font-bold">{currency(totalNeto)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pendiente de acreditar</CardTitle></CardHeader><CardContent className="text-xl font-bold text-amber-600">{currency(totalPendiente)}</CardContent></Card>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div><Label>Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><Label>Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        <div><Label>Tarjeta</Label><Select value={tarjetaId} onValueChange={setTarjetaId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas</SelectItem>{tarjetas.map((tarjeta) => <SelectItem key={tarjeta.id} value={tarjeta.id}>{tarjeta.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Estado</Label><Select value={estado} onValueChange={setEstado}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="pendiente">Pendientes</SelectItem><SelectItem value="conciliada">Conciliadas</SelectItem><SelectItem value="con_diferencia">Con diferencia</SelectItem></SelectContent></Select></div>
        <div><Label>Buscar</Label><Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Comprobante o cliente" /></div>
      </div>

      <div className="flex justify-end">
        <Button disabled={seleccion.length === 0} onClick={() => abrirConciliacion(seleccion)}>
          Registrar liquidación ({seleccion.length})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10"><Checkbox checked={seleccionables.length > 0 && seleccion.length === seleccionables.length} onCheckedChange={(checked) => setSeleccionados(checked ? seleccionables.map((p) => p.id) : [])} /></TableHead>
            <TableHead>Venta</TableHead><TableHead>Fecha</TableHead><TableHead>Tarjeta</TableHead><TableHead>Cuotas</TableHead>
            <TableHead className="text-right">Cobrado</TableHead><TableHead className="text-right">Comisión</TableHead><TableHead className="text-right">Neto esperado</TableHead><TableHead className="text-right">Neto acreditado</TableHead><TableHead className="text-right">Diferencia</TableHead><TableHead>Estado</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {filtrados.length === 0 ? <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">No hay operaciones para los filtros seleccionados</TableCell></TableRow> : filtrados.map((pago) => {
              const seleccionable = pago.estado_conciliacion === "pendiente";
              return <TableRow key={pago.id}>
                <TableCell><Checkbox disabled={!seleccionable} checked={seleccionados.includes(pago.id)} onCheckedChange={(checked) => setSeleccionados((actuales) => checked ? [...actuales, pago.id] : actuales.filter((id) => id !== pago.id))} /></TableCell>
                <TableCell className="font-medium">{pago.venta?.numero_comprobante || "-"}<div className="text-xs font-normal text-muted-foreground">{pago.venta?.cliente_nombre}</div></TableCell>
                <TableCell>{pago.venta?.fecha_venta ? format(new Date(pago.venta.fecha_venta), "dd/MM/yyyy") : "-"}</TableCell>
                <TableCell>{pago.tarjeta?.nombre || "-"}</TableCell><TableCell>{pago.cuotas || 1}</TableCell>
                <TableCell className="text-right">{currency(pago.monto)}</TableCell>
                <TableCell className="text-right">{pago.porcentaje_comision_aplicado}%<div className="text-xs text-muted-foreground">-{currency(pago.monto_comision_estimado)}</div></TableCell>
                <TableCell className="text-right font-medium">{currency(pago.monto_neto_estimado)}</TableCell>
                <TableCell className="text-right">{pago.monto_neto_acreditado == null ? "-" : <>{currency(pago.monto_neto_acreditado)}{pago.fecha_acreditacion && <div className="text-xs text-muted-foreground">{format(new Date(`${pago.fecha_acreditacion}T00:00:00`), "dd/MM/yyyy")}</div>}</>}</TableCell>
                <TableCell className="text-right">{pago.monto_neto_acreditado == null ? "-" : currency(Number(pago.monto_neto_acreditado) - Number(pago.monto_neto_estimado || 0))}</TableCell>
                <TableCell><Badge variant={pago.estado_conciliacion === "con_diferencia" ? "destructive" : pago.estado_conciliacion === "conciliada" ? "success" : "secondary"}>{statusLabel[pago.estado_conciliacion] || pago.estado_conciliacion}</Badge></TableCell>
                <TableCell><Button variant="outline" size="sm" onClick={() => abrirConciliacion([pago])}>{seleccionable ? "Conciliar" : "Editar"}</Button></TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar liquidación de tarjeta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm"><div className="flex justify-between"><span>Operaciones</span><strong>{seleccion.length}</strong></div><div className="flex justify-between"><span>Neto esperado</span><strong>{currency(seleccion.reduce((sum, pago) => sum + Number(pago.monto_neto_estimado || 0), 0))}</strong></div></div>
            {seleccion.length > 1 && <p className="text-sm text-muted-foreground">El neto acreditado se distribuirá proporcionalmente entre las operaciones seleccionadas. Todas deben pertenecer a la misma tarjeta.</p>}
            <div><Label>Neto realmente acreditado</Label><Input type="number" min="0" step="0.01" value={netoAcreditado} onChange={(e) => setNetoAcreditado(Number(e.target.value))} /></div>
            <div><Label>Fecha de acreditación</Label><Input type="date" value={fechaAcreditacion} onChange={(e) => setFechaAcreditacion(e.target.value)} /></div>
            <div><Label>Referencia de liquidación</Label><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Número o identificación del depósito" /></div>
            <div><Label>Observaciones</Label><Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={guardar} disabled={isRegistrando || seleccion.length === 0 || !fechaAcreditacion}>{isRegistrando ? "Guardando..." : "Confirmar conciliación"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
