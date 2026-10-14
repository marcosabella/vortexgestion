import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { type MovimientoProveedor, useCompras } from "@/hooks/useCompras";
import { useGastosEgresos } from "@/hooks/useGastosEgresos";
import { useProveedores } from "@/hooks/useProveedores";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { MEDIOS_PAGO_GASTO } from "@/types/gasto";
import { formatNumeroComprobante } from "@/types/venta";
import { conceptoHistoricoProveedor, periodoCuentaProveedor } from "@/utils/cuentaProveedorHistorica";
import { Checkbox } from "@/components/ui/checkbox";
import { PagoProveedorMultipleDialog } from "@/components/PagoProveedorMultipleDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const providerName = (provider: { nombre?: string; apellido?: string | null; razon_social?: string | null } | null | undefined) => provider?.razon_social || [provider?.nombre, provider?.apellido].filter(Boolean).join(" ") || "Proveedor";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const currentMonthStart = () => `${today().slice(0, 7)}-01`;
const formatPreviousDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return format(date, "dd/MM/yyyy");
};
const paymentMethods = ["contado", "transferencia", "tarjeta"];

export default function CuentaCorrienteProveedorDetalle() {
  const navigate = useNavigate();
  const { proveedorId = "" } = useParams();
  const {
    movimientos, error: movimientosError, editarPago, eliminarPago,
    editarPagoGasto, eliminarPagoGasto, eliminarPagoCheque, isLoading,
  } = useCompras({ proveedorId, cargarCompras: false, cargarFacturas: false });
  const { data: gastos = [], isLoading: gastosLoading } = useGastosEgresos(undefined, undefined, proveedorId);
  const { data: proveedores = [], isLoading: proveedoresLoading } = useProveedores(proveedorId);
  const { data: afipConfig } = useAfipConfig();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<MovimientoProveedor | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<MovimientoProveedor | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transferencia");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [filtrarPeriodo, setFiltrarPeriodo] = useState(false);
  const [fechaDesde, setFechaDesde] = useState(currentMonthStart);
  const [fechaHasta, setFechaHasta] = useState(today);

  const provider = proveedores.find((item) => item.id === proveedorId);
  const providerMovements = useMemo(() => movimientos.filter((movement) => movement.proveedor_id === proveedorId), [movimientos, proveedorId]);
  const fechaDesdeAplicada = filtrarPeriodo ? fechaDesde : currentMonthStart();
  const fechaHastaAplicada = filtrarPeriodo ? fechaHasta : "";
  const rangoInvalido = filtrarPeriodo && Boolean(fechaDesde && fechaHasta && fechaDesde > fechaHasta);
  const detallePeriodo = useMemo(() => periodoCuentaProveedor(providerMovements, fechaDesdeAplicada, fechaHastaAplicada), [providerMovements, fechaDesdeAplicada, fechaHastaAplicada]);
  const providerMovementsWithBalance = rangoInvalido ? [] : detallePeriodo.movimientos;
  const providerExpenses = gastos.filter((expense) => expense.proveedor_id === proveedorId);
  const debits = providerMovements.filter((item) => item.tipo === "deuda").reduce((sum, item) => sum + Number(item.monto), 0);
  const credits = providerMovements.filter((item) => item.tipo === "pago").reduce((sum, item) => sum + Number(item.monto), 0);
  const balance = debits - credits;
  const hasPendingDocuments = balance > 0;
  const expensePaymentLabel = (value: string) => MEDIOS_PAGO_GASTO.find((item) => item.value === value)?.label || value;

  const openNewPayment = () => setPaymentOpen(true);
  const openEditPayment = (movement: MovimientoProveedor) => {
    setEditingPayment(movement);
    setAmount(String(movement.monto)); setMethod(movement.medio_pago || "transferencia"); setDate(movement.fecha); setNotes(movement.observaciones || "");
  };
  const closeEditPayment = () => setEditingPayment(null);
  const saveEditPayment = () => {
    if (!editingPayment) return;
    const values = { monto: Number(amount), medioPago: method, fecha: date, observaciones: notes };
    if (editingPayment.gasto_egreso_id) editarPagoGasto.mutate({ movimientoId: editingPayment.id, ...values }, { onSuccess: closeEditPayment });
    else editarPago.mutate({ movimientoId: editingPayment.id, ...values }, { onSuccess: closeEditPayment });
  };
  const deletePayment = () => {
    if (!deletingPayment) return;
    const options = { onSuccess: () => setDeletingPayment(null) };
    if (deletingPayment.cheque_id) eliminarPagoCheque.mutate(deletingPayment.id, options);
    else if (deletingPayment.gasto_egreso_id) eliminarPagoGasto.mutate(deletingPayment.id, options);
    else eliminarPago.mutate(deletingPayment.id, options);
  };
  const paymentPending = editarPago.isPending || editarPagoGasto.isPending;
  const deletingPending = eliminarPago.isPending || eliminarPagoGasto.isPending || eliminarPagoCheque.isPending;
  const loading = isLoading || gastosLoading || proveedoresLoading;

  if (loading) return <div className="container mx-auto p-6"><p className="py-12 text-center">Cargando cuenta corriente…</p></div>;
  if (movimientosError) return <div className="container mx-auto space-y-4 p-6"><Button variant="outline" onClick={() => navigate("/compras/cuenta-corriente")}>Volver al listado</Button><div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive"><p className="font-semibold">No se pudo cargar la cuenta corriente del proveedor.</p><p className="mt-1 text-sm">{movimientosError instanceof Error ? movimientosError.message : "Error desconocido de consulta."}</p></div></div>;
  if (!provider) return <div className="container mx-auto space-y-4 p-6"><Button variant="outline" onClick={() => navigate("/compras/cuenta-corriente")}>Volver al listado</Button><p>No se encontró el proveedor solicitado.</p></div>;

  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold">Cuenta corriente — {providerName(provider)}</h1><p className="text-muted-foreground">Movimientos, pagos y gastos asociados al proveedor.</p></div><Button className="shrink-0" variant="outline" onClick={() => navigate("/compras/cuenta-corriente")}>Volver al listado</Button></div>
    <Card><CardContent className="space-y-4 pt-6">
      <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-4"><div><Label>CUIT</Label><p className="text-lg">{provider.cuit}</p></div><div><Label>Total débitos</Label><p className="text-lg text-red-600">{money(debits)}</p></div><div><Label>Total créditos</Label><p className="text-lg text-green-600">{money(credits)}</p></div><div className={balance > 0 ? "rounded-md border border-destructive/40 bg-destructive/10 p-3" : "p-3"}><Label>{balance > 0 ? "Saldo Deudor" : "Saldo actual"}</Label><p className={`text-2xl font-bold ${balance > 0 ? "text-destructive" : ""}`}>{money(Math.abs(balance))}</p></div></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-4">
        <div className="flex min-h-10 items-center gap-2"><Checkbox id="historico-proveedor" checked={filtrarPeriodo} onCheckedChange={(checked) => setFiltrarPeriodo(checked === true)} /><Label htmlFor="historico-proveedor">Ver histórico</Label></div>
        {filtrarPeriodo && <><div className="flex items-center gap-2"><Label className="whitespace-nowrap" htmlFor="desde-proveedor">Desde</Label><Input className="w-40" id="desde-proveedor" type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} /></div><div className="flex items-center gap-2"><Label className="whitespace-nowrap" htmlFor="hasta-proveedor">Hasta</Label><Input className="w-40" id="hasta-proveedor" type="date" value={fechaHasta} onChange={(event) => setFechaHasta(event.target.value)} /></div></>}
        <Button className="ml-auto shrink-0" onClick={openNewPayment} disabled={!hasPendingDocuments}><Plus className="mr-2 h-4 w-4" />Registrar pago</Button>
        {rangoInvalido && <p className="w-full text-sm text-destructive">La fecha desde no puede ser posterior a la fecha hasta.</p>}
      </div>
      <Tabs defaultValue="cuenta"><TabsList className="grid h-auto w-full grid-cols-2"><TabsTrigger className="whitespace-normal" value="cuenta">Cuenta corriente</TabsTrigger><TabsTrigger className="whitespace-normal" value="gastos">Histórico de gastos y egresos</TabsTrigger></TabsList>
        <TabsContent value="cuenta"><div className="max-h-[60vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Vencimiento</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Debe</TableHead><TableHead className="text-right">Haber</TableHead><TableHead className="text-right">Saldo acumulado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody className="[&_td]:py-1">
          {fechaDesdeAplicada && !rangoInvalido && <TableRow className="bg-muted/60 font-medium"><TableCell /><TableCell /><TableCell colSpan={5}>Saldo correspondiente al {formatPreviousDate(fechaDesdeAplicada)}</TableCell><TableCell className={`text-right ${detallePeriodo.saldoAnterior > 0 ? "text-red-600" : detallePeriodo.saldoAnterior < 0 ? "text-green-600" : ""}`}>{money(Math.abs(detallePeriodo.saldoAnterior))}</TableCell><TableCell /></TableRow>}
          {!rangoInvalido && providerMovementsWithBalance.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No hay movimientos en el período seleccionado.</TableCell></TableRow>}
          {providerMovementsWithBalance.map(({ movement, accumulatedBalance }) => {
          const documentNumber = movement.factura?.numero_comprobante || movement.gasto?.numero_comprobante;
          const formattedDocumentNumber = documentNumber ? formatNumeroComprobante(documentNumber, afipConfig?.punto_venta) : "";
          const concept = movement.factura
            ? `Factura: ${formattedDocumentNumber}`
            : movement.gasto
              ? `${movement.gasto.concepto}${formattedDocumentNumber ? `: ${formattedDocumentNumber}` : ""}`
              : movement.cheque
                ? `Cheque ${movement.cheque.numero_cheque} · ${movement.cheque.banco_emisor}`
                : conceptoHistoricoProveedor(movement.observaciones) || movement.observaciones || (movement.tipo === "pago" ? "Pago" : "Movimiento");
          return <TableRow key={movement.id}><TableCell>{new Date(`${movement.fecha}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell><Badge variant={movement.tipo === "deuda" ? "destructive" : "default"}>{movement.tipo === "deuda" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell className="whitespace-nowrap">{concept}</TableCell><TableCell>{movement.factura?.fecha_vencimiento ? new Date(`${movement.factura.fecha_vencimiento}T00:00:00`).toLocaleDateString("es-AR") : "—"}</TableCell><TableCell>{movement.medio_pago || "—"}</TableCell><TableCell className="text-right font-semibold text-red-600">{movement.tipo === "deuda" ? money(Number(movement.monto)) : "—"}</TableCell><TableCell className="text-right font-semibold text-green-600">{movement.tipo === "pago" ? money(Number(movement.monto)) : "—"}</TableCell><TableCell className={`text-right font-medium ${accumulatedBalance > 0 ? "text-red-600" : accumulatedBalance < 0 ? "text-green-600" : ""}`}>{money(Math.abs(accumulatedBalance))}</TableCell><TableCell className="text-right">{movement.tipo === "pago" && <div className="flex justify-end gap-1">{!movement.cheque_id && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Modificar pago" onClick={() => openEditPayment(movement)}><Pencil className="h-3.5 w-3.5" /></Button>}<Button size="icon" variant="destructive" className="h-7 w-7" aria-label="Eliminar pago" onClick={() => setDeletingPayment(movement)}><Trash2 className="h-3.5 w-3.5" /></Button></div>}</TableCell></TableRow>;
        })}</TableBody></Table></div></TabsContent>
        <TabsContent value="gastos"><div className="max-h-[60vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead>Fecha</TableHead><TableHead>Comprobante</TableHead><TableHead>Concepto</TableHead><TableHead>Categoría</TableHead><TableHead>Medio</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{providerExpenses.length === 0 ? <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No hay gastos vinculados a este proveedor.</TableCell></TableRow> : providerExpenses.map((expense) => <TableRow key={expense.id}><TableCell>{new Date(`${expense.fecha}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell>{expense.numero_comprobante || "—"}</TableCell><TableCell>{expense.concepto}</TableCell><TableCell>{expense.categoria}</TableCell><TableCell>{expensePaymentLabel(expense.medio_pago)}</TableCell><TableCell><Badge variant={expense.estado === "pagado" ? "default" : "secondary"}>{expense.estado}</Badge></TableCell><TableCell className="text-right font-medium">{money(Number(expense.monto))}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
      </Tabs>
    </CardContent></Card>

    {paymentOpen && <PagoProveedorMultipleDialog open onOpenChange={setPaymentOpen} providerId={proveedorId} />}
    <Dialog open={!!editingPayment} onOpenChange={(open) => { if (!open) closeEditPayment(); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Modificar pago</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="space-y-2"><Label>Fecha</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
      <div className="space-y-2"><Label>Medio de pago</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Observaciones del pago</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={closeEditPayment}>Cancelar</Button><Button disabled={Number(amount) <= 0 || !date || paymentPending} onClick={saveEditPayment}>Guardar cambios</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={!!deletingPayment} onOpenChange={(open) => { if (!open) setDeletingPayment(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este pago?</AlertDialogTitle><AlertDialogDescription>El pago por {money(Number(deletingPayment?.monto || 0))} se quitará de la cuenta corriente y volverá a formar parte del saldo pendiente del {deletingPayment?.gasto_egreso_id ? "gasto" : "comprobante"}.{deletingPayment?.cheque_id ? " Se revertirán todas las imputaciones realizadas con el mismo cheque. Si es de terceros volverá a quedar disponible en cartera; si es propio, se eliminará su emisión asociada." : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deletingPending} onClick={deletePayment}>Eliminar pago</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
