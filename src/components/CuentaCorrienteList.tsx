import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Eye, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCuentaCorriente } from "@/hooks/useCuentaCorriente";
import { CONCEPTOS_MOVIMIENTO } from "@/types/cuenta-corriente";
import { formatCuentaCorrienteMovimiento } from "@/utils/cuentaCorrientePresentation";

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Math.abs(value));

export const CuentaCorrienteList = () => {
  const navigate = useNavigate();
  const { movimientos, isLoading, deleteMovimiento, deleteVentaFromCuenta, eliminarPagoCliente, useResumenCuentaCorriente } = useCuentaCorriente();
  const resumenQuery = useResumenCuentaCorriente();
  const resumen = resumenQuery.data || [];
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es");
  const filteredMovimientos = movimientos.filter((movement) => !normalizedSearch
    || movement.cliente?.nombre.toLocaleLowerCase("es").includes(normalizedSearch)
    || movement.cliente?.apellido.toLocaleLowerCase("es").includes(normalizedSearch)
    || movement.cliente?.cuit.toLocaleLowerCase("es").includes(normalizedSearch)
    || movement.concepto.toLocaleLowerCase("es").includes(normalizedSearch));
  const filteredResumen = resumen.filter((item) => !normalizedSearch
    || item.cliente_nombre.toLocaleLowerCase("es").includes(normalizedSearch)
    || item.cliente_apellido.toLocaleLowerCase("es").includes(normalizedSearch)
    || item.cliente_cuit.toLocaleLowerCase("es").includes(normalizedSearch));
  const conceptoLabel = (concepto: string) => CONCEPTOS_MOVIMIENTO.find((item) => item.value === concepto)?.label || concepto;
  const saldoVariant = (saldo: number) => saldo > 0 ? "destructive" as const : saldo < 0 ? "default" as const : "secondary" as const;

  if (isLoading || resumenQuery.isLoading) return <div className="flex h-48 items-center justify-center"><p>Cargando cuenta corriente...</p></div>;

  return <div className="space-y-6">
    <Card>
      <CardHeader><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Gestión de Cuenta Corriente</CardTitle><Button asChild variant="new"><Link to="/cuenta-corriente/nuevo"><Plus className="mr-2 h-4 w-4" />Nuevo Movimiento</Link></Button></div></CardHeader>
      <CardContent>
        <div className="relative mb-4"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar por cliente, CUIT o concepto..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="pl-8" /></div>
        <Tabs defaultValue="resumen" className="w-full">
          <TabsList><TabsTrigger value="resumen">Resumen por Cliente</TabsTrigger><TabsTrigger value="movimientos">Todos los Movimientos</TabsTrigger></TabsList>
          <TabsContent value="resumen"><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>CUIT</TableHead><TableHead>Total Débitos</TableHead><TableHead>Total Créditos</TableHead><TableHead>Saldo Actual</TableHead><TableHead>Último Movimiento</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{filteredResumen.map((item) => <TableRow key={item.cliente_id}><TableCell className="font-medium">{item.cliente_nombre} {item.cliente_apellido}</TableCell><TableCell>{item.cliente_cuit}</TableCell><TableCell className="text-red-600">{money(item.total_debitos)}</TableCell><TableCell className="text-green-600">{money(item.total_creditos)}</TableCell><TableCell><Badge variant={saldoVariant(item.saldo_actual)}>{money(item.saldo_actual)} {item.saldo_actual > 0 ? "(Debe)" : item.saldo_actual < 0 ? "(Favor)" : ""}</Badge></TableCell><TableCell>{item.ultimo_movimiento ? format(new Date(item.ultimo_movimiento), "dd/MM/yyyy") : "—"}</TableCell><TableCell><Button variant="outline" size="icon" aria-label={`Ver cuenta de ${item.cliente_nombre}`} onClick={() => navigate(`/cuenta-corriente/${item.cliente_id}`)}><Eye className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
          <TabsContent value="movimientos"><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Monto</TableHead><TableHead>Observaciones</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{filteredMovimientos.map((movement) => {
            const presentation = formatCuentaCorrienteMovimiento(movement);
            return <TableRow key={movement.id}><TableCell>{format(new Date(movement.fecha_movimiento), "dd/MM/yyyy HH:mm")}</TableCell><TableCell>{movement.cliente?.nombre} {movement.cliente?.apellido}<div className="text-sm text-muted-foreground">CUIT: {movement.cliente?.cuit}</div></TableCell><TableCell><Badge variant={movement.tipo_movimiento === "debito" ? "destructive" : "default"}>{movement.tipo_movimiento === "debito" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell>{presentation.concepto || conceptoLabel(movement.concepto)}{movement.venta_id && <div className="text-xs text-muted-foreground">Venta: {movement.venta?.numero_comprobante}</div>}</TableCell><TableCell className={`font-semibold ${movement.tipo_movimiento === "debito" ? "text-red-600" : "text-green-600"}`}>{money(movement.monto)}</TableCell><TableCell>{presentation.observaciones}</TableCell><TableCell>{movement.venta_id && movement.tipo_movimiento === "debito" ? <Button variant="destructive" size="sm" disabled={Boolean(movement.venta?.cae?.trim())} title={movement.venta?.cae?.trim() ? "La venta tiene CAE y no puede eliminarse" : undefined} onClick={() => { if (confirm("¿Eliminar toda la venta? Esto eliminará la venta y todos sus movimientos asociados.")) deleteVentaFromCuenta(movement.venta_id!); }}><Trash2 className="mr-2 h-4 w-4" />Venta</Button> : <Button variant="destructive" size="icon" onClick={() => { if (confirm(movement.tipo_movimiento === "credito" ? "¿Eliminar este pago?" : "¿Eliminar este movimiento?")) { if (movement.tipo_movimiento === "credito") eliminarPagoCliente.mutate(movement.id); else deleteMovimiento(movement.id); } }}><Trash2 className="h-4 w-4" /></Button>}</TableCell></TableRow>;
          })}</TableBody></Table></div></TabsContent>
        </Tabs>
        {filteredMovimientos.length === 0 && <div className="py-8 text-center text-muted-foreground">No se encontraron movimientos</div>}
      </CardContent>
    </Card>
  </div>;
};
