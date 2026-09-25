import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCheques } from "@/hooks/useCheques";
import { useComercio } from "@/hooks/useComercio";
import type { ChequePropioPago, PagoProveedorBorrador } from "@/hooks/useCompras";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type CompraPagoBorrador = PagoProveedorBorrador & {
  localId: string;
  detalle: string;
};
type MetodoCompra = PagoProveedorBorrador["tipo"] | "cta_cte";

type Props = {
  total: number;
  pagos: CompraPagoBorrador[];
  onChange: (pagos: CompraPagoBorrador[]) => void;
};

const money = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const labels: Record<PagoProveedorBorrador["tipo"], string> = {
  contado: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
};

export function CompraPagosEditor({ total, pagos, onChange }: Props) {
  const { cheques = [] } = useCheques();
  const { comercio } = useComercio();
  const [metodo, setMetodo] = useState<MetodoCompra>("cta_cte");
  const [importe, setImporte] = useState(0);
  const [chequesOpen, setChequesOpen] = useState(false);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [importePropio, setImportePropio] = useState(0);
  const [chequePropio, setChequePropio] = useState<ChequePropioPago>(() => nuevoChequePropio(comercio));

  const asignado = pagos.reduce((sum, pago) => sum + Number(pago.monto), 0);
  const restante = total - asignado;
  const idsAgregados = useMemo(() => new Set(pagos.map((pago) => pago.cheque_id).filter(Boolean)), [pagos]);
  const cartera = cheques.filter((cheque) =>
    cheque.id && cheque.estado === "en_cartera" && (cheque.tipo_cheque || "tercero") === "tercero" &&
    !cheque.movimiento_proveedor_id && !idsAgregados.has(cheque.id)
  );
  const chequesSeleccionados = cartera.filter((cheque) => seleccionados.includes(cheque.id!));
  const totalSeleccionado = chequesSeleccionados.reduce((sum, cheque) => sum + Number(cheque.monto), 0);
  const propioCompleto = Boolean(importePropio > 0 && chequePropio.numero_cheque.trim() &&
    chequePropio.banco_emisor.trim() && chequePropio.emisor_nombre.trim() &&
    chequePropio.fecha_emision && chequePropio.fecha_vencimiento);

  const agregarPago = () => {
    if (metodo === "cheque" || metodo === "cta_cte" || importe <= 0 || importe > restante) return;
    onChange([...pagos, { localId: crypto.randomUUID(), tipo: metodo, monto: importe, detalle: labels[metodo] }]);
    setImporte(0);
  };
  const abrirCheques = () => {
    setSeleccionados([]);
    setImportePropio(restante);
    setChequePropio(nuevoChequePropio(comercio));
    setChequesOpen(true);
  };
  const agregarTerceros = () => {
    if (!chequesSeleccionados.length || totalSeleccionado > restante) return;
    onChange([...pagos, ...chequesSeleccionados.map((cheque): CompraPagoBorrador => ({
      localId: crypto.randomUUID(), tipo: "cheque", monto: Number(cheque.monto), cheque_id: cheque.id!,
      detalle: `De terceros · N° ${cheque.numero_cheque} · ${cheque.banco_emisor}`,
    }))]);
    setChequesOpen(false);
  };
  const agregarPropio = () => {
    if (!propioCompleto || importePropio > restante) return;
    onChange([...pagos, { localId: crypto.randomUUID(), tipo: "cheque", monto: importePropio,
      cheque_propio: { ...chequePropio }, detalle: `Propio · N° ${chequePropio.numero_cheque} · ${chequePropio.banco_emisor}` }]);
    setChequesOpen(false);
  };

  return <div className="space-y-4 rounded-lg border p-4">
    <div className="grid gap-3 rounded-lg bg-muted p-4 sm:grid-cols-3">
      <Resumen label="Total compra" value={total} />
      <Resumen label="Pagos agregados" value={asignado} className="text-green-600" />
      <Resumen label={restante >= 0 ? "Saldo en cuenta corriente" : "Exceso a corregir"} value={Math.abs(restante)} className={restante >= 0 ? "text-orange-600" : "text-destructive"} />
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-2"><Label>Medio de pago</Label>
        <Select value={metodo} onValueChange={(value) => { setMetodo(value as MetodoCompra); setImporte(0); }}>
          <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="cta_cte">Cuenta corriente</SelectItem>
            <SelectItem value="contado">Efectivo</SelectItem><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="tarjeta">Tarjeta</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
          </SelectContent></Select>
      </div>
      {metodo === "cta_cte" ? <div className="flex items-end"><p className="pb-2 text-sm text-muted-foreground">El saldo pendiente se registrará automáticamente en la cuenta corriente del proveedor.</p></div> : metodo === "cheque" ? <div className="flex items-end"><p className="pb-2 text-sm text-muted-foreground">Seleccioná uno o varios cheques propios o de terceros.</p></div> :
        <div className="space-y-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={importe || ""} onChange={(event) => setImporte(Number(event.target.value))} /></div>}
      <div className="flex items-end">{metodo === "cta_cte" ? <Button type="button" variant="outline" disabled>Sin carga adicional</Button> : <Button type="button" disabled={restante <= 0 || (metodo !== "cheque" && (importe <= 0 || importe > restante))} onClick={metodo === "cheque" ? abrirCheques : agregarPago}><Plus className="mr-2 h-4 w-4" />Agregar</Button>}</div>
    </div>
    <div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Medio</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Importe</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>
      {pagos.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Todavía no agregaste medios de pago.</TableCell></TableRow> : pagos.map((pago) => <TableRow key={pago.localId}><TableCell>{labels[pago.tipo]}</TableCell><TableCell>{pago.detalle}</TableCell><TableCell className="text-right font-medium">{money(pago.monto)}</TableCell><TableCell><Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => onChange(pagos.filter((item) => item.localId !== pago.localId))}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}
    </TableBody></Table></div>
    {restante > 0 && pagos.length > 0 && <p className="text-sm text-muted-foreground">El saldo restante se registrará como deuda en la cuenta corriente del proveedor.</p>}
    {restante < 0 && <p className="text-sm font-medium text-destructive">Los pagos superan el nuevo total de la compra. Quitá o ajustá medios de pago para continuar.</p>}

    <Dialog open={chequesOpen} onOpenChange={setChequesOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Agregar cheques a la compra</DialogTitle></DialogHeader>
      <div className="grid gap-3 rounded-lg bg-muted p-4 sm:grid-cols-3"><Resumen label="Saldo disponible" value={restante} /><Resumen label="Cheques marcados" value={totalSeleccionado} className="text-green-600" /><Resumen label="Disponible luego" value={restante - totalSeleccionado} className="text-orange-600" /></div>
      <Tabs defaultValue="terceros"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="terceros">De terceros en cartera</TabsTrigger><TabsTrigger value="propio">Registrar propio</TabsTrigger></TabsList>
        <TabsContent value="terceros" className="space-y-4"><div className="max-h-[45vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 bg-background"><TableRow><TableHead className="w-12" /><TableHead>Número</TableHead><TableHead>Banco</TableHead><TableHead>Vencimiento</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader><TableBody>
          {cartera.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No hay cheques de terceros disponibles en cartera.</TableCell></TableRow> : cartera.map((cheque) => { const checked = seleccionados.includes(cheque.id!); const exceeds = !checked && totalSeleccionado + Number(cheque.monto) > restante; return <TableRow key={cheque.id}><TableCell><Checkbox checked={checked} disabled={exceeds} onCheckedChange={(value) => setSeleccionados((current) => value === true ? [...current, cheque.id!] : current.filter((id) => id !== cheque.id))} /></TableCell><TableCell>{cheque.numero_cheque}</TableCell><TableCell>{cheque.banco_emisor}</TableCell><TableCell>{new Date(`${cheque.fecha_vencimiento}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell className="text-right font-medium">{money(Number(cheque.monto))}</TableCell></TableRow>; })}
        </TableBody></Table></div><div className="flex justify-end"><Button type="button" disabled={!seleccionados.length || totalSeleccionado > restante} onClick={agregarTerceros}>Agregar cheques seleccionados</Button></div></TabsContent>
        <TabsContent value="propio" className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Campo label="Número de cheque" value={chequePropio.numero_cheque} onChange={(value) => setChequePropio((current) => ({ ...current, numero_cheque: value }))} /><Campo label="Banco emisor" value={chequePropio.banco_emisor} onChange={(value) => setChequePropio((current) => ({ ...current, banco_emisor: value }))} /><div className="space-y-2"><Label>Monto</Label><Input type="number" min="0.01" step="0.01" value={importePropio || ""} onChange={(event) => setImportePropio(Number(event.target.value))} /></div><Campo label="Nombre del emisor" value={chequePropio.emisor_nombre} onChange={(value) => setChequePropio((current) => ({ ...current, emisor_nombre: value }))} /><Campo label="CUIT del emisor" value={chequePropio.emisor_cuit || ""} onChange={(value) => setChequePropio((current) => ({ ...current, emisor_cuit: value }))} /><div className="space-y-2"><Label>Fecha de emisión</Label><Input type="date" value={chequePropio.fecha_emision} onChange={(event) => setChequePropio((current) => ({ ...current, fecha_emision: event.target.value }))} /></div><div className="space-y-2"><Label>Fecha de vencimiento</Label><Input type="date" value={chequePropio.fecha_vencimiento} onChange={(event) => setChequePropio((current) => ({ ...current, fecha_vencimiento: event.target.value }))} /></div><div className="space-y-2 sm:col-span-2"><Label>Observaciones</Label><Textarea rows={2} value={chequePropio.observaciones || ""} onChange={(event) => setChequePropio((current) => ({ ...current, observaciones: event.target.value }))} /></div></div><div className="flex justify-end"><Button type="button" disabled={!propioCompleto || importePropio > restante} onClick={agregarPropio}>Agregar cheque propio</Button></div></TabsContent>
      </Tabs>
    </DialogContent></Dialog>
  </div>;
}

function nuevoChequePropio(comercio?: { nombre_comercio?: string | null; cuit?: string | null } | null): ChequePropioPago {
  return { numero_cheque: "", banco_emisor: "", fecha_emision: today(), fecha_vencimiento: today(), emisor_nombre: comercio?.nombre_comercio || "", emisor_cuit: comercio?.cuit || "", observaciones: "" };
}
function Resumen({ label, value, className = "" }: { label: string; value: number; className?: string }) { return <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-lg font-bold ${className}`}>{money(value)}</p></div>; }
function Campo({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
