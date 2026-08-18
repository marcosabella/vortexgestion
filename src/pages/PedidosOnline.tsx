import { PackageCheck, ShoppingBag } from "lucide-react";
import { usePedidosOnline, EstadoPedidoOnline } from "@/hooks/usePedidosOnline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const estados: EstadoPedidoOnline[] = ["recibido", "confirmado", "preparando", "listo", "entregado", "cancelado"];
const labels: Record<EstadoPedidoOnline,string> = { recibido:"Recibido", confirmado:"Confirmado", preparando:"Preparando", listo:"Listo para entregar", entregado:"Entregado", cancelado:"Cancelado" };
const money = (value:number) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(value);

export default function PedidosOnline() {
  const { pedidos, isLoading, actualizarEstado, isUpdating } = usePedidosOnline();
  return <div className="container mx-auto space-y-6 p-6">
    <div><h1 className="flex items-center gap-2 text-3xl font-bold"><ShoppingBag className="h-7 w-7"/>Pedidos online</h1><p className="text-muted-foreground">Pedidos recibidos desde la tienda y stock reservado automáticamente.</p></div>
    {isLoading ? <p>Cargando pedidos...</p> : pedidos.length===0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">Todavía no se recibieron pedidos online.</CardContent></Card> :
      <div className="grid gap-5">{pedidos.map((pedido:any)=><Card key={pedido.id}>
        <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Pedido #{pedido.numero}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{new Date(pedido.created_at).toLocaleString("es-AR")}</p></div><Badge variant={pedido.estado==="cancelado"?"destructive":"secondary"}>{labels[pedido.estado as EstadoPedidoOnline]}</Badge></CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4"><div className="rounded-md border p-4"><p className="font-semibold">{pedido.cliente_nombre}</p><p className="text-sm">{pedido.cliente_email}</p><p className="text-sm">{pedido.cliente_telefono}</p><p className="text-sm text-muted-foreground">{pedido.cliente_direccion}</p>{pedido.observaciones&&<p className="mt-2 text-sm">Nota: {pedido.observaciones}</p>}</div>
          <div className="divide-y rounded-md border">{pedido.pedido_online_items.map((item:any)=><div key={item.id} className="flex justify-between gap-4 p-3 text-sm"><span><b>{item.cantidad} ×</b> {item.descripcion}</span><b>{money(item.subtotal)}</b></div>)}</div></div>
          <div className="space-y-4"><div className="rounded-md bg-muted p-4"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{money(pedido.total)}</p></div><div><label className="mb-2 block text-sm font-medium">Estado del pedido</label><Select value={pedido.estado} disabled={isUpdating||pedido.estado==="cancelado"} onValueChange={(estado)=>actualizarEstado({id:pedido.id,estado:estado as EstadoPedidoOnline})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{estados.map(estado=><SelectItem value={estado} key={estado}>{labels[estado]}</SelectItem>)}</SelectContent></Select></div><p className="flex gap-2 text-xs text-muted-foreground"><PackageCheck className="h-4 w-4"/>Al cancelar se repone el stock automáticamente.</p></div>
        </CardContent></Card>)}</div>}
  </div>;
}
