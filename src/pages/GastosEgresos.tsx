import { FormEvent, useMemo, useState } from "react";
import { format } from "date-fns";
import { Eye, Pencil, Plus, ReceiptText, Search, Trash2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useActualizarGastoEgreso,
  useCategoriasGastos,
  useCrearCategoriaGasto,
  useCrearGastoEgreso,
  useEliminarGastoEgreso,
  useGastosEgresos,
} from "@/hooks/useGastosEgresos";
import { type Proveedor, useProveedores } from "@/hooks/useProveedores";
import { CATEGORIAS_GASTO, EstadoGasto, GastoEgreso, MEDIOS_PAGO_GASTO, MedioPagoGasto } from "@/types/gasto";
import { TIPOS_COMPROBANTE } from "@/types/venta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const hoy = format(new Date(), "yyyy-MM-dd");
const currency = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value || 0));
const providerName = (provider?: Pick<Proveedor, "nombre" | "apellido" | "razon_social"> | null) =>
  provider?.razon_social || [provider?.nombre, provider?.apellido].filter(Boolean).join(" ") || "Proveedor";

type GastoForm = {
  fecha: string; categoria: string; concepto: string; monto: number; medioPago: MedioPagoGasto;
  estado: EstadoGasto; tipoComprobante: string; numeroComprobante: string; observaciones: string; cajaId: string; proveedorId: string;
};
const initialForm = (): GastoForm => ({ fecha: hoy, categoria: "Otros", concepto: "", monto: 0, medioPago: "transferencia", estado: "pagado", tipoComprobante: "recibo_x", numeroComprobante: "", observaciones: "", cajaId: "", proveedorId: "" });
const formatReceiptNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  return digits.length > 4 ? `${digits.slice(0, 4)} - ${digits.slice(4)}` : digits;
};
const toForm = (gasto: GastoEgreso): GastoForm => ({ fecha: gasto.fecha, categoria: gasto.categoria, concepto: gasto.concepto, monto: Number(gasto.monto), medioPago: gasto.medio_pago, estado: gasto.estado, tipoComprobante: gasto.tipo_comprobante || "recibo_x", numeroComprobante: gasto.numero_comprobante ? formatReceiptNumber(gasto.numero_comprobante) : "", observaciones: gasto.observaciones || "", cajaId: gasto.caja_id || "", proveedorId: gasto.proveedor_id || "" });

