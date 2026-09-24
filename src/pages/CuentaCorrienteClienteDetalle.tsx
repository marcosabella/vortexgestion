import { useMemo, useState } from "react";
import { FileDown, MessageCircle, Plus, Printer, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { PagoClienteMultipleDialog } from "@/components/PagoClienteMultipleDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComercio } from "@/hooks/useComercio";
import { useCuentaCorriente } from "@/hooks/useCuentaCorriente";
import { useToast } from "@/hooks/use-toast";
import { buildCuentaCorrientePdfFile, buildCuentaCorrienteWhatsAppMessage } from "@/utils/cuentaCorrientePdf";
import { formatCuentaCorrienteMovimiento } from "@/utils/cuentaCorrientePresentation";

const moneyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const money = (value: number) => moneyFormatter.format(Math.abs(value));
const formatPreviousDate = (value: string) => {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return format(date, "dd/MM/yyyy");
};
const downloadFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
const whatsappPhone = (phone?: string) => {
  if (!phone) return "";
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+") || digits.startsWith("54")) return digits;
  return `54${digits}`;
};

export default function CuentaCorrienteClienteDetalle() {
  const navigate = useNavigate();
  const { clienteId = "" } = useParams();
  const { toast } = useToast();
  const { comercio } = useComercio();
  const {
    useResumenCuentaCorriente,
    useMovimientosByCliente,
    deleteMovimiento,
    deleteVentaFromCuenta,
    eliminarPagoCliente,
  } = useCuentaCorriente();
  const resumenQuery = useResumenCuentaCorriente();
  const movimientosQuery = useMovimientosByCliente(clienteId || null);
  const [filtrarPeriodo, setFiltrarPeriodo] = useState(false);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  const resumen = resumenQuery.data?.find((item) => item.cliente_id === clienteId);
  const movimientos = useMemo(() => movimientosQuery.data || [], [movimientosQuery.data]);
  const rangoInvalido = filtrarPeriodo && Boolean(fechaDesde && fechaHasta && fechaDesde > fechaHasta);
  const detallePeriodo = useMemo(() => {
    const ordered = [...movimientos].sort((a, b) => {
      const dateDifference = new Date(a.fecha_movimiento).getTime() - new Date(b.fecha_movimiento).getTime();
      return dateDifference || a.id.localeCompare(b.id);
    });
    let saldoAnterior = 0;
    let totalDebitos = 0;
    let totalCreditos = 0;
    const movimientosPeriodo = [];

    for (const movimiento of ordered) {
      const fecha = format(new Date(movimiento.fecha_movimiento), "yyyy-MM-dd");
      const monto = Number(movimiento.monto || 0);
      const variacion = movimiento.tipo_movimiento === "debito" ? monto : -monto;
      if (filtrarPeriodo && fechaDesde && fecha < fechaDesde) {
        saldoAnterior += variacion;
        continue;
      }
      if (filtrarPeriodo && fechaHasta && fecha > fechaHasta) continue;
      movimientosPeriodo.push(movimiento);
      if (movimiento.tipo_movimiento === "debito") totalDebitos += monto;
      else totalCreditos += monto;
    }

    let saldoAcumulado = filtrarPeriodo && fechaDesde ? saldoAnterior : 0;
    const movimientosConSaldo = movimientosPeriodo.map((movimiento) => {
      const monto = Number(movimiento.monto || 0);
      saldoAcumulado += movimiento.tipo_movimiento === "debito" ? monto : -monto;
      return { movimiento, saldoAcumulado };
    });
    return {
      saldoAnterior: filtrarPeriodo && fechaDesde ? saldoAnterior : 0,
      totalDebitos,
      totalCreditos,
      saldoFinal: saldoAcumulado,
      movimientos: movimientosPeriodo,
      movimientosConSaldo,
    };
  }, [fechaDesde, fechaHasta, filtrarPeriodo, movimientos]);

  const resumenPdf = resumen ? {
    ...resumen,
    total_debitos: detallePeriodo.totalDebitos,
    total_creditos: detallePeriodo.totalCreditos,
    saldo_actual: detallePeriodo.saldoFinal,
    ultimo_movimiento: detallePeriodo.movimientos.at(-1)?.fecha_movimiento || resumen.ultimo_movimiento,
  } : null;
  const pdfOptions = {
    comercio,
    saldoInicial: detallePeriodo.saldoAnterior,
    fechaDesde: filtrarPeriodo ? fechaDesde || undefined : undefined,
    fechaHasta: filtrarPeriodo ? fechaHasta || undefined : undefined,
  };

  const openPdf = async () => {
    if (!resumenPdf || rangoInvalido) return;
    const file = await buildCuentaCorrientePdfFile(resumenPdf, detallePeriodo.movimientos, pdfOptions);
    const url = URL.createObjectURL(file);
    const popup = window.open(url, "_blank");
    if (!popup) {
      URL.revokeObjectURL(url);
      toast({ title: "No se pudo abrir el PDF", description: "Revisá si el navegador bloqueó la ventana emergente.", variant: "destructive" });
      return;
    }
    popup.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const exportPdf = async () => {
    if (!resumenPdf || rangoInvalido) return;
    downloadFile(await buildCuentaCorrientePdfFile(resumenPdf, detallePeriodo.movimientos, pdfOptions));
  };
  const sendWhatsApp = async () => {
    if (!resumenPdf || rangoInvalido) return;
    const file = await buildCuentaCorrientePdfFile(resumenPdf, detallePeriodo.movimientos, pdfOptions);
    const message = buildCuentaCorrienteWhatsAppMessage(resumenPdf, detallePeriodo.movimientos, pdfOptions);
    const shareData: ShareData = { title: `Resumen cuenta corriente ${resumenPdf.cliente_nombre} ${resumenPdf.cliente_apellido}`, text: message, files: [file] };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("No se pudo compartir el resumen de cuenta corriente:", error);
    }
    downloadFile(file);
    const phone = whatsappPhone(resumenPdf.cliente_telefono);
    window.open(phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    toast({ title: "Resumen generado", description: "Se descargó el PDF para adjuntarlo al chat de WhatsApp." });
  };

  const loading = resumenQuery.isLoading || movimientosQuery.isLoading;
  if (loading) return <div className="container mx-auto p-6"><p className="py-12 text-center">Cargando cuenta corriente…</p></div>;
  if (resumenQuery.error || movimientosQuery.error) return <div className="container mx-auto space-y-4 p-6"><Button variant="outline" onClick={() => navigate("/cuenta-corriente")}>Volver al listado</Button><div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive">No se pudo cargar la cuenta corriente del cliente.</div></div>;
  if (!resumen) return <div className="container mx-auto space-y-4 p-6"><Button variant="outline" onClick={() => navigate("/cuenta-corriente")}>Volver al listado</Button><p>No se encontró el cliente solicitado.</p></div>;

  const saldo = Number(resumen.saldo_actual);
  const clientName = `${resumen.cliente_nombre} ${resumen.cliente_apellido}`.trim();
  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div><h1 className="text-3xl font-bold">Cuenta corriente — {clientName}</h1><p className="text-muted-foreground">Movimientos y pagos asociados al cliente.</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="print" onClick={openPdf} disabled={rangoInvalido}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={exportPdf} disabled={rangoInvalido}><FileDown className="mr-2 h-4 w-4" />PDF</Button><Button size="sm" className="bg-[#25D366] text-white hover:bg-[#1DA851]" onClick={sendWhatsApp} disabled={rangoInvalido}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button><Button size="sm" variant="outline" onClick={() => navigate("/cuenta-corriente")}>Volver al listado</Button></div>
    </div>

    <Card><CardContent className="space-y-4 pt-6">
      <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-4">
        <div><Label>CUIT</Label><p className="text-lg">{resumen.cliente_cuit}</p></div>
        <div><Label>Total débitos</Label><p className="text-lg text-red-600">{money(resumen.total_debitos)}</p></div>
        <div><Label>Total créditos</Label><p className="text-lg text-green-600">{money(resumen.total_creditos)}</p></div>
        <div className={saldo !== 0 ? `rounded-md border p-3 ${saldo > 0 ? "border-destructive/40 bg-destructive/10" : "border-green-600/40 bg-green-50"}` : "rounded-md border p-3"}><Label>{saldo > 0 ? "Saldo deudor" : saldo < 0 ? "Saldo a favor" : "Saldo actual"}</Label><p className={`text-2xl font-bold ${saldo > 0 ? "text-destructive" : saldo < 0 ? "text-green-700" : ""}`}>{money(saldo)}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-4">
        <div className="flex min-h-10 items-center gap-2"><Checkbox id="historico-cliente" checked={filtrarPeriodo} onCheckedChange={(checked) => { const enabled = checked === true; setFiltrarPeriodo(enabled); if (enabled && !fechaHasta) setFechaHasta(format(new Date(), "yyyy-MM-dd")); }} /><Label htmlFor="historico-cliente">Histórico por movimiento</Label></div>
        {filtrarPeriodo && <><div className="flex items-center gap-2"><Label className="whitespace-nowrap" htmlFor="desde-cliente">Desde</Label><Input className="w-40" id="desde-cliente" type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} /></div><div className="flex items-center gap-2"><Label className="whitespace-nowrap" htmlFor="hasta-cliente">Hasta</Label><Input className="w-40" id="hasta-cliente" type="date" value={fechaHasta} onChange={(event) => setFechaHasta(event.target.value)} /></div></>}
        <Button className="ml-auto shrink-0" onClick={() => setPaymentOpen(true)} disabled={saldo <= 0}><Plus className="mr-2 h-4 w-4" />Registrar pago</Button>
        {rangoInvalido && <p className="w-full text-sm text-destructive">La fecha desde no puede ser posterior a la fecha hasta.</p>}
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead className="text-right">Monto</TableHead><TableHead className="text-right">Saldo acumulado</TableHead><TableHead>Observaciones</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>
        {filtrarPeriodo && fechaDesde && <TableRow className="bg-muted/60 font-medium"><TableCell /><TableCell /><TableCell colSpan={2}>Saldo correspondiente al {formatPreviousDate(fechaDesde)}</TableCell><TableCell className="text-right">{money(detallePeriodo.saldoAnterior)} {detallePeriodo.saldoAnterior > 0 ? "(Debe)" : detallePeriodo.saldoAnterior < 0 ? "(Favor)" : ""}</TableCell><TableCell colSpan={2} /></TableRow>}
        {detallePeriodo.movimientosConSaldo.map(({ movimiento, saldoAcumulado }) => {
          const presentation = formatCuentaCorrienteMovimiento(movimiento);
          return <TableRow key={movimiento.id}><TableCell>{format(new Date(movimiento.fecha_movimiento), "dd/MM/yyyy HH:mm")}</TableCell><TableCell><Badge variant={movimiento.tipo_movimiento === "debito" ? "destructive" : "default"}>{movimiento.tipo_movimiento === "debito" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell>{presentation.concepto}{movimiento.venta_id && <div className="text-xs text-muted-foreground">Venta: {movimiento.venta?.numero_comprobante}</div>}</TableCell><TableCell className={`text-right font-semibold ${movimiento.tipo_movimiento === "debito" ? "text-red-600" : "text-green-600"}`}>{money(movimiento.monto)}</TableCell><TableCell className="text-right font-medium">{money(saldoAcumulado)} {saldoAcumulado > 0 ? "(Debe)" : saldoAcumulado < 0 ? "(Favor)" : ""}</TableCell><TableCell>{presentation.observaciones}</TableCell><TableCell className="text-right">{movimiento.venta_id && movimiento.tipo_movimiento === "debito" ? <Button variant="ghost" size="icon" className="text-destructive" disabled={Boolean(movimiento.venta?.cae?.trim())} title={movimiento.venta?.cae?.trim() ? "La venta tiene CAE y no puede eliminarse" : "Eliminar venta"} onClick={() => { if (confirm("¿Eliminar toda la venta? Esto eliminará la venta y todos sus movimientos asociados.")) deleteVentaFromCuenta(movimiento.venta_id!); }}><Trash2 className="h-4 w-4" /></Button> : <Button variant="ghost" size="icon" className="text-destructive" title={movimiento.tipo_movimiento === "credito" ? "Eliminar pago" : "Eliminar movimiento"} onClick={() => { if (confirm(movimiento.tipo_movimiento === "credito" ? "¿Eliminar este pago?" : "¿Eliminar este movimiento?")) { if (movimiento.tipo_movimiento === "credito") eliminarPagoCliente.mutate(movimiento.id); else deleteMovimiento(movimiento.id); } }}><Trash2 className="h-4 w-4" /></Button>}</TableCell></TableRow>;
        })}
        {!rangoInvalido && detallePeriodo.movimientosConSaldo.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No hay movimientos en el período seleccionado.</TableCell></TableRow>}
      </TableBody></Table></div>
    </CardContent></Card>

    {paymentOpen && <PagoClienteMultipleDialog open onOpenChange={setPaymentOpen} clienteId={clienteId} clienteNombre={clientName} clienteCuit={resumen.cliente_cuit} movimientos={movimientos} />}
  </div>;
}
