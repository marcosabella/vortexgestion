import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { type ChequeClientePago, type PagoClienteBorrador, useCuentaCorriente } from "@/hooks/useCuentaCorriente";
import type { CuentaCorriente } from "@/types/cuenta-corriente";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type PaymentRow = PagoClienteBorrador & { localId: string; detail: string };
type PendingDocument = { id: string; numero: string; fecha: string; saldo: number };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  clienteNombre: string;
  clienteCuit?: string;
  movimientos: CuentaCorriente[];
};

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const methodLabels: Record<PaymentRow["tipo"], string> = {
  contado: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
};
const emptyCheque = (clienteNombre: string, clienteCuit?: string): ChequeClientePago => ({
  numero_cheque: "",
  banco_emisor: "",
  fecha_emision: today(),
  fecha_vencimiento: today(),
  emisor_nombre: clienteNombre,
  emisor_cuit: clienteCuit || "",
  observaciones: "",
});

export function PagoClienteMultipleDialog({
  open,
  onOpenChange,
  clienteId,
  clienteNombre,
  clienteCuit,
  movimientos,
}: Props) {
  const { registrarPagosMixtos } = useCuentaCorriente();
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState("");
  const [documentOpen, setDocumentOpen] = useState(false);
  const [documentSearch, setDocumentSearch] = useState("");
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [method, setMethod] = useState<PaymentRow["tipo"]>("contado");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [chequeOpen, setChequeOpen] = useState(false);
  const [chequeAmount, setChequeAmount] = useState(0);
  const [cheque, setCheque] = useState<ChequeClientePago>(() => emptyCheque(clienteNombre, clienteCuit));

  const saldoCliente = movimientos.reduce(
    (sum, movement) => sum + (movement.tipo_movimiento === "debito" ? Number(movement.monto) : -Number(movement.monto)),
    0,
  );
  const pendingDocuments = useMemo(() => {
    const documents = new Map<string, PendingDocument>();
    for (const movement of movimientos) {
      if (!movement.venta_id || !movement.venta) continue;
      const current = documents.get(movement.venta_id) || {
        id: movement.venta_id,
        numero: movement.venta.numero_comprobante,
        fecha: movement.venta.fecha_venta || movement.fecha_movimiento,
        saldo: 0,
      };
      current.saldo += movement.tipo_movimiento === "debito" ? Number(movement.monto) : -Number(movement.monto);
      documents.set(movement.venta_id, current);
    }
    return Array.from(documents.values())
      .filter((document) => document.saldo > 0)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [movimientos]);

  const normalizedSearch = documentSearch.trim().toLocaleLowerCase("es");
  const visibleDocuments = pendingDocuments.filter((document) => !normalizedSearch || document.numero.toLocaleLowerCase("es").includes(normalizedSearch));
  const selectedDocument = pendingDocuments.find((document) => document.id === documentId) || null;
  const debt = selectedDocument ? Math.max(Math.min(selectedDocument.saldo, saldoCliente), 0) : 0;
  const assigned = rows.reduce((sum, row) => sum + Number(row.monto), 0);
  const remaining = Math.max(debt - assigned, 0);
  const chequeComplete = Boolean(
    chequeAmount > 0 && cheque.numero_cheque.trim() && cheque.banco_emisor.trim()
      && cheque.emisor_nombre.trim() && cheque.fecha_emision && cheque.fecha_vencimiento,
  );

  useEffect(() => {
    if (!open) return;
    setDocumentId("");
    setDocumentOpen(false);
    setDocumentSearch("");
    setRows([]);
    setMethod("contado");
    setAmount(0);
    setDate(today());
    setNotes("");
    setChequeOpen(false);
    setChequeAmount(0);
    setCheque(emptyCheque(clienteNombre, clienteCuit));
  }, [clienteCuit, clienteNombre, open]);

  const selectDocument = (id: string) => {
    setDocumentId(id);
    setRows([]);
    setAmount(0);
    setDocumentOpen(false);
  };
  const addRegularPayment = () => {
    if (!documentId || amount <= 0 || amount > remaining) {
      toast({ title: "Importe inválido", description: "El importe debe ser mayor que cero y no superar el saldo restante.", variant: "destructive" });
      return;
    }
    setRows((current) => [...current, { localId: crypto.randomUUID(), tipo: method, monto: amount, detail: methodLabels[method] }]);
    setAmount(0);
  };
  const openChequeForm = () => {
    if (!documentId || remaining <= 0) {
      toast({ title: "Seleccioná primero un comprobante pendiente", variant: "destructive" });
      return;
    }
    setChequeAmount(remaining);
    setCheque(emptyCheque(clienteNombre, clienteCuit));
    setChequeOpen(true);
  };
  const addCheque = () => {
    if (!chequeComplete || chequeAmount > remaining) {
      toast({ title: "Cheque inválido", description: "Completá sus datos y verificá que el importe no supere el saldo restante.", variant: "destructive" });
      return;
    }
    setRows((current) => [...current, {
      localId: crypto.randomUUID(),
      tipo: "cheque",
      monto: chequeAmount,
      cheque: { ...cheque },
      detail: `N° ${cheque.numero_cheque} · ${cheque.banco_emisor}`,
    }]);
    setChequeOpen(false);
    setChequeAmount(0);
  };
  const submit = () => {
    if (!selectedDocument) return;
    registrarPagosMixtos.mutate({
      clienteId,
      ventaId: selectedDocument.id,
      fecha: date,
      observaciones: notes,
      pagos: rows.map(({ localId: _localId, detail: _detail, ...row }) => row),
    }, { onSuccess: () => onOpenChange(false) });
  };

  return <>
    <Dialog open={open} onOpenChange={(next) => !registrarPagosMixtos.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Registrar pago del cliente</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Comprobante pendiente</Label>
          <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>{selectedDocument
              ? <><p className="font-medium">Comprobante {selectedDocument.numero}</p><p className="text-sm text-muted-foreground">Saldo imputable: {money(debt)}</p></>
              : <p className="text-sm text-muted-foreground">Todavía no seleccionaste un comprobante.</p>}
            </div>
            <Button type="button" variant="outline" className="shrink-0" onClick={() => { setDocumentSearch(""); setDocumentOpen(true); }}>
              <Search className="mr-2 h-4 w-4" />Buscar comprobante
            </Button>
          </div>
        </div>
        <div className="grid gap-3 rounded-lg bg-muted p-4 sm:grid-cols-3">
          <Summary label="Deuda seleccionada" value={debt} />
          <Summary label="Total agregado" value={assigned} className="text-green-600" />
          <Summary label="Saldo restante" value={remaining} className="text-orange-600" />
        </div>
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2"><Label>Medio de pago</Label><Select value={method} onValueChange={(value) => setMethod(value as PaymentRow["tipo"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contado">Efectivo</SelectItem><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="tarjeta">Tarjeta</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent></Select></div>
          {method !== "cheque"
            ? <div className="space-y-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} /></div>
            : <div className="flex items-end"><p className="pb-2 text-sm text-muted-foreground">El cheque recibido ingresará en cartera.</p></div>}
          <div className="flex items-end"><Button type="button" disabled={!documentId || remaining <= 0} onClick={method === "cheque" ? openChequeForm : addRegularPayment}><Plus className="mr-2 h-4 w-4" />{method === "cheque" ? "Registrar cheque" : "Agregar"}</Button></div>
        </div>
        <div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Medio</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Importe</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>{rows.length === 0
          ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Todavía no agregaste medios de pago.</TableCell></TableRow>
          : rows.map((row) => <TableRow key={row.localId}><TableCell>{methodLabels[row.tipo]}</TableCell><TableCell>{row.detail}</TableCell><TableCell className="text-right font-medium">{money(row.monto)}</TableCell><TableCell><Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => setRows((current) => current.filter((item) => item.localId !== row.localId))}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Fecha</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="space-y-2"><Label>Observaciones generales</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={registrarPagosMixtos.isPending}>Cancelar</Button><Button onClick={submit} disabled={!documentId || rows.length === 0 || assigned > debt || registrarPagosMixtos.isPending}>Confirmar pago</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={documentOpen} onOpenChange={setDocumentOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Seleccionar comprobante pendiente</DialogTitle></DialogHeader>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input autoFocus className="pl-9" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Buscar por número de comprobante" /></div>
      <div className="max-h-[55vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>Comprobante</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Saldo pendiente</TableHead><TableHead className="w-28" /></TableRow></TableHeader><TableBody>{visibleDocuments.map((document) => <TableRow key={document.id}><TableCell className="font-medium">{document.numero}</TableCell><TableCell>{new Date(document.fecha).toLocaleDateString("es-AR")}</TableCell><TableCell className="text-right font-medium">{money(Math.min(document.saldo, Math.max(saldoCliente, 0)))}</TableCell><TableCell className="text-right"><Button size="sm" onClick={() => selectDocument(document.id)}>Seleccionar</Button></TableCell></TableRow>)}{visibleDocuments.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No se encontraron comprobantes pendientes.</TableCell></TableRow>}</TableBody></Table></div>
      <DialogFooter><Button variant="outline" onClick={() => setDocumentOpen(false)}>Cerrar</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={chequeOpen} onOpenChange={setChequeOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Registrar cheque recibido</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Número de cheque" value={cheque.numero_cheque} onChange={(value) => setCheque((current) => ({ ...current, numero_cheque: value }))} /><Field label="Banco emisor" value={cheque.banco_emisor} onChange={(value) => setCheque((current) => ({ ...current, banco_emisor: value }))} /><div className="space-y-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={chequeAmount || ""} onChange={(event) => setChequeAmount(Number(event.target.value))} /></div><Field label="Nombre del emisor" value={cheque.emisor_nombre} onChange={(value) => setCheque((current) => ({ ...current, emisor_nombre: value }))} /><Field label="CUIT del emisor" value={cheque.emisor_cuit || ""} onChange={(value) => setCheque((current) => ({ ...current, emisor_cuit: value }))} /><div className="space-y-2"><Label>Fecha de emisión</Label><Input type="date" value={cheque.fecha_emision} onChange={(event) => setCheque((current) => ({ ...current, fecha_emision: event.target.value }))} /></div><div className="space-y-2"><Label>Fecha de vencimiento</Label><Input type="date" value={cheque.fecha_vencimiento} onChange={(event) => setCheque((current) => ({ ...current, fecha_vencimiento: event.target.value }))} /></div><div className="space-y-2 sm:col-span-2"><Label>Observaciones</Label><Textarea rows={2} value={cheque.observaciones || ""} onChange={(event) => setCheque((current) => ({ ...current, observaciones: event.target.value }))} /></div></div>
      <DialogFooter><Button variant="outline" onClick={() => setChequeOpen(false)}>Cancelar</Button><Button disabled={!chequeComplete || chequeAmount > remaining} onClick={addCheque}>Agregar cheque</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

function Summary({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-lg font-bold ${className}`}>{money(value)}</p></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
