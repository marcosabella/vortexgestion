import { mostrarEnMayusculas } from "@/utils/textoPresentacion";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Eye, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCuentaCorriente } from "@/hooks/useCuentaCorriente";
import { CONCEPTOS_MOVIMIENTO } from "@/types/cuenta-corriente";
import { esComprobanteCuentaCorriente, formatCuentaCorrienteComprobante, formatCuentaCorrienteMovimiento } from "@/utils/cuentaCorrientePresentation";
import { useTablePagination } from "@/hooks/useTablePagination";
import { TablePaginationControls } from "@/components/TablePaginationControls";

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Math.abs(value));
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const collator = new Intl.Collator("es-AR", { sensitivity: "base", numeric: true });
const nombreOrden = (nombre?: string, apellido?: string) => [apellido?.trim(), nombre?.trim()].filter(Boolean).join(" ");
const fechaOrden = (fecha?: string) => fecha ? new Date(fecha).getTime() || 0 : 0;
type OrdenCuenta = "cliente" | "saldo" | "ultimo_movimiento";

export const CuentaCorrienteList = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("resumen");
  const { movimientos, isLoading, error, deleteMovimiento, deleteVentaFromCuenta, eliminarPagoCliente, useResumenCuentaCorriente } = useCuentaCorriente({ cargarMovimientos: activeTab === "movimientos" });
  const resumenQuery = useResumenCuentaCorriente(true);
  const resumen = resumenQuery.data || [];
  const [searchTerm, setSearchTerm] = useState("");
  const [orden, setOrden] = useState<OrdenCuenta>("cliente");
  const searchTokens = normalize(searchTerm).trim().split(/\s+/).filter(Boolean);
  const matches = (values: (string | undefined)[]) => {
    const text = normalize(values.filter(Boolean).join(" "));
    const compact = text.replace(/[^a-z0-9]/g, "");
    return searchTokens.every((token) => text.includes(token) || compact.includes(token.replace(/[.-]/g, "")));
  };
  const saldos = new Map(resumen.map(item => [item.cliente_id, item.saldo_actual]));
  const filteredMovimientos = movimientos.filter((movement) => matches([
    movement.cliente?.nombre, movement.cliente?.apellido, movement.cliente?.cuit, movement.concepto,
  ])).sort((a, b) => {
    if (orden === "ultimo_movimiento") return fechaOrden(b.fecha_movimiento) - fechaOrden(a.fecha_movimiento);
    const diferenciaSaldo = orden === "saldo" ? (saldos.get(b.cliente_id) || 0) - (saldos.get(a.cliente_id) || 0) : 0;
    return diferenciaSaldo || collator.compare(nombreOrden(a.cliente?.nombre, a.cliente?.apellido), nombreOrden(b.cliente?.nombre, b.cliente?.apellido))
      || fechaOrden(b.fecha_movimiento) - fechaOrden(a.fecha_movimiento);
  });
  const filteredResumen = resumen.filter((item) => searchTokens.length
    ? matches([item.cliente_nombre, item.cliente_apellido, item.cliente_cuit])
    : Math.round(item.saldo_actual * 100) !== 0).sort((a, b) => {
      const diferencia = orden === "saldo" ? b.saldo_actual - a.saldo_actual
        : orden === "ultimo_movimiento" ? fechaOrden(b.ultimo_movimiento) - fechaOrden(a.ultimo_movimiento) : 0;
      return diferencia || collator.compare(nombreOrden(a.cliente_nombre, a.cliente_apellido), nombreOrden(b.cliente_nombre, b.cliente_apellido));
    });
  const conceptoLabel = (concepto: string) => CONCEPTOS_MOVIMIENTO.find((item) => item.value === concepto)?.label || concepto;
  const resumenPagination = useTablePagination(filteredResumen, 'cuenta-clientes-registros-por-pagina', `${searchTerm}:${orden}`);
  const movimientosPagination = useTablePagination(filteredMovimientos, 'cuenta-clientes-movimientos-por-pagina', `${searchTerm}:${orden}`);
  const saldoVariant = (saldo: number) => saldo > 0 ? "destructive" as const : saldo < 0 ? "default" as const : "secondary" as const;

  if (resumenQuery.isLoading) return <div className="flex h-48 items-center justify-center"><p>Cargando cuenta corriente...</p></div>;
  if (resumenQuery.error) return <div className="space-y-3 rounded-md border border-destructive/40 p-4"><p className="text-destructive">No se pudo cargar la cuenta corriente de los clientes.</p><Button variant="outline" onClick={() => resumenQuery.refetch()}>Reintentar</Button></div>;

  return <div className="space-y-6">
    <Card>
      <CardHeader><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Gestión de Cuenta Corriente</CardTitle><Button asChild variant="new"><Link to="/cuenta-corriente/nuevo"><Plus className="mr-2 h-4 w-4" />Nuevo Movimiento</Link></Button></div></CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar en cuenta corriente" placeholder="Buscar cliente, CUIT o concepto..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="pl-8" /></div>
          <Select value={orden} onValueChange={value => setOrden(value as OrdenCuenta)}>
            <SelectTrigger aria-label="Ordenar cuenta corriente" className="w-64 max-w-[55%] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cliente">Apellido / razón social (A–Z)</SelectItem>
              <SelectItem value="saldo">Saldo (mayor a menor)</SelectItem>
              <SelectItem value="ultimo_movimiento">Último movimiento (reciente)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList><TabsTrigger value="resumen">Resumen por Cliente</TabsTrigger><TabsTrigger value="movimientos">Todos los Movimientos</TabsTrigger></TabsList>
          {activeTab === "movimientos" && isLoading && <p role="status">Cargando movimientos...</p>}
          {activeTab === "movimientos" && error && <p role="alert" className="text-destructive">No se pudieron cargar los movimientos. Vuelva a abrir la pestaña para reintentar.</p>}
          <TabsContent value="resumen"><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>CUIT</TableHead><TableHead>Total Débitos</TableHead><TableHead>Total Créditos</TableHead><TableHead>Saldo Actual</TableHead><TableHead>Último Movimiento</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{resumenPagination.items.map((item) => <TableRow key={item.cliente_id}><TableCell className="font-medium">{mostrarEnMayusculas(item.cliente_nombre)} {mostrarEnMayusculas(item.cliente_apellido)}</TableCell><TableCell>{item.cliente_cuit}</TableCell><TableCell className="text-red-600">{money(item.total_debitos)}</TableCell><TableCell className="text-green-600">{money(item.total_creditos)}</TableCell><TableCell><Badge variant={saldoVariant(item.saldo_actual)}>{money(item.saldo_actual)} {item.saldo_actual > 0 ? "(Debe)" : item.saldo_actual < 0 ? "(Favor)" : ""}</Badge></TableCell><TableCell>{item.ultimo_movimiento ? format(new Date(item.ultimo_movimiento), "dd/MM/yyyy") : "—"}</TableCell><TableCell><Button variant="outline" size="icon" aria-label={`Ver cuenta de ${mostrarEnMayusculas(item.cliente_nombre)}`} onClick={() => navigate(`/cuenta-corriente/${item.cliente_id}`)}><Eye className="h-4 w-4" /></Button></TableCell></TableRow>)}{filteredResumen.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{searchTokens.length ? "No se encontraron clientes" : "No hay clientes con saldo pendiente"}</TableCell></TableRow>}</TableBody></Table></div><TablePaginationControls id="cuenta-clientes" label="clientes" pagination={resumenPagination} /></TabsContent>
          <TabsContent value="movimientos"><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Monto</TableHead><TableHead>Observaciones</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{movimientosPagination.items.map((movement) => {
            const presentation = formatCuentaCorrienteMovimiento(movement);
            return <TableRow key={movement.id}><TableCell>{format(new Date(movement.fecha_movimiento), "dd/MM/yyyy HH:mm")}</TableCell><TableCell>{mostrarEnMayusculas(movement.cliente?.nombre)} {mostrarEnMayusculas(movement.cliente?.apellido)}<div className="text-sm text-muted-foreground">CUIT: {movement.cliente?.cuit}</div></TableCell><TableCell><Badge variant={movement.tipo_movimiento === "debito" ? "destructive" : "default"}>{movement.tipo_movimiento === "debito" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell>{presentation.concepto || conceptoLabel(movement.concepto)}{movement.venta_id && <div className="text-xs text-muted-foreground">{formatCuentaCorrienteComprobante(movement)}</div>}</TableCell><TableCell className={`font-semibold ${movement.tipo_movimiento === "debito" ? "text-red-600" : "text-green-600"}`}>{money(movement.monto)}</TableCell><TableCell>{presentation.observaciones}</TableCell><TableCell>{esComprobanteCuentaCorriente(movement) ? <Button variant="destructive" size="sm" disabled={Boolean(movement.venta?.cae?.trim())} title={movement.venta?.cae?.trim() ? "La venta tiene CAE y no puede eliminarse" : undefined} onClick={() => { if (confirm("¿Eliminar toda la venta? Esto eliminará la venta y todos sus movimientos asociados.")) deleteVentaFromCuenta(movement.venta_id!); }}><Trash2 className="mr-2 h-4 w-4" />Venta</Button> : <Button variant="destructive" size="icon" onClick={() => { if (confirm(movement.tipo_movimiento === "credito" ? (movement.cheque_id ? "¿Eliminar este pago? Se revertirán todas las imputaciones del mismo cheque y se quitará de cartera si todavía está disponible." : "¿Eliminar este pago?") : "¿Eliminar este movimiento?")) { if (movement.tipo_movimiento === "credito") eliminarPagoCliente.mutate(movement.id); else deleteMovimiento(movement.id); } }}><Trash2 className="h-4 w-4" /></Button>}</TableCell></TableRow>;
          })}{filteredMovimientos.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No se encontraron movimientos</TableCell></TableRow>}</TableBody></Table></div><TablePaginationControls id="cuenta-clientes-movimientos" label="movimientos" pagination={movimientosPagination} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  </div>;
};