export default function GastosEgresos() {
  const [formOpen, setFormOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [detail, setDetail] = useState<GastoEgreso | null>(null);
  const [deleting, setDeleting] = useState<GastoEgreso | null>(null);
  const [editing, setEditing] = useState<GastoEgreso | null>(null);
  const [form, setForm] = useState<GastoForm>(initialForm);
  const [buscar, setBuscar] = useState("");
  const { data: gastos = [], isLoading } = useGastosEgresos();
  const { data: proveedores = [] } = useProveedores();
  const { data: storedCategories = [] } = useCategoriasGastos();
  const crearCategoria = useCrearCategoriaGasto();
  const crear = useCrearGastoEgreso();
  const actualizar = useActualizarGastoEgreso();
  const eliminar = useEliminarGastoEgreso();
  const { data: cajasAbiertas = [] } = useQuery({ queryKey: ["cajas-abiertas"], queryFn: async () => { const { data, error } = await db.from("cajas_diarias").select("id, fecha").eq("estado", "abierta").order("fecha", { ascending: false }); if (error) throw error; return data || []; } });

  const categories = useMemo(() => [...new Set([...CATEGORIAS_GASTO, ...storedCategories.map((item) => item.nombre), ...gastos.map((item) => item.categoria)])].sort((a, b) => a.localeCompare(b, "es")), [gastos, storedCategories]);
  const rows = useMemo(() => gastos.filter((gasto) => { const term = buscar.trim().toLowerCase(); return !term || [gasto.concepto, gasto.numero_comprobante, gasto.categoria, providerName(gasto.proveedor)].filter(Boolean).join(" ").toLowerCase().includes(term); }), [gastos, buscar]);
  const filteredProviders = useMemo(() => proveedores.filter((provider) => `${providerName(provider)} ${provider.cuit}`.toLowerCase().includes(providerSearch.trim().toLowerCase())), [proveedores, providerSearch]);
  const selectedProvider = proveedores.find((provider) => provider.id === form.proveedorId);
  const isCashPaid = form.medioPago === "efectivo" && form.estado === "pagado";
  const requiresProvider = form.medioPago === "cuenta_corriente";
  const receiptNumberValid = !form.numeroComprobante || /^\d{4} - \d{8}$/.test(form.numeroComprobante);
  const saving = crear.isPending || actualizar.isPending;
  const set = <K extends keyof GastoForm>(key: K, value: GastoForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const openNew = () => { setEditing(null); setForm(initialForm()); setFormOpen(true); };
  const openEdit = (gasto: GastoEgreso) => { setEditing(gasto); setForm(toForm(gasto)); setFormOpen(true); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const gasto = { fecha: form.fecha, categoria: form.categoria, concepto: form.concepto, monto: form.monto, medio_pago: form.medioPago, estado: form.estado, caja_id: isCashPaid ? form.cajaId : null, proveedor_id: form.proveedorId || null, tipo_comprobante: form.numeroComprobante ? form.tipoComprobante : null, numero_comprobante: form.numeroComprobante || null, observaciones: form.observaciones || null };
    if (editing) await actualizar.mutateAsync({ id: editing.id, gasto }); else await crear.mutateAsync(gasto);
    setFormOpen(false); setEditing(null);
  };
  const addCategory = async () => {
    const normalized = newCategory.trim().replace(/\s+/g, " ");
    if (!normalized) return;
    const existing = categories.find((item) => item.toLocaleLowerCase("es") === normalized.toLocaleLowerCase("es"));
    if (existing) set("categoria", existing);
    else { const created = await crearCategoria.mutateAsync(normalized); set("categoria", created.nombre); }
    setNewCategory(""); setCategoryOpen(false);
  };
  const confirmDelete = async () => { if (!deleting) return; await eliminar.mutateAsync(deleting.id); setDeleting(null); };
  const paymentLabel = (gasto: GastoEgreso) => MEDIOS_PAGO_GASTO.find((item) => item.value === gasto.medio_pago)?.label || gasto.medio_pago;

  return <div className="p-4 sm:p-6"><div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold">Gastos y egresos</h1><p className="text-muted-foreground">Consultá los gastos registrados y cargá nuevos movimientos cuando sea necesario.</p></div><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nuevo gasto o egreso</Button></div>

    <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{editing ? "Editar gasto o egreso" : "Nuevo gasto o egreso"}</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha"><Input type="date" value={form.fecha} onChange={(event) => set("fecha", event.target.value)} required /></Field>
        <Field label="Categoría"><div className="flex gap-2"><Select value={form.categoria} onValueChange={(value) => set("categoria", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select><Button type="button" size="icon" variant="outline" onClick={() => setCategoryOpen(true)} aria-label="Agregar categoría" title="Agregar categoría"><Plus className="h-4 w-4" /></Button></div></Field>
      </div>
      <div className="space-y-2"><Label>Proveedor{requiresProvider ? " *" : ""}</Label><div className="flex gap-2"><Input readOnly value={selectedProvider ? providerName(selectedProvider) : ""} placeholder="Sin proveedor seleccionado" /><Button type="button" variant="outline" onClick={() => { setProviderSearch(""); setProviderOpen(true); }}><Search className="mr-2 h-4 w-4" />Buscar</Button>{form.proveedorId && <Button type="button" size="icon" variant="ghost" onClick={() => set("proveedorId", "")} aria-label="Quitar proveedor"><X className="h-4 w-4" /></Button>}</div>{requiresProvider && !form.proveedorId && <p className="text-xs text-destructive">Seleccioná un proveedor para registrar el gasto en su cuenta corriente.</p>}</div>
      <div className="grid gap-4 sm:grid-cols-12">
        <div className="space-y-2 sm:col-span-5"><Label>Comprobante</Label><div className="grid gap-2 sm:grid-cols-[minmax(150px,0.9fr)_minmax(180px,1.1fr)]"><Select value={form.tipoComprobante} onValueChange={(value) => set("tipoComprobante", value)}><SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger><SelectContent>{TIPOS_COMPROBANTE.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select><Input inputMode="numeric" maxLength={15} value={form.numeroComprobante} onChange={(event) => set("numeroComprobante", formatReceiptNumber(event.target.value))} placeholder="0000 - 00000000" aria-invalid={!receiptNumberValid} /></div>{!receiptNumberValid && <p className="text-xs text-destructive">Usá el formato 0000 - 00000000.</p>}</div>
        <div className="space-y-2 sm:col-span-5"><Label>Concepto</Label><Input value={form.concepto} onChange={(event) => set("concepto", event.target.value)} required /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Importe</Label><Input type="number" min="0.01" step="0.01" value={form.monto || ""} onChange={(event) => set("monto", Number(event.target.value))} required /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Medio de pago"><Select value={form.medioPago} onValueChange={(value) => { const medio = value as MedioPagoGasto; setForm((current) => ({ ...current, medioPago: medio, estado: medio === "cuenta_corriente" ? "pendiente" : current.estado })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MEDIOS_PAGO_GASTO.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Estado"><Select value={form.estado} disabled={requiresProvider} onValueChange={(value) => set("estado", value as EstadoGasto)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pagado">Pagado</SelectItem><SelectItem value="pendiente">Pendiente</SelectItem></SelectContent></Select>{requiresProvider && <p className="text-xs text-muted-foreground">Se marcará como pagado cuando se cancele el saldo total.</p>}</Field></div>
      {isCashPaid && <div className="space-y-2"><Label>Caja abierta</Label><Select value={form.cajaId} onValueChange={(value) => set("cajaId", value)}><SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger><SelectContent>{cajasAbiertas.map((cashbox: { id: string; fecha: string }) => <SelectItem key={cashbox.id} value={cashbox.id}>Caja del {format(new Date(`${cashbox.fecha}T00:00:00`), "dd/MM/yyyy")}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Los gastos en efectivo pagados se registran también en la caja seleccionada.</p></div>}
      <div className="space-y-2"><Label>Observaciones</Label><Textarea value={form.observaciones} onChange={(event) => set("observaciones", event.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button disabled={saving || form.monto <= 0 || !receiptNumberValid || (isCashPaid && !form.cajaId) || (requiresProvider && !form.proveedorId)}>{editing ? "Guardar cambios" : "Registrar gasto"}</Button></div>
    </form></DialogContent></Dialog>

    <Dialog open={providerOpen} onOpenChange={setProviderOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Seleccionar proveedor</DialogTitle></DialogHeader><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input autoFocus className="pl-9" value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="Buscar por nombre, razón social o CUIT" /></div><div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead>CUIT</TableHead><TableHead className="w-28"></TableHead></TableRow></TableHeader><TableBody>{filteredProviders.length === 0 ? <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No se encontraron proveedores.</TableCell></TableRow> : filteredProviders.map((provider) => <TableRow key={provider.id}><TableCell className="font-medium">{providerName(provider)}</TableCell><TableCell>{provider.cuit}</TableCell><TableCell><Button type="button" size="sm" onClick={() => { set("proveedorId", provider.id || ""); setProviderOpen(false); }}>Seleccionar</Button></TableCell></TableRow>)}</TableBody></Table></div></DialogContent></Dialog>

    <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Agregar categoría</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="new-expense-category">Nombre</Label><Input id="new-expense-category" autoFocus maxLength={80} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addCategory(); } }} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setCategoryOpen(false)}>Cancelar</Button><Button type="button" disabled={!newCategory.trim() || crearCategoria.isPending} onClick={() => void addCategory()}>Agregar</Button></DialogFooter></DialogContent></Dialog>

    <Card><CardContent className="pt-6"><div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Filtrar por concepto, categoría, proveedor o comprobante..." /></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Gastos y egresos</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>Proveedor</TableHead><TableHead>Categoría</TableHead><TableHead>Pago</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Importe</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={8}>Cargando...</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground"><ReceiptText className="mx-auto mb-2 h-6 w-6" />No se encontraron gastos con esos filtros.</TableCell></TableRow> : rows.map((gasto) => <TableRow key={gasto.id}><TableCell>{format(new Date(`${gasto.fecha}T00:00:00`), "dd/MM/yyyy")}</TableCell><TableCell><div className="font-medium">{gasto.concepto}</div>{gasto.numero_comprobante && <div className="text-xs text-muted-foreground">Comp. {gasto.numero_comprobante}</div>}</TableCell><TableCell>{gasto.proveedor ? providerName(gasto.proveedor) : "—"}</TableCell><TableCell>{gasto.categoria}</TableCell><TableCell>{paymentLabel(gasto)}</TableCell><TableCell><Badge variant={gasto.estado === "pagado" ? "default" : "secondary"}>{gasto.estado}</Badge></TableCell><TableCell className="text-right font-medium">{currency(gasto.monto)}</TableCell><TableCell><div className="flex justify-end gap-2"><Button type="button" size="icon" variant="outline" onClick={() => setDetail(gasto)} aria-label={`Ver detalle de ${gasto.concepto}`} title="Ver detalle"><Eye className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" onClick={() => openEdit(gasto)} aria-label={`Editar ${gasto.concepto}`} title="Editar"><Pencil className="h-4 w-4" /></Button><Button type="button" size="icon" variant="destructive" onClick={() => setDeleting(gasto)} aria-label={`Eliminar ${gasto.concepto}`} title="Eliminar"><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>

    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Detalle del gasto</DialogTitle></DialogHeader>{detail && <div className="space-y-4 text-sm"><div className="grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-4"><p><strong>Fecha:</strong> {format(new Date(`${detail.fecha}T00:00:00`), "dd/MM/yyyy")}</p><p><strong>Estado:</strong> <Badge className="ml-1" variant={detail.estado === "pagado" ? "default" : "secondary"}>{detail.estado}</Badge></p><p><strong>Importe:</strong> {currency(detail.monto)}</p><p><strong>Comprobante:</strong> {detail.numero_comprobante || "—"}</p><p className="sm:col-span-2"><strong>Proveedor:</strong> {detail.proveedor ? providerName(detail.proveedor) : "Sin proveedor"}</p></div><div><h4 className="mb-2 font-semibold">Información del gasto</h4><Table><TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Categoría</TableHead><TableHead>Medio de pago</TableHead><TableHead>Observaciones</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell className="font-medium">{detail.concepto}</TableCell><TableCell>{detail.categoria}</TableCell><TableCell>{paymentLabel(detail)}</TableCell><TableCell>{detail.observaciones || "—"}</TableCell></TableRow></TableBody></Table></div></div>}</DialogContent></Dialog>
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar gasto o egreso</AlertDialogTitle><AlertDialogDescription>Vas a eliminar “{deleting?.concepto}”. Esta acción no se puede deshacer{deleting?.medio_pago === "efectivo" && deleting.estado === "pagado" ? " y quitará su movimiento asociado de Caja diaria." : deleting?.medio_pago === "cuenta_corriente" ? " y quitará su movimiento de la cuenta corriente del proveedor." : "."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete} disabled={eliminar.isPending}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
