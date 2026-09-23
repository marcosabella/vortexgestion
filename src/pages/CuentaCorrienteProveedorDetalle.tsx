import { useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { type MovimientoProveedor, useCompras } from "@/hooks/useCompras";
import { useGastosEgresos } from "@/hooks/useGastosEgresos";
import { useProveedores } from "@/hooks/useProveedores";
import { MEDIOS_PAGO_GASTO } from "@/types/gasto";
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
const paymentMethods = ["contado", "transferencia", "tarjeta"];

export default function CuentaCorrienteProveedorDetalle() {
  const navigate = useNavigate();
  const { proveedorId = "" } = useParams();
  const {
    movimientos, editarPago, eliminarPago,
    editarPagoGasto, eliminarPagoGasto, eliminarPagoCheque, isLoading,
  } = useCompras();
  const { data: gastos = [], isLoading: gastosLoading } = useGastosEgresos();
  const { data: proveedores = [], isLoading: proveedoresLoading } = useProveedores();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<MovimientoProveedor | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<MovimientoProveedor | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transferencia");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");

  const provider = proveedores.find((item) => item.id === proveedorId);
  const providerMovements = movimientos.filter((movement) => movement.proveedor_id === proveedorId);
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
  if (!provider) return <div className="container mx-auto space-y-4 p-6"><Button variant="outline" onClick={() => navigate("/compras/cuenta-corriente")}>Volver al listado</Button><p>No se encontró el proveedor solicitado.</p></div>;

  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold">Cuenta corriente — {providerName(provider)}</h1><p className="text-muted-foreground">Movimientos, pagos y gastos asociados al proveedor.</p></div><Button className="shrink-0" variant="outline" onClick={() => navigate("/compras/cuenta-corriente")}>Volver al listado</Button></div>
    <Card><CardContent className="space-y-4 pt-6">
      <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-4"><div><Label>CUIT</Label><p className="text-lg">{provider.cuit}</p></div><div><Label>Total débitos</Label><p className="text-lg text-red-600">{money(debits)}</p></div><div><Label>Total créditos</Label><p className="text-lg text-green-600">{money(credits)}</p></div><div className={balance > 0 ? "rounded-md border border-destructive/40 bg-destructive/10 p-3" : "p-3"}><Label>{balance > 0 ? "Saldo Deudor" : "Saldo actual"}</Label><p className={`text-2xl font-bold ${balance > 0 ? "text-destructive" : ""}`}>{money(Math.abs(balance))}</p></div></div>
      <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${balance > 0 ? "justify-between rounded-lg border border-destructive/40 bg-destructive/10 p-4" : "sm:justify-end"}`}>{balance > 0 && <div className="flex items-center gap-3 text-destructive"><AlertTriangle className="h-6 w-6 shrink-0" /><div><p className="font-semibold">Tenés un saldo pendiente de {money(balance)}</p><p className="text-sm">Podés cancelarlo total o parcialmente desde “Registrar pago”.</p></div></div>}<Button className="shrink-0" onClick={openNewPayment} disabled={!hasPendingDocuments}><Plus className="mr-2 h-4 w-4" />Registrar pago</Button></div>
      {!hasPendingDocuments && <p className="text-right text-sm text-muted-foreground">El proveedor no tiene facturas ni gastos con saldo pendiente.</p>}
      <Tabs defaultValue="cuenta"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="cuenta">Cuenta corriente</TabsTrigger><TabsTrigger value="gastos">Histórico de gastos y egresos</TabsTrigger></TabsList>
        <TabsContent value="cuenta"><div className="max-h-[60vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Vencimiento</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Monto</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{providerMovements.map((movement) => <TableRow key={movement.id}><TableCell>{new Date(`${movement.fecha}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell><Badge variant={movement.tipo === "deuda" ? "destructive" : "default"}>{movement.tipo === "deuda" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell>{movement.observaciones || movement.factura?.numero_comprobante || movement.gasto?.concepto}{movement.cheque && <div className="text-xs text-muted-foreground">Cheque {movement.cheque.tipo_cheque === "propio" ? "propio" : "de terceros"} N° {movement.cheque.numero_cheque} · {movement.cheque.banco_emisor}</div>}</TableCell><TableCell>{movement.factura?.fecha_vencimiento || "—"}</TableCell><TableCell>{movement.medio_pago || "—"}</TableCell><TableCell className="text-right">{money(Number(movement.monto))}</TableCell><TableCell className="text-right">{movement.tipo === "pago" && <div className="flex justify-end gap-1">{!movement.cheque_id && <Button size="icon" variant="ghost" aria-label="Modificar pago" onClick={() => openEditPayment(movement)}><Pencil className="h-4 w-4" /></Button>}<Button size="icon" variant="ghost" className="text-destructive" aria-label="Eliminar pago" onClick={() => setDeletingPayment(movement)}><Trash2 className="h-4 w-4" /></Button></div>}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
        <TabsContent value="gastos"><div className="max-h-[60vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead>Fecha</TableHead><TableHead>Comprobante</TableHead><TableHead>Concepto</TableHead><TableHead>Categoría</TableHead><TableHead>Medio</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{providerExpenses.length === 0 ? <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No hay gastos vinculados a este proveedor.</TableCell></TableRow> : providerExpenses.map((expense) => <TableRow key={expense.id}><TableCell>{new Date(`${expense.fecha}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell>{expense.numero_comprobante || "—"}</TableCell><TableCell>{expense.concepto}</TableCell><TableCell>{expense.categoria}</TableCell><TableCell>{expensePaymentLabel(expense.medio_pago)}</TableCell><TableCell><Badge variant={expense.estado === "pagado" ? "default" : "secondary"}>{expense.estado}</Badge></TableCell><TableCell className="text-right font-medium">{money(Number(expense.monto))}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
      </Tabs>
    </CardContent></Card>

    <PagoProveedorMultipleDialog open={paymentOpen} onOpenChange={setPaymentOpen} providerId={proveedorId} />
    <Dialog open={!!editingPayment} onOpenChange={(open) => { if (!open) closeEditPayment(); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Modificar pago</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="space-y-2"><Label>Fecha</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
      <div className="space-y-2"><Label>Medio de pago</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Observaciones del pago</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={closeEditPayment}>Cancelar</Button><Button disabled={Number(amount) <= 0 || !date || paymentPending} onClick={saveEditPayment}>Guardar cambios</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={!!deletingPayment} onOpenChange={(open) => { if (!open) setDeletingPayment(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este pago?</AlertDialogTitle><AlertDialogDescription>El pago por {money(Number(deletingPayment?.monto || 0))} se quitará de la cuenta corriente y volverá a formar parte del saldo pendiente del {deletingPayment?.gasto_egreso_id ? "gasto" : "comprobante"}.{deletingPayment?.cheque_id ? " Si es un cheque de terceros volverá a quedar disponible en cartera; si es propio, se eliminará su emisión asociada." : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deletingPending} onClick={deletePayment}>Eliminar pago</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
