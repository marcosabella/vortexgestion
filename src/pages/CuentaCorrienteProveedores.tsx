import { useMemo, useState } from "react";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { type MovimientoProveedor, useCompras, type FacturaProveedor } from "@/hooks/useCompras";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const providerName = (provider: { nombre?: string; apellido?: string; razon_social?: string } | null) => provider?.razon_social || [provider?.nombre, provider?.apellido].filter(Boolean).join(" ") || "Proveedor";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const paymentMethods = ["contado", "transferencia", "tarjeta", "cheque"];

export default function CuentaCorrienteProveedores() {
  const { movimientos, facturas, registrarPago, editarPago, eliminarPago, isLoading } = useCompras();
  const [search, setSearch] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<FacturaProveedor | null>(null);
  const [editingPayment, setEditingPayment] = useState<MovimientoProveedor | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<MovimientoProveedor | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transferencia");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");

  const summaries = useMemo(() => {
    const map = new Map<string, { id: string; name: string; cuit: string; debits: number; credits: number; last: string }>();
    movimientos.forEach((movement) => {
      const row = map.get(movement.proveedor_id) || { id: movement.proveedor_id, name: providerName(movement.proveedor), cuit: movement.proveedor?.cuit || "", debits: 0, credits: 0, last: movement.fecha };
      if (movement.tipo === "deuda") row.debits += Number(movement.monto); else row.credits += Number(movement.monto);
      if (movement.fecha > row.last) row.last = movement.fecha;
      map.set(movement.proveedor_id, row);
    });
    return [...map.values()];
  }, [movimientos]);

  const filtered = summaries.filter((summary) => `${summary.name} ${summary.cuit}`.toLowerCase().includes(search.toLowerCase()));
  const selected = summaries.find((summary) => summary.id === providerId);
  const selectedMovements = movimientos.filter((movement) => movement.proveedor_id === providerId);
  const invoiceBalance = (invoice: FacturaProveedor) => invoice.movimientos.reduce((sum, movement) => sum + (movement.tipo === "deuda" ? Number(movement.monto) : -Number(movement.monto)), 0);
  const pendingInvoices = facturas.filter((invoice) => invoice.proveedor_id === providerId && invoiceBalance(invoice) > 0);

  const resetPaymentForm = () => { setAmount(""); setMethod("transferencia"); setDate(today()); setNotes(""); };
  const openNewPayment = () => { setEditingPayment(null); setPaymentInvoice(null); resetPaymentForm(); setPaymentOpen(true); };
  const selectInvoice = (invoiceId: string) => {
    const invoice = facturas.find((item) => item.id === invoiceId) || null;
    setPaymentInvoice(invoice);
    if (invoice) setAmount(String(invoiceBalance(invoice)));
  };
  const openEditPayment = (movement: MovimientoProveedor) => {
    setEditingPayment(movement);
    setPaymentInvoice(facturas.find((invoice) => invoice.id === movement.factura_id) || null);
    setAmount(String(movement.monto)); setMethod(movement.medio_pago || "transferencia"); setDate(movement.fecha); setNotes(movement.observaciones || ""); setPaymentOpen(true);
  };
  const closePayment = () => { setPaymentOpen(false); setEditingPayment(null); setPaymentInvoice(null); };
  const savePayment = () => {
    const values = { monto: Number(amount), medioPago: method, fecha: date, observaciones: notes };
    if (editingPayment) editarPago.mutate({ movimientoId: editingPayment.id, ...values }, { onSuccess: closePayment });
    else if (paymentInvoice) registrarPago.mutate({ facturaId: paymentInvoice.id, ...values }, { onSuccess: closePayment });
  };
  const paymentPending = registrarPago.isPending || editarPago.isPending;

  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <div><h1 className="text-3xl font-bold">Cuenta corriente de proveedores</h1><p className="text-muted-foreground">Consultá saldos, compras, pagos y vencimientos por proveedor.</p></div>
    <Card><CardHeader><CardTitle>Gestión de cuenta corriente</CardTitle></CardHeader><CardContent>
      <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por proveedor o CUIT" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {isLoading ? <p className="py-8 text-center">Cargando…</p> : <Tabs defaultValue="resumen"><TabsList><TabsTrigger value="resumen">Resumen por proveedor</TabsTrigger><TabsTrigger value="movimientos">Todos los movimientos</TabsTrigger></TabsList>
        <TabsContent value="resumen"><div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead>CUIT</TableHead><TableHead>Débitos</TableHead><TableHead>Créditos</TableHead><TableHead>Saldo actual</TableHead><TableHead>Último movimiento</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{filtered.map((row) => { const balance = row.debits - row.credits; return <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.cuit}</TableCell><TableCell className="text-red-600">{money(row.debits)}</TableCell><TableCell className="text-green-600">{money(row.credits)}</TableCell><TableCell><Badge variant={balance > 0 ? "destructive" : "secondary"}>{money(Math.abs(balance))}{balance > 0 ? " (Debe)" : ""}</Badge></TableCell><TableCell>{new Date(`${row.last}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell><Button size="icon" variant="outline" aria-label={`Ver cuenta de ${row.name}`} onClick={() => setProviderId(row.id)}><Eye className="h-4 w-4" /></Button></TableCell></TableRow>; })}</TableBody></Table></div></TabsContent>
        <TabsContent value="movimientos"><div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Tipo</TableHead><TableHead>Comprobante</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader><TableBody>{movimientos.map((movement) => <TableRow key={movement.id}><TableCell>{new Date(`${movement.fecha}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell>{providerName(movement.proveedor)}</TableCell><TableCell><Badge variant={movement.tipo === "deuda" ? "destructive" : "default"}>{movement.tipo === "deuda" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell>{movement.factura?.numero_comprobante || "—"}</TableCell><TableCell>{movement.medio_pago || "—"}</TableCell><TableCell className={`text-right font-medium ${movement.tipo === "deuda" ? "text-red-600" : "text-green-600"}`}>{money(Number(movement.monto))}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
      </Tabs>}
    </CardContent></Card>

    <Dialog open={!!providerId} onOpenChange={(open) => { if (!open) setProviderId(null); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Detalle de cuenta corriente — {selected?.name}</DialogTitle></DialogHeader>{selected && <>
      <div className="grid gap-3 rounded bg-muted p-4 sm:grid-cols-4"><div><Label>CUIT</Label><p className="text-lg">{selected.cuit}</p></div><div><Label>Total débitos</Label><p className="text-lg text-red-600">{money(selected.debits)}</p></div><div><Label>Total créditos</Label><p className="text-lg text-green-600">{money(selected.credits)}</p></div><div><Label>Saldo actual</Label><p className="text-lg font-bold">{money(selected.debits - selected.credits)}</p></div></div>
      <div className="flex justify-end"><Button onClick={openNewPayment} disabled={pendingInvoices.length === 0}><Plus className="mr-2 h-4 w-4" />Registrar pago</Button></div>
      {pendingInvoices.length === 0 && <p className="text-right text-sm text-muted-foreground">El proveedor no tiene facturas con saldo pendiente.</p>}
      <div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Vencimiento</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Monto</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{selectedMovements.map((movement) => <TableRow key={movement.id}><TableCell>{new Date(`${movement.fecha}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell><Badge variant={movement.tipo === "deuda" ? "destructive" : "default"}>{movement.tipo === "deuda" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell>{movement.observaciones || movement.factura?.numero_comprobante}</TableCell><TableCell>{movement.factura?.fecha_vencimiento || "—"}</TableCell><TableCell>{movement.medio_pago || "—"}</TableCell><TableCell className="text-right">{money(Number(movement.monto))}</TableCell><TableCell className="text-right">{movement.tipo === "pago" && <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label="Modificar pago" onClick={() => openEditPayment(movement)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" aria-label="Eliminar pago" onClick={() => setDeletingPayment(movement)}><Trash2 className="h-4 w-4" /></Button></div>}</TableCell></TableRow>)}</TableBody></Table></div>
    </>}</DialogContent></Dialog>

    <Dialog open={paymentOpen} onOpenChange={(open) => { if (!open) closePayment(); }}><DialogContent><DialogHeader><DialogTitle>{editingPayment ? "Modificar pago" : "Registrar pago a proveedor"}</DialogTitle></DialogHeader>
      {!editingPayment && <div className="space-y-2"><Label>Factura pendiente</Label><Select value={paymentInvoice?.id || ""} onValueChange={selectInvoice}><SelectTrigger><SelectValue placeholder="Seleccioná una factura" /></SelectTrigger><SelectContent>{pendingInvoices.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.numero_comprobante} · Saldo {money(invoiceBalance(invoice))}</SelectItem>)}</SelectContent></Select></div>}
      <div className="space-y-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="space-y-2"><Label>Fecha</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="space-y-2"><Label>Medio de pago</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Observaciones</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
      <DialogFooter><Button variant="outline" onClick={closePayment}>Cancelar</Button><Button disabled={(!editingPayment && !paymentInvoice) || Number(amount) <= 0 || !date || paymentPending} onClick={savePayment}>{editingPayment ? "Guardar cambios" : "Registrar pago"}</Button></DialogFooter>
    </DialogContent></Dialog>

    <AlertDialog open={!!deletingPayment} onOpenChange={(open) => { if (!open) setDeletingPayment(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este pago?</AlertDialogTitle><AlertDialogDescription>El pago por {money(Number(deletingPayment?.monto || 0))} se quitará de la cuenta corriente y volverá a formar parte del saldo pendiente de la factura.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={eliminarPago.isPending} onClick={() => deletingPayment && eliminarPago.mutate(deletingPayment.id, { onSuccess: () => setDeletingPayment(null) })}>Eliminar pago</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
