import { useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompras } from "@/hooks/useCompras";
import { useGastosEgresos } from "@/hooks/useGastosEgresos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const providerName = (provider: { nombre?: string; apellido?: string | null; razon_social?: string | null } | null | undefined) => provider?.razon_social || [provider?.nombre, provider?.apellido].filter(Boolean).join(" ") || "Proveedor";

export default function CuentaCorrienteProveedores() {
  const navigate = useNavigate();
  const { movimientos, isLoading } = useCompras();
  const { data: gastos = [], isLoading: gastosLoading } = useGastosEgresos();
  const [search, setSearch] = useState("");

  const summaries = useMemo(() => {
    const map = new Map<string, { id: string; name: string; cuit: string; debits: number; credits: number; expenses: number; last: string }>();
    movimientos.forEach((movement) => {
      const row = map.get(movement.proveedor_id) || { id: movement.proveedor_id, name: providerName(movement.proveedor), cuit: movement.proveedor?.cuit || "", debits: 0, credits: 0, expenses: 0, last: movement.fecha };
      if (movement.tipo === "deuda") row.debits += Number(movement.monto); else row.credits += Number(movement.monto);
      if (movement.fecha > row.last) row.last = movement.fecha;
      map.set(movement.proveedor_id, row);
    });
    gastos.forEach((expense) => {
      if (!expense.proveedor_id) return;
      const row = map.get(expense.proveedor_id) || { id: expense.proveedor_id, name: providerName(expense.proveedor), cuit: expense.proveedor?.cuit || "", debits: 0, credits: 0, expenses: 0, last: expense.fecha };
      row.expenses += Number(expense.monto);
      if (expense.fecha > row.last) row.last = expense.fecha;
      map.set(expense.proveedor_id, row);
    });
    return [...map.values()];
  }, [gastos, movimientos]);
  const filtered = summaries.filter((summary) => `${summary.name} ${summary.cuit}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <div><h1 className="text-3xl font-bold">Cuenta corriente de proveedores</h1><p className="text-muted-foreground">Consultá saldos, compras, gastos, pagos y vencimientos por proveedor.</p></div>
    <Card><CardHeader><CardTitle>Gestión de cuenta corriente</CardTitle></CardHeader><CardContent>
      <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por proveedor o CUIT" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {isLoading || gastosLoading ? <p className="py-8 text-center">Cargando…</p> : <Tabs defaultValue="resumen"><TabsList><TabsTrigger value="resumen">Resumen por proveedor</TabsTrigger><TabsTrigger value="movimientos">Todos los movimientos</TabsTrigger></TabsList>
        <TabsContent value="resumen"><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead>CUIT</TableHead><TableHead>Débitos</TableHead><TableHead>Créditos</TableHead><TableHead>Gastos vinculados</TableHead><TableHead>Saldo actual</TableHead><TableHead>Último movimiento</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{filtered.map((row) => { const balance = row.debits - row.credits; return <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.cuit}</TableCell><TableCell className="text-red-600">{money(row.debits)}</TableCell><TableCell className="text-green-600">{money(row.credits)}</TableCell><TableCell>{money(row.expenses)}</TableCell><TableCell><Badge variant={balance > 0 ? "destructive" : "secondary"}>{money(Math.abs(balance))}{balance > 0 ? " (Debe)" : ""}</Badge></TableCell><TableCell>{new Date(`${row.last}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell><Button size="icon" variant="outline" aria-label={`Ver cuenta de ${row.name}`} onClick={() => navigate(`/compras/cuenta-corriente/${row.id}`)}><Eye className="h-4 w-4" /></Button></TableCell></TableRow>; })}</TableBody></Table></div></TabsContent>
        <TabsContent value="movimientos"><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Tipo</TableHead><TableHead>Comprobante</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader><TableBody>{movimientos.map((movement) => <TableRow key={movement.id}><TableCell>{new Date(`${movement.fecha}T00:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell>{providerName(movement.proveedor)}</TableCell><TableCell><Badge variant={movement.tipo === "deuda" ? "destructive" : "default"}>{movement.tipo === "deuda" ? "Débito" : "Crédito"}</Badge></TableCell><TableCell>{movement.factura?.numero_comprobante || movement.gasto?.numero_comprobante || "—"}</TableCell><TableCell>{movement.medio_pago || "—"}</TableCell><TableCell className={`text-right font-medium ${movement.tipo === "deuda" ? "text-red-600" : "text-green-600"}`}>{money(Number(movement.monto))}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
      </Tabs>}
    </CardContent></Card>
  </div>;
}
