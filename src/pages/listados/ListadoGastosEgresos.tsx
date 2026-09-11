import { useMemo, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Printer } from "lucide-react";
import { useGastosEgresos } from "@/hooks/useGastosEgresos";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { CATEGORIAS_GASTO, MEDIOS_PAGO_GASTO } from "@/types/gasto";
import { buildReportePdfFile, PrintableSection } from "@/utils/listadoVentasPdf";
import { Button } from "@/components/ui/button";
import { ReportPrintHeader } from "@/components/ReportPrintHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n || 0);
const today = new Date();

export default function ListadoGastosEgresos() {
  const [desde, setDesde] = useState(format(startOfMonth(today), "yyyy-MM-dd")); const [hasta, setHasta] = useState(format(today, "yyyy-MM-dd")); const [categoria, setCategoria] = useState("todas"); const [estado, setEstado] = useState("todos");
  const { comercio } = useComercio(); const { toast } = useToast();
  const { data: gastos = [], isLoading } = useGastosEgresos(desde, hasta);
  const rows = useMemo(() => gastos.filter(g => (categoria === "todas" || g.categoria === categoria) && (estado === "todos" || g.estado === estado)), [gastos, categoria, estado]);
  const total = rows.reduce((sum, g) => sum + Number(g.monto), 0); const pendientes = rows.filter(g => g.estado === "pendiente").reduce((sum, g) => sum + Number(g.monto), 0);
  const porCategoria = useMemo(() => Array.from(rows.reduce((map, g) => map.set(g.categoria, (map.get(g.categoria) || 0) + Number(g.monto)), new Map<string, number>())).sort((a, b) => b[1] - a[1]), [rows]);
  const handlePrintReport = async () => {
    const rango = `${format(new Date(`${desde}T00:00:00`), "dd/MM/yyyy")} al ${format(new Date(`${hasta}T00:00:00`), "dd/MM/yyyy")}`;
    const sections: PrintableSection[] = [
      { title: "Resumen", columns: [{ key: "concepto", label: "Concepto", x: 24, width: 380, align: "left" }, { key: "importe", label: "Importe", x: 404, width: 184, align: "right" }], rows: [{ concepto: "Total del período", importe: money(total) }, { concepto: "Pendiente de pago", importe: money(pendientes) }, { concepto: "Cantidad de gastos", importe: String(rows.length) }] },
      { title: "Detalle de gastos y egresos", columns: [{ key: "fecha", label: "Fecha", x: 24, width: 80, align: "center" }, { key: "concepto", label: "Concepto", x: 104, width: 180, align: "left" }, { key: "categoria", label: "Categoría", x: 284, width: 100, align: "left" }, { key: "medio", label: "Medio de pago", x: 384, width: 100, align: "left" }, { key: "estado", label: "Estado", x: 484, width: 50, align: "left" }, { key: "importe", label: "Importe", x: 534, width: 54, align: "right" }], rows: rows.map(g => ({ fecha: format(new Date(`${g.fecha}T00:00:00`), "dd/MM/yyyy"), concepto: g.concepto, categoria: g.categoria, medio: MEDIOS_PAGO_GASTO.find(m => m.value === g.medio_pago)?.label || g.medio_pago, estado: g.estado, importe: money(Number(g.monto)) })) },
      { title: "Totales por categoría", columns: [{ key: "categoria", label: "Categoría", x: 24, width: 380, align: "left" }, { key: "importe", label: "Importe", x: 404, width: 184, align: "right" }], rows: porCategoria.map(([categoria, importe]) => ({ categoria, importe: money(importe) })) },
    ];
    const file = await buildReportePdfFile(sections, { comercio, rango, titulo: "REPORTE DE GASTOS Y EGRESOS" });
    const url = URL.createObjectURL(file); const pdfWindow = window.open(url, "_blank");
    if (!pdfWindow) { URL.revokeObjectURL(url); toast({ title: "No se pudo abrir el PDF", description: "Revise si el navegador bloqueó la ventana emergente.", variant: "destructive" }); return; }
    pdfWindow.opener = null; setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return <div className="p-6"><div className="mx-auto max-w-7xl space-y-6">
    <ReportPrintHeader />
    <div className="flex items-start justify-between"><div><h1 className="text-3xl font-bold">Listado de gastos y egresos</h1><p className="text-muted-foreground">Análisis de gastos por período, categoría y estado.</p></div><Button type="button" variant="print" onClick={handlePrintReport} className="no-print"><Printer className="mr-2 h-4 w-4" />Imprimir Reporte</Button></div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Card className="border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-emerald-800">Total del período</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(total)}</CardContent></Card><Card className="border-amber-200 bg-amber-50 text-amber-950 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-800">Pendiente de pago</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(pendientes)}</CardContent></Card><Card className="border-blue-200 bg-blue-50 text-blue-950 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-800">Cantidad de gastos</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{rows.length}</CardContent></Card></div>
    <Card className="print:hidden"><CardHeader><CardTitle>Filtros</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-4"><div><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div><div><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div><div><Label>Categoría</Label><Select value={categoria} onValueChange={setCategoria}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas</SelectItem>{CATEGORIAS_GASTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div><Label>Estado</Label><Select value={estado} onValueChange={setEstado}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="pagado">Pagados</SelectItem><SelectItem value="pendiente">Pendientes</SelectItem></SelectContent></Select></div></CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-3"><Card className="lg:col-span-2"><CardHeader><CardTitle>Detalle</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>Categoría</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={5}>Cargando...</TableCell></TableRow> : rows.map(g => <TableRow key={g.id}><TableCell>{format(new Date(`${g.fecha}T00:00:00`), "dd/MM/yyyy")}</TableCell><TableCell>{g.concepto}</TableCell><TableCell>{g.categoria}</TableCell><TableCell>{MEDIOS_PAGO_GASTO.find(m => m.value === g.medio_pago)?.label}</TableCell><TableCell className="text-right">{money(Number(g.monto))}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Card><CardHeader><CardTitle>Por categoría</CardTitle></CardHeader><CardContent className="space-y-3">{porCategoria.map(([name, value]) => <div key={name} className="flex justify-between text-sm"><span>{name}</span><strong>{money(value)}</strong></div>)}</CardContent></Card></div>
  </div></div>;
}
