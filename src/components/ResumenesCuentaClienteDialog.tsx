import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Loader2, Printer, Search } from "lucide-react";
import { useClientes } from "@/hooks/useClientes";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import type { CuentaCorriente } from "@/types/cuenta-corriente";
import { inicioMesCuentaCliente } from "@/utils/cuentaClientePeriodo";
import { agruparMovimientosClientes, coincideTipoSaldoResumen, resumenClienteAlCorte, saldoActualResumenCliente, type TipoSaldoResumen } from "@/utils/resumenesCuentaCliente";
import { buildResumenesCuentaCorrientePdfFile } from "@/utils/cuentaCorrientePdf";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const defaultCutoff = () => format(subDays(new Date(`${inicioMesCuentaCliente()}T12:00:00`), 1), "yyyy-MM-dd");

export function ResumenesCuentaClienteDialog({ movimientos, onOpenChange }: { movimientos: CuentaCorriente[]; onOpenChange: (open: boolean) => void }) {
  const { data: clientes = [], isLoading, error } = useClientes();
  const { comercio } = useComercio();
  const { toast } = useToast();
  const [fechaCorte, setFechaCorte] = useState(defaultCutoff);
  const [tipoSaldo, setTipoSaldo] = useState<TipoSaldoResumen>("deudor");
  const [selection, setSelection] = useState("todos");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const groups = useMemo(() => agruparMovimientosClientes(movimientos), [movimientos]);
  const candidates = useMemo(() => clientes.filter((client) => Boolean(client.id)).map((client) => ({ client, saldo: saldoActualResumenCliente(groups.get(client.id!) || []) })).filter((item) => coincideTipoSaldoResumen(item.saldo, tipoSaldo)), [clientes, groups, tipoSaldo]);
  const selected = candidates.filter(({ client }) => selection === "todos" || selectedIds.has(client.id!));
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const visible = candidates.filter(({ client }) => `${client.nombre} ${client.apellido} ${client.cuit}`.toLocaleLowerCase("es").includes(normalizedSearch));
  const changeType = (value: TipoSaldoResumen) => { setTipoSaldo(value); setSelectedIds(new Set()); };
  const toggle = (id: string, checked: boolean) => {
    setSelectedIds((previous) => { const next = new Set(previous); if (checked) next.add(id); else next.delete(id); return next; });
  };

  const print = async () => {
    if (pending || isLoading || error || !fechaCorte || !selected.length || !comercio?.id) return;
    // La ventana se abre desde el click para que el navegador no bloquee el PDF
    // despues de generar muchos resumenes de manera asincronica.
    const popup = window.open("about:blank", "_blank");
    if (!popup) { toast({ title: "No se pudo abrir el PDF", description: "Permití las ventanas emergentes para imprimir los resúmenes.", variant: "destructive" }); return; }
    popup.opener = null;
    popup.document.title = "Generando resúmenes";
    popup.document.body.textContent = "Generando resúmenes de cuenta corriente…";
    setPending(true);
    try {
      const reports = selected.map(({ client }) => resumenClienteAlCorte(client, groups.get(client.id!) || [], fechaCorte));
      const file = await buildResumenesCuentaCorrientePdfFile(reports, { comercio, fechaCorte });
      const url = URL.createObjectURL(file);
      if (popup.closed) { URL.revokeObjectURL(url); throw new Error("La ventana de impresión se cerró antes de terminar."); }
      popup.location.replace(url);
      const cleanup = setInterval(() => {
        if (popup.closed) { clearInterval(cleanup); URL.revokeObjectURL(url); }
      }, 1_000);
      onOpenChange(false);
    } catch (err) {
      popup.close();
      toast({ title: "No se pudieron generar los resúmenes", description: err instanceof Error ? err.message : "Error de generación del PDF.", variant: "destructive" });
    } finally { setPending(false); }
  };

  return <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Impresión masiva de resúmenes</DialogTitle><DialogDescription>Un único PDF con un resumen por cliente. El saldo incluye la fecha de corte; el detalle muestra comprobantes y pagos posteriores.</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="resumenes-fecha-corte">Fecha de corte del saldo</Label><Input id="resumenes-fecha-corte" type="date" value={fechaCorte} onChange={(event) => setFechaCorte(event.target.value)} disabled={pending} /></div>
      <div className="space-y-2"><Label htmlFor="resumenes-tipo-saldo">Clientes según saldo actual</Label><Select value={tipoSaldo} onValueChange={(value) => changeType(value as TipoSaldoResumen)} disabled={pending}><SelectTrigger id="resumenes-tipo-saldo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="deudor">Saldo deudor</SelectItem><SelectItem value="acreedor">Saldo acreedor</SelectItem><SelectItem value="todos">Todos (incluye saldo cero)</SelectItem></SelectContent></Select></div>
    </div>
    <RadioGroup value={selection} onValueChange={setSelection} className="flex flex-wrap gap-4" disabled={pending}>
      <div className="flex items-center gap-2"><RadioGroupItem id="resumenes-todos" value="todos" /><Label htmlFor="resumenes-todos">Seleccionar todos los clientes del filtro</Label></div>
      <div className="flex items-center gap-2"><RadioGroupItem id="resumenes-algunos" value="algunos" /><Label htmlFor="resumenes-algunos">Seleccionar algunos clientes</Label></div>
    </RadioGroup>
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar cliente por nombre o CUIT" value={search} onChange={(event) => setSearch(event.target.value)} disabled={pending} /></div>
    {error ? <p role="alert" className="text-sm text-destructive">No se pudieron cargar los clientes. Cerrá el modal y volvé a intentarlo.</p> : isLoading ? <p role="status">Cargando clientes…</p> : <div className="max-h-[40vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead className="w-12"><Checkbox aria-label="Seleccionar todos los clientes del filtro" checked={selection === "todos" || (candidates.length > 0 && selected.length === candidates.length) ? true : selected.length > 0 ? "indeterminate" : false} disabled={pending || selection === "todos" || !candidates.length} onCheckedChange={(checked) => setSelectedIds(checked === true ? new Set(candidates.map(({ client }) => client.id!)) : new Set())} /></TableHead><TableHead>Cliente</TableHead><TableHead>CUIT</TableHead><TableHead className="text-right">Saldo actual</TableHead></TableRow></TableHeader><TableBody>{visible.map(({ client, saldo }) => <TableRow key={client.id}><TableCell><Checkbox aria-label={`Seleccionar ${client.nombre} ${client.apellido}`} checked={selection === "todos" || selectedIds.has(client.id!)} disabled={pending || selection === "todos"} onCheckedChange={(checked) => toggle(client.id!, checked === true)} /></TableCell><TableCell>{client.nombre} {client.apellido}</TableCell><TableCell>{client.cuit}</TableCell><TableCell className={`text-right ${saldo > 0 ? "text-red-600" : saldo < 0 ? "text-green-600" : ""}`}>{money(saldo)}</TableCell></TableRow>)}{!visible.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No hay clientes que coincidan con el filtro.</TableCell></TableRow>}</TableBody></Table></div>}
    <div className="flex flex-wrap justify-between gap-2 text-sm"><p role="status">{selected.length} cliente{selected.length === 1 ? "" : "s"} seleccionado{selected.length === 1 ? "" : "s"} de {candidates.length}</p><p className="text-muted-foreground">Cada cliente comienza en una página nueva.</p></div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button><Button variant="print" onClick={print} disabled={pending || isLoading || Boolean(error) || !fechaCorte || !selected.length || !comercio?.id}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}{pending ? "Generando…" : "Generar e imprimir resúmenes"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
