import { FormEvent, useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, ReceiptText, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrearGastoEgreso, useGastosEgresos } from "@/hooks/useGastosEgresos";
import { CATEGORIAS_GASTO, MEDIOS_PAGO_GASTO, MedioPagoGasto } from "@/types/gasto";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const db = supabase as any;
const hoy = format(new Date(), "yyyy-MM-dd");
const currency = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value || 0));

export default function GastosEgresos() {
  const [modalOpen, setModalOpen] = useState(false);
  const [fecha, setFecha] = useState(hoy); const [categoria, setCategoria] = useState("Otros"); const [concepto, setConcepto] = useState(""); const [monto, setMonto] = useState(0);
  const [medioPago, setMedioPago] = useState<MedioPagoGasto>("transferencia"); const [estado, setEstado] = useState<"pendiente" | "pagado">("pagado"); const [numeroComprobante, setNumeroComprobante] = useState(""); const [observaciones, setObservaciones] = useState(""); const [cajaId, setCajaId] = useState("");
  const [buscar, setBuscar] = useState("");
  const { data: gastos = [], isLoading } = useGastosEgresos(); const crear = useCrearGastoEgreso();
  const { data: cajasAbiertas = [] } = useQuery({ queryKey: ["cajas-abiertas"], queryFn: async () => { const { data, error } = await db.from("cajas_diarias").select("id, fecha").eq("estado", "abierta").order("fecha", { ascending: false }); if (error) throw error; return data || []; } });
  const rows = useMemo(() => gastos.filter(g => { const term = buscar.trim().toLowerCase(); return !term || [g.concepto, g.numero_comprobante].filter(Boolean).join(" ").toLowerCase().includes(term); }), [gastos, buscar]);
  const submit = async (event: FormEvent) => { event.preventDefault(); await crear.mutateAsync({ fecha, categoria, concepto, monto, medio_pago: medioPago, estado, caja_id: medioPago === "efectivo" && estado === "pagado" ? cajaId : null, numero_comprobante: numeroComprobante || null, observaciones: observaciones || null }); setModalOpen(false); setConcepto(""); setMonto(0); setNumeroComprobante(""); setObservaciones(""); setCajaId(""); };
  return <div className="p-6"><div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold">Gastos y egresos</h1><p className="text-muted-foreground">Consultá los gastos registrados y cargá nuevos movimientos cuando sea necesario.</p></div><Dialog open={modalOpen} onOpenChange={setModalOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nuevo gasto o egreso</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Nuevo gasto o egreso</DialogTitle></DialogHeader><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Fecha"><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required /></Field><Field label="Categoría"><Select value={categoria} onValueChange={setCategoria}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIAS_GASTO.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="Concepto"><Input value={concepto} onChange={e => setConcepto(e.target.value)} required /></Field><Field label="Importe"><Input type="number" min="0.01" step="0.01" value={monto || ""} onChange={e => setMonto(Number(e.target.value))} required /></Field>
      <Field label="Medio de pago"><Select value={medioPago} onValueChange={x => setMedioPago(x as MedioPagoGasto)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MEDIOS_PAGO_GASTO.map(x => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Estado"><Select value={estado} onValueChange={x => setEstado(x as "pendiente" | "pagado")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pagado">Pagado</SelectItem><SelectItem value="pendiente">Pendiente</SelectItem></SelectContent></Select></Field>
      {medioPago === "efectivo" && estado === "pagado" && <div className="space-y-2 sm:col-span-2"><Label>Caja abierta</Label><Select value={cajaId} onValueChange={setCajaId}><SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger><SelectContent>{cajasAbiertas.map((c: { id: string; fecha: string }) => <SelectItem key={c.id} value={c.id}>Caja del {format(new Date(`${c.fecha}T00:00:00`), "dd/MM/yyyy")}</SelectItem>)}</SelectContent></Select></div>}
      <Field label="Comprobante"><Input value={numeroComprobante} onChange={e => setNumeroComprobante(e.target.value)} placeholder="Nro. factura/ticket" /></Field><div className="space-y-2 sm:col-span-2"><Label>Observaciones</Label><Textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} /></div><div className="flex justify-end sm:col-span-2"><Button disabled={crear.isPending || monto <= 0 || (medioPago === "efectivo" && estado === "pagado" && !cajaId)}>Registrar gasto</Button></div>
    </form></DialogContent></Dialog></div>
    <Card><CardContent className="pt-6"><div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Filtrar por concepto o comprobante..." /></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Gastos y egresos</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>Categoría</TableHead><TableHead>Pago</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={6}>Cargando...</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground"><ReceiptText className="mx-auto mb-2 h-6 w-6" />No se encontraron gastos con esos filtros.</TableCell></TableRow> : rows.map(g => <TableRow key={g.id}><TableCell>{format(new Date(`${g.fecha}T00:00:00`), "dd/MM/yyyy")}</TableCell><TableCell><div className="font-medium">{g.concepto}</div>{g.numero_comprobante && <div className="text-xs text-muted-foreground">Comp. {g.numero_comprobante}</div>}</TableCell><TableCell>{g.categoria}</TableCell><TableCell>{MEDIOS_PAGO_GASTO.find(x => x.value === g.medio_pago)?.label}</TableCell><TableCell><Badge variant={g.estado === "pagado" ? "default" : "secondary"}>{g.estado}</Badge></TableCell><TableCell className="text-right font-medium">{currency(g.monto)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  </div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
