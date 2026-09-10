import { useMemo, useState } from "react";
import { ChevronDown, FilterX, PackageCheck, Search, ShoppingBag } from "lucide-react";
import { usePedidosOnline, EstadoPedidoOnline } from "@/hooks/usePedidosOnline";
import { useNotificaciones } from "@/hooks/useNotificaciones";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const estados: EstadoPedidoOnline[] = ["recibido", "confirmado", "preparando", "listo", "entregado", "cancelado"];
const labels: Record<EstadoPedidoOnline, string> = { recibido: "Recibido", confirmado: "Confirmado", preparando: "En preparación", listo: "Listo para entregar", entregado: "Entregado", cancelado: "Cancelado" };
const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
type PedidoOnline = {
  id: string; numero: string | number; estado: EstadoPedidoOnline; estado_pago: string | null; created_at: string; total: number;
  cliente_nombre: string; cliente_email: string; cliente_telefono: string; cliente_direccion: string; cliente_id: string | null; observaciones: string | null;
  cliente: { nombre: string; apellido: string } | null;
  pedido_online_items: { id: string; cantidad: number; descripcion: string; subtotal: number }[];
};

const metadataPedidoId = (metadata: unknown) =>
  typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) && (metadata as { tipo?: string }).tipo === "pedido_online"
    ? (metadata as { pedido_id?: string }).pedido_id
    : undefined;

export default function PedidosOnline() {
  const { pedidos, isLoading, actualizarEstado, isUpdating } = usePedidosOnline();
  const { notificaciones, marcarLeida } = useNotificaciones(true);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [pagoFiltro, setPagoFiltro] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const pedidosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es-AR");
    return (pedidos as PedidoOnline[]).filter((pedido) => {
      const fecha = pedido.created_at.slice(0, 10);
      const coincideBusqueda = !termino || [pedido.numero, pedido.cliente_nombre, pedido.cliente_email, pedido.cliente_telefono]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase("es-AR").includes(termino));
      return coincideBusqueda
        && (estadoFiltro === "todos" || pedido.estado === estadoFiltro)
        && (pagoFiltro === "todos" || pedido.estado_pago === pagoFiltro)
        && (!desde || fecha >= desde)
        && (!hasta || fecha <= hasta);
    });
  }, [pedidos, busqueda, estadoFiltro, pagoFiltro, desde, hasta]);

  const limpiarFiltros = () => { setBusqueda(""); setEstadoFiltro("todos"); setPagoFiltro("todos"); setDesde(""); setHasta(""); };
  const hayFiltros = Boolean(busqueda || estadoFiltro !== "todos" || pagoFiltro !== "todos" || desde || hasta);
  const marcarPedidoComoVisto = (pedidoId: string) => notificaciones
    .filter((notificacion) => !notificacion.leida && metadataPedidoId(notificacion.metadata) === pedidoId)
    .forEach((notificacion) => marcarLeida(notificacion.id));

  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <div><h1 className="flex items-center gap-2 text-3xl font-bold"><ShoppingBag className="h-7 w-7" />Pedidos online</h1><p className="text-muted-foreground">Pedidos confirmados desde la tienda. El stock queda reservado automáticamente.</p></div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_170px_150px_150px_auto]">
      <div className="relative md:col-span-2 xl:col-span-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar pedido o cliente" /></div>
      <Select value={estadoFiltro} onValueChange={setEstadoFiltro}><SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{estados.map((estado) => <SelectItem value={estado} key={estado}>{labels[estado]}</SelectItem>)}</SelectContent></Select>
      <Select value={pagoFiltro} onValueChange={setPagoFiltro}><SelectTrigger><SelectValue placeholder="Pago" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los pagos</SelectItem><SelectItem value="aprobado">Pago aprobado</SelectItem><SelectItem value="no_iniciado">A coordinar</SelectItem></SelectContent></Select>
      <Input aria-label="Desde" type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
      <Input aria-label="Hasta" type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
      <Button variant="outline" onClick={limpiarFiltros} disabled={!hayFiltros}><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
    </CardContent></Card>
    {!isLoading && <p className="text-sm text-muted-foreground">{pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? "pedido" : "pedidos"}</p>}
    {isLoading ? <p>Cargando pedidos...</p> : pedidos.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">Todavía no se recibieron pedidos online.</CardContent></Card> : pedidosFiltrados.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No encontramos pedidos con esos filtros.</CardContent></Card> :
      <div className="grid gap-3">{pedidosFiltrados.map((pedido) => <Card key={pedido.id}><details onToggle={(event) => { if (event.currentTarget.open) marcarPedidoComoVisto(pedido.id); }}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><p className="font-semibold">Pedido #{pedido.numero}</p><p className="mt-1 truncate text-sm text-muted-foreground">{pedido.cliente_nombre} · {new Date(pedido.created_at).toLocaleString("es-AR")}</p></div><div className="flex shrink-0 items-center gap-2"><Badge variant={pedido.estado_pago === "aprobado" ? "default" : "outline"} className="hidden sm:inline-flex">Pago: {pedido.estado_pago === "aprobado" ? "aprobado" : "a coordinar"}</Badge><Badge variant={pedido.estado === "cancelado" ? "destructive" : "secondary"}>{labels[pedido.estado]}</Badge><ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[open]_&]:rotate-180" /></div></summary>
        <CardContent className="grid gap-6 border-t pt-6 lg:grid-cols-[1fr_260px]"><div className="space-y-4"><div className="rounded-md border p-4"><div className="mb-2 flex flex-wrap items-center gap-2"><p className="font-semibold">{pedido.cliente_nombre}</p><Badge variant={pedido.cliente_id ? "default" : "outline"}>{pedido.cliente_id ? "Cliente vinculado" : "Vinculación pendiente"}</Badge></div><p className="text-sm">{pedido.cliente_email}</p><p className="text-sm">{pedido.cliente_telefono}</p><p className="text-sm text-muted-foreground">{pedido.cliente_direccion}</p>{pedido.cliente && <p className="mt-2 text-xs text-muted-foreground">Ficha: {pedido.cliente.nombre} {pedido.cliente.apellido}</p>}{pedido.observaciones && <p className="mt-2 text-sm">Nota: {pedido.observaciones}</p>}</div><div className="divide-y rounded-md border">{pedido.pedido_online_items.map((item) => <div key={item.id} className="flex justify-between gap-4 p-3 text-sm"><span><b>{item.cantidad} ×</b> {item.descripcion}</span><b>{money(item.subtotal)}</b></div>)}</div></div><div className="space-y-4"><div className="rounded-md bg-muted p-4"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{money(pedido.total)}</p></div><div><label className="mb-2 block text-sm font-medium">Estado del pedido</label><Select value={pedido.estado} disabled={isUpdating || pedido.estado === "cancelado"} onValueChange={(estado) => actualizarEstado({ id: pedido.id, estado: estado as EstadoPedidoOnline })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{estados.map((estado) => <SelectItem value={estado} key={estado}>{labels[estado]}</SelectItem>)}</SelectContent></Select></div><p className="flex gap-2 text-xs text-muted-foreground"><PackageCheck className="h-4 w-4" />Al cancelar se repone el stock automáticamente.</p></div></CardContent>
      </details></Card>)}</div>}
  </div>;
}
