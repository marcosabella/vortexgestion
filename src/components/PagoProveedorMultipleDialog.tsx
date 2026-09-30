import { useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { type ChequePropioPago, type FacturaProveedor, type PagoProveedorBorrador, useCompras } from "@/hooks/useCompras";
import { useGastosEgresos } from "@/hooks/useGastosEgresos";
import { useCheques } from "@/hooks/useCheques";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type PaymentRow = PagoProveedorBorrador & { localId: string; detail: string };
type DocumentOption = { value: string; type: "Factura" | "Gasto / egreso"; title: string; detail?: string; date: string; balance: number };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; providerId: string };

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const methodLabels: Record<PaymentRow["tipo"], string> = { contado: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cheque: "Cheque" };
const emptyOwnCheque = (name?: string | null, cuit?: string | null): ChequePropioPago => ({ numero_cheque: "", banco_emisor: "", fecha_emision: today(), fecha_vencimiento: today(), emisor_nombre: name || "", emisor_cuit: cuit || "", observaciones: "" });

export function PagoProveedorMultipleDialog({ open, onOpenChange, providerId }: Props) {
  const { movimientos = [], facturas = [], registrarPagosMultiDocumento } = useCompras({ proveedorId: providerId, cargarCompras: false });
  const { data: gastosData } = useGastosEgresos(undefined, undefined, providerId);
  const { cheques: chequesData } = useCheques();
  const { comercio } = useComercio();
  const { toast } = useToast();
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [draftValues, setDraftValues] = useState<string[]>([]);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [documentSearch, setDocumentSearch] = useState("");
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [method, setMethod] = useState<PaymentRow["tipo"]>("contado");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [chequeOpen, setChequeOpen] = useState(false);
  const [selectedChequeIds, setSelectedChequeIds] = useState<string[]>([]);
  const [ownAmount, setOwnAmount] = useState(0);
  const [ownCheque, setOwnCheque] = useState<ChequePropioPago>(emptyOwnCheque());

  const gastos = Array.isArray(gastosData) ? gastosData : [];
  const cheques = Array.isArray(chequesData) ? chequesData : [];
  const invoiceBalance = (invoice: FacturaProveedor) => roundMoney((Array.isArray(invoice.movimientos) ? invoice.movimientos : []).reduce((sum, movement) => sum + (movement.tipo === "deuda" ? Number(movement.monto) : -Number(movement.monto)), 0));
  const expenseBalance = (expenseId: string) => roundMoney(movimientos.filter((movement) => movement.gasto_egreso_id === expenseId).reduce((sum, movement) => sum + (movement.tipo === "deuda" ? Number(movement.monto) : -Number(movement.monto)), 0));
  const documents: DocumentOption[] = [
    ...facturas.filter((item) => item.proveedor_id === providerId && invoiceBalance(item) > 0).map((item) => ({ value: `invoice:${item.id}`, type: "Factura" as const, title: item.numero_comprobante, date: item.fecha, balance: invoiceBalance(item) })),
    ...gastos.filter((item) => item.proveedor_id === providerId && item.medio_pago === "cuenta_corriente" && expenseBalance(item.id) > 0).map((item) => ({ value: `expense:${item.id}`, type: "Gasto / egreso" as const, title: item.numero_comprobante || "Sin comprobante", detail: item.concepto, date: item.fecha, balance: expenseBalance(item.id) })),
  ];
  const selectedDocuments = selectedValues.map((value) => documents.find((item) => item.value === value)).filter((item): item is DocumentOption => Boolean(item));
  const search = documentSearch.trim().toLocaleLowerCase("es");
  const visibleDocuments = documents.filter((item) => !search || `${item.type} ${item.title} ${item.detail || ""}`.toLocaleLowerCase("es").includes(search));
  const debt = roundMoney(selectedDocuments.reduce((sum, item) => sum + item.balance, 0));
  const assigned = roundMoney(rows.reduce((sum, row) => sum + Number(row.monto), 0));
  const remaining = roundMoney(Math.max(debt - assigned, 0));
  const stagedChequeIds = new Set(rows.map((row) => row.cheque_id).filter(Boolean));
  const portfolioCheques = cheques.filter((cheque) => cheque.id && cheque.estado === "en_cartera" && (cheque.tipo_cheque || "tercero") === "tercero" && !cheque.movimiento_proveedor_id && !stagedChequeIds.has(cheque.id));
  const selectedPortfolioCheques = portfolioCheques.filter((cheque) => selectedChequeIds.includes(cheque.id!));
  const selectedChequeTotal = roundMoney(selectedPortfolioCheques.reduce((sum, cheque) => sum + Number(cheque.monto), 0));
  const ownComplete = Boolean(ownAmount > 0 && ownCheque.numero_cheque.trim() && ownCheque.banco_emisor.trim() && ownCheque.emisor_nombre.trim() && ownCheque.fecha_emision && ownCheque.fecha_vencimiento);
  const pending = registrarPagosMultiDocumento.isPending;

  useEffect(() => {
    if (!open) return;
    setSelectedValues([]); setDraftValues([]); setDocumentOpen(false); setDocumentSearch(""); setRows([]); setMethod("contado"); setAmount(0); setDate(today()); setNotes(""); setChequeOpen(false); setSelectedChequeIds([]); setOwnAmount(0);
    setOwnCheque(emptyOwnCheque(comercio?.nombre_comercio, comercio?.cuit));
  }, [comercio?.cuit, comercio?.nombre_comercio, open]);

  const openDocumentSelector = () => { setDraftValues(selectedValues); setDocumentSearch(""); setDocumentOpen(true); };
  const toggleDocument = (value: string, checked: boolean) => setDraftValues((current) => checked ? [...current, value] : current.filter((item) => item !== value));
  const applyDocuments = () => {
    const selectedDebt = roundMoney(draftValues.reduce((sum, value) => sum + (documents.find((item) => item.value === value)?.balance || 0), 0));
    if (selectedDebt < assigned) { toast({ title: "Selección insuficiente", description: "Los comprobantes elegidos no cubren los medios de pago ya agregados.", variant: "destructive" }); return; }
    setSelectedValues(draftValues); setDocumentOpen(false);
  };
  const addRegularPayment = () => {
    if (!selectedDocuments.length || amount <= 0 || amount > remaining) { toast({ title: "Importe inválido", description: "El importe debe ser mayor que cero y no superar el saldo restante.", variant: "destructive" }); return; }
    setRows((current) => [...current, { localId: crypto.randomUUID(), tipo: method, monto: roundMoney(amount), detail: methodLabels[method] }]); setAmount(0);
  };
  const openChequeSelector = () => {
    if (!selectedDocuments.length || remaining <= 0) { toast({ title: "Seleccioná primero uno o más comprobantes pendientes", variant: "destructive" }); return; }
    setSelectedChequeIds([]); setOwnAmount(remaining); setChequeOpen(true);
  };
  const toggleCheque = (id: string, checked: boolean) => setSelectedChequeIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
  const addThirdPartyCheques = () => {
    if (!selectedPortfolioCheques.length || selectedChequeTotal > remaining) { toast({ title: "Selección inválida", description: "Elegí cheques sin superar el saldo restante.", variant: "destructive" }); return; }
    setRows((current) => [...current, ...selectedPortfolioCheques.map((cheque): PaymentRow => ({ localId: crypto.randomUUID(), tipo: "cheque", monto: roundMoney(Number(cheque.monto)), cheque_id: cheque.id!, detail: `De terceros · N° ${cheque.numero_cheque} · ${cheque.banco_emisor}` }))]);
    setChequeOpen(false); setSelectedChequeIds([]);
  };
  const addOwnCheque = () => {
    if (!ownComplete || ownAmount > remaining) { toast({ title: "Cheque propio inválido", description: "Completá sus datos y verificá que el monto no supere el saldo restante.", variant: "destructive" }); return; }
    setRows((current) => [...current, { localId: crypto.randomUUID(), tipo: "cheque", monto: roundMoney(ownAmount), cheque_propio: { ...ownCheque }, detail: `Propio · N° ${ownCheque.numero_cheque} · ${ownCheque.banco_emisor}` }]);
    setOwnAmount(0); setOwnCheque(emptyOwnCheque(comercio?.nombre_comercio, comercio?.cuit)); setChequeOpen(false);
  };
  const submit = () => registrarPagosMultiDocumento.mutate({
    proveedorId: providerId, fecha: date, observaciones: notes,
    documentos: selectedDocuments.map((item) => item.value.startsWith("invoice:") ? { factura_id: item.value.slice(8) } : { gasto_id: item.value.slice(8) }),
    pagos: rows.map(({ localId: _localId, detail: _detail, ...row }) => ({ ...row, monto: roundMoney(row.monto) })),
  }, { onSuccess: () => onOpenChange(false) });

  return <>
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Registrar pago a proveedor</DialogTitle></DialogHeader>
      <div className="space-y-2"><Label>Comprobantes pendientes</Label><div className="rounded-md border p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{selectedDocuments.length ? `${selectedDocuments.length} comprobante${selectedDocuments.length === 1 ? "" : "s"} seleccionado${selectedDocuments.length === 1 ? "" : "s"}. La imputación seguirá el orden de selección.` : "Todavía no seleccionaste comprobantes."}</p><Button type="button" variant="outline" className="shrink-0" onClick={openDocumentSelector}><Search className="mr-2 h-4 w-4" />Seleccionar comprobantes</Button></div>{selectedDocuments.length > 0 && <div className="mt-3 space-y-1 border-t pt-3">{selectedDocuments.map((item, index) => <div key={item.value} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{index + 1}. {item.type}: <strong>{item.title}</strong></span><span className="shrink-0 font-medium">{money(item.balance)}</span></div>)}</div>}</div></div>
      <div className="grid gap-3 rounded-lg bg-muted p-4 sm:grid-cols-3"><Summary label="Deuda seleccionada" value={debt} /><Summary label="Total agregado" value={assigned} className="text-green-600" /><Summary label="Saldo restante" value={remaining} className="text-orange-600" /></div>
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto]"><div className="space-y-2"><Label>Medio de pago</Label><Select value={method} onValueChange={(value) => setMethod(value as PaymentRow["tipo"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contado">Efectivo</SelectItem><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="tarjeta">Tarjeta</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent></Select></div>{method !== "cheque" ? <div className="space-y-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} /></div> : <div className="flex items-end"><p className="pb-2 text-sm text-muted-foreground">El cheque puede abarcar varios comprobantes.</p></div>}<div className="flex items-end"><Button type="button" disabled={!selectedDocuments.length || remaining <= 0} onClick={method === "cheque" ? openChequeSelector : addRegularPayment}><Plus className="mr-2 h-4 w-4" />{method === "cheque" ? "Seleccionar cheques" : "Agregar"}</Button></div></div>
      <div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Medio</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Importe</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Todavía no agregaste medios de pago.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.localId}><TableCell>{methodLabels[row.tipo]}</TableCell><TableCell>{row.detail}</TableCell><TableCell className="text-right font-medium">{money(row.monto)}</TableCell><TableCell><Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label="Quitar medio de pago" onClick={() => setRows((current) => current.filter((item) => item.localId !== row.localId))}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Fecha</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="space-y-2"><Label>Observaciones generales</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button><Button onClick={submit} disabled={!selectedDocuments.length || rows.length === 0 || assigned > debt || pending}>Confirmar pago</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={documentOpen} onOpenChange={setDocumentOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Seleccionar comprobantes pendientes</DialogTitle></DialogHeader>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input autoFocus className="pl-9" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Buscar por número de comprobante o concepto" /></div>
      <div className="max-h-[55vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead className="w-12" /><TableHead>Tipo</TableHead><TableHead>Comprobante / concepto</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Saldo pendiente</TableHead></TableRow></TableHeader><TableBody>{visibleDocuments.map((item) => <TableRow key={item.value}><TableCell><Checkbox checked={draftValues.includes(item.value)} onCheckedChange={(value) => toggleDocument(item.value, value === true)} /></TableCell><TableCell>{item.type}</TableCell><TableCell><p className="font-medium">{item.title}</p>{item.detail && <p className="max-w-md truncate text-xs text-muted-foreground">{item.detail}</p>}</TableCell><TableCell>{new Date(`${item.date}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell className="text-right font-medium">{money(item.balance)}</TableCell></TableRow>)}{visibleDocuments.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No se encontraron comprobantes pendientes.</TableCell></TableRow>}</TableBody></Table></div>
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{draftValues.length} seleccionado{draftValues.length === 1 ? "" : "s"}</p><DialogFooter><Button type="button" variant="outline" onClick={() => setDocumentOpen(false)}>Cancelar</Button><Button type="button" disabled={!draftValues.length} onClick={applyDocuments}>Aplicar selección</Button></DialogFooter></div>
    </DialogContent></Dialog>

    <Dialog open={chequeOpen} onOpenChange={setChequeOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Agregar cheques al pago</DialogTitle></DialogHeader><div className="grid gap-3 rounded-lg bg-muted p-4 sm:grid-cols-4"><Summary label="Deuda seleccionada" value={debt} /><Summary label="Saldo disponible" value={remaining} /><Summary label="Cheques marcados" value={selectedChequeTotal} className="text-green-600" /><Summary label="Disponible luego" value={roundMoney(remaining - selectedChequeTotal)} className="text-orange-600" /></div><Tabs defaultValue="terceros"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="terceros">De terceros en cartera</TabsTrigger><TabsTrigger value="propio">Registrar propio</TabsTrigger></TabsList>
      <TabsContent value="terceros" className="space-y-4"><div className="max-h-[45vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 bg-background"><TableRow><TableHead className="w-12" /><TableHead>Número</TableHead><TableHead>Banco</TableHead><TableHead>Vencimiento</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader><TableBody>{portfolioCheques.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No hay cheques de terceros disponibles en cartera.</TableCell></TableRow> : portfolioCheques.map((cheque) => { const checked = selectedChequeIds.includes(cheque.id!); const exceeds = !checked && selectedChequeTotal + Number(cheque.monto) > remaining; return <TableRow key={cheque.id}><TableCell><Checkbox checked={checked} disabled={exceeds} onCheckedChange={(value) => toggleCheque(cheque.id!, value === true)} /></TableCell><TableCell>{cheque.numero_cheque}</TableCell><TableCell>{cheque.banco_emisor}</TableCell><TableCell>{new Date(`${cheque.fecha_vencimiento}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell className="text-right font-medium">{money(Number(cheque.monto))}</TableCell></TableRow>; })}</TableBody></Table></div><div className="flex justify-end"><Button disabled={!selectedChequeIds.length || selectedChequeTotal > remaining} onClick={addThirdPartyCheques}>Agregar cheques seleccionados</Button></div></TabsContent>
      <TabsContent value="propio" className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Número de cheque" value={ownCheque.numero_cheque} onChange={(value) => setOwnCheque((current) => ({ ...current, numero_cheque: value }))} /><Field label="Banco emisor" value={ownCheque.banco_emisor} onChange={(value) => setOwnCheque((current) => ({ ...current, banco_emisor: value }))} /><div className="space-y-2"><Label>Monto</Label><Input type="number" min="0.01" step="0.01" value={ownAmount || ""} onChange={(event) => setOwnAmount(Number(event.target.value))} /></div><Field label="Nombre del emisor" value={ownCheque.emisor_nombre} onChange={(value) => setOwnCheque((current) => ({ ...current, emisor_nombre: value }))} /><Field label="CUIT del emisor" value={ownCheque.emisor_cuit || ""} onChange={(value) => setOwnCheque((current) => ({ ...current, emisor_cuit: value }))} /><div className="space-y-2"><Label>Fecha de emisión</Label><Input type="date" value={ownCheque.fecha_emision} onChange={(event) => setOwnCheque((current) => ({ ...current, fecha_emision: event.target.value }))} /></div><div className="space-y-2"><Label>Fecha de vencimiento</Label><Input type="date" value={ownCheque.fecha_vencimiento} onChange={(event) => setOwnCheque((current) => ({ ...current, fecha_vencimiento: event.target.value }))} /></div><div className="space-y-2 sm:col-span-2"><Label>Observaciones</Label><Textarea rows={2} value={ownCheque.observaciones || ""} onChange={(event) => setOwnCheque((current) => ({ ...current, observaciones: event.target.value }))} /></div></div><div className="flex justify-end"><Button disabled={!ownComplete || ownAmount > remaining} onClick={addOwnCheque}>Agregar cheque propio</Button></div></TabsContent>
    </Tabs></DialogContent></Dialog>
  </>;
}

function Summary({ label, value, className = "" }: { label: string; value: number; className?: string }) { return <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-lg font-bold ${className}`}>{money(value)}</p></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
