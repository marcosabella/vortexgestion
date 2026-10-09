import type { ReactNode } from "react";
import { Ban, Check, CreditCard, Plus, Receipt, RotateCcw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Modal } from "./RestauranteForms";
import { RestauranteAccion, RestauranteGrilla } from "./RestauranteGrilla";
import { RestauranteImpresion } from "./RestauranteImpresion";
import { RestauranteComandasSalon } from "./RestauranteSalon";
import { restauranteAbierto, restauranteMesas, restauranteMoney as money, restauranteSaldo, restaurantePuedeCobrar } from "@/utils/restaurante";
import type { AccionRestaurante, ContextoRestaurante, ItemRestaurante, PedidoRestaurante, PermisoRestaurante } from "@/types/restaurante";

const estados: Record<ItemRestaurante["estado"], string> = { borrador: "Sin enviar", pendiente: "Pendiente", aceptada: "Aceptado", preparacion: "En preparación", lista: "Listo", entregada: "Servido / entregado", cancelada: "Cancelado" };
export function RestauranteDetalle({ data, pedido, trabajando, estado, entregado, close, agregar, verVenta, ejecutar, accion }: ContextoRestaurante & {
  pedido: PedidoRestaurante; estado: ReactNode; entregado: boolean; close: () => void; agregar: () => void; verVenta: () => void;
  ejecutar: (accion: AccionRestaurante, extra?: Record<string, string>) => void;
  accion: (accion: AccionRestaurante, extra?: Record<string, string>) => void;
}) {
  const puede = (permiso: PermisoRestaurante) => data.admin || data.permisos.includes(permiso);
  const abierto = restauranteAbierto(pedido);
  const items = data.items.filter(i => i.pedido_id === pedido.id);
  const cobros = data.cobros.filter(c => c.pedido_id === pedido.id);
  const eventos = data.eventos.filter(e => e.pedido_id === pedido.id);
  const saldo = restauranteSaldo(data, pedido);
  const ampliar = abierto && (puede("pedidos") || (puede("salon") && pedido.modalidad === "mesa")) && pedido.cuenta === "abierta" && !pedido.armado;
  const salon = abierto && puede("salon") && pedido.modalidad === "mesa";
  const permisoCobrar = puede("cobros") || (puede("salon") && pedido.modalidad === "mesa");
  const puedeCobrar = permisoCobrar && restaurantePuedeCobrar(pedido);
  const accionesItem = (i: ItemRestaurante) => <div className="flex flex-wrap justify-end gap-1">
    {puede("salon") && pedido.modalidad === "mesa" && i.estado === "lista" && <RestauranteAccion compacta icon={Check} variant="success" disabled={trabajando} onClick={() => ejecutar("servir", { item_id: i.id })}>Servir producto</RestauranteAccion>}
    {abierto && (data.admin || (i.estado === "borrador" && (puede("pedidos") || puede("salon")))) && !["cancelada", "entregada"].includes(i.estado) && <RestauranteAccion compacta icon={Ban} variant="destructive" disabled={trabajando} onClick={() => accion("cancelar_item", { item_id: i.id })}>Cancelar producto</RestauranteAccion>}
  </div>;
  const descripcionItem = (i: ItemRestaurante) => <><p className="break-words font-medium">{i.descripcion}</p>{i.adicionales.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{i.adicionales.map(a => a.nombre).join(", ")}</p>}{i.observaciones && <p className="mt-1 break-words text-xs text-muted-foreground">{i.observaciones}</p>}</>;
  return <Modal title={`Pedido #${pedido.numero} · ${pedido.modalidad === "mesa" ? "Salón / mesa" : pedido.modalidad === "retiro" ? "Retiro" : "Delivery"}`} close={close} amplio className="w-[calc(100%-2rem)]" description="Productos y estado de la cuenta.">
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="grid min-w-0 content-start gap-4">
        <section className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto]" aria-label="Datos del pedido">
          <div className="min-w-0"><h3 className="break-words font-semibold">{pedido.cliente_nombre}</h3>{pedido.telefono && <p className="mt-1 text-sm text-muted-foreground">Teléfono: {pedido.telefono}</p>}{pedido.direccion && <p className="mt-1 break-words text-sm text-muted-foreground">{pedido.direccion}</p>}{pedido.instrucciones_envio && <p className="mt-1 break-words text-sm">Reparto: {pedido.instrucciones_envio}</p>}</div>
          <div className="grid content-start gap-2 sm:text-right">{pedido.modalidad === "mesa" && <p className="text-sm font-medium">{restauranteMesas(data, pedido.id)} · {pedido.comensales} comensales</p>}<div>{estado}</div>{pedido.prometido_at && <p className="text-xs text-muted-foreground">Prometido: {new Date(pedido.prometido_at).toLocaleString("es-AR")}</p>}</div>
          {pedido.observaciones && <p className="break-words border-t pt-2 text-sm sm:col-span-2"><span className="font-medium">Observaciones cocina: </span>{pedido.observaciones}</p>}
        </section>
        <section className="grid min-w-0 gap-2" aria-label="Detalle de productos"><h3 className="text-sm font-semibold">Productos <span className="font-normal text-muted-foreground">({items.length})</span></h3>
          <div className="hidden sm:block"><RestauranteGrilla ajustada label="Productos del pedido" columnas={[{ titulo: "Producto / adicionales", ancho: "36%" }, { titulo: "Cant.", derecha: true, ancho: "9%" }, { titulo: "Importe", derecha: true, ancho: "22%" }, { titulo: "Estado", ancho: "21%" }, { titulo: "Acciones", derecha: true, ancho: "12%" }]} vacia={!items.length ? "No hay productos en el pedido." : undefined}>
            {items.map(i => <TableRow key={i.id}><TableCell>{descripcionItem(i)}</TableCell><TableCell className="text-right">{i.cantidad}</TableCell><TableCell className="text-right"><p className="font-medium">{money(i.cantidad * i.precio)}</p><p className="mt-1 text-xs text-muted-foreground">{money(i.precio)} c/u</p></TableCell><TableCell><Badge className="whitespace-normal" variant={i.estado === "cancelada" ? "destructive" : "secondary"}>{estados[i.estado]}</Badge></TableCell><TableCell>{accionesItem(i)}</TableCell></TableRow>)}
          </RestauranteGrilla></div>
          <div className="grid gap-2 sm:hidden">{items.length ? items.map(i => <article key={i.id} className="grid min-w-0 gap-2 rounded-md border p-3">{descripcionItem(i)}<div className="flex flex-wrap items-center justify-between gap-2"><Badge variant={i.estado === "cancelada" ? "destructive" : "secondary"}>{estados[i.estado]}</Badge><span className="text-sm">{i.cantidad} × {money(i.precio)}</span></div><div className="flex items-center justify-between gap-2"><strong>{money(i.cantidad * i.precio)}</strong>{accionesItem(i)}</div></article>) : <p className="rounded-md border p-3 text-sm text-muted-foreground">No hay productos en el pedido.</p>}</div>
        </section>
        {pedido.modalidad === "mesa" && <RestauranteComandasSalon data={data} pedido={pedido} />}
        <dl className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-sm"><div className="min-w-0"><dt className="text-muted-foreground">Total</dt><dd className="mt-1 break-words font-semibold">{money(pedido.total)}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">Cobrado</dt><dd className="mt-1 break-words font-semibold">{money(saldo.cobrado)}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">Saldo pendiente</dt><dd className="mt-1 break-words font-semibold text-primary">{money(saldo.saldo)}</dd></div></dl>
        <details className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Cobros ({cobros.length})</summary><div className="mt-3 grid gap-2">{cobros.length ? cobros.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><div className="min-w-0"><p className="font-medium">{money(c.monto)} · {c.medio}</p>{c.pagador && <p className="break-words text-muted-foreground">{c.pagador}</p>}<p className="text-xs text-muted-foreground">{c.anulado ? "Anulado" : c.rendicion_id ? "Rendido" : "Registrado"}</p></div>{data.admin && abierto && !c.anulado && !c.rendicion_id && <RestauranteAccion icon={RotateCcw} variant="destructive" disabled={trabajando} onClick={() => accion("anular_cobro", { cobro_id: c.id })}>Anular y devolver</RestauranteAccion>}</div>) : <p className="text-sm text-muted-foreground">No hay cobros registrados.</p>}</div></details>
        <details className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Historial del pedido</summary><ol className="mt-3 grid gap-2">{eventos.length ? eventos.map(e => <li key={e.id} className="break-words border-l-2 pl-3 text-sm"><p className="font-medium">{e.accion}</p><p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("es-AR")}</p>{e.datos.motivo && <p>{e.datos.motivo}</p>}</li>) : <li className="text-sm text-muted-foreground">No hay movimientos registrados.</li>}</ol></details>
      </div>
      <aside aria-label="Acciones del pedido" className="grid min-w-0 content-start gap-4 rounded-lg border bg-muted/20 p-3 [&_button]:h-auto [&_button]:min-h-9 [&_button]:justify-start [&_button]:whitespace-normal [&_button]:text-left">
        {abierto && pedido.modalidad === "mesa" && pedido.cuenta === "abierta" && permisoCobrar && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{saldo.cobrado > 0 ? "Esta mesa tiene pagos registrados. Solicitá la cuenta y completá el cierre sin volver a cobrar lo ya pagado." : entregado ? "Solicitá la cuenta para habilitar el cobro de la mesa." : "Serví todos los productos y solicitá la cuenta antes de cobrar."}</p>}
        {ampliar && <section className="grid gap-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos y cocina</h3><Button title="Agregar productos / nueva ronda" disabled={trabajando} onClick={agregar}><Plus />Agregar productos</Button>{items.some(i => i.estado === "borrador") && <Button title="Enviar nuevos productos a cocina" variant="success" disabled={trabajando} onClick={() => ejecutar("enviar")}><Send />Enviar a cocina</Button>}</section>}
        {abierto && (salon || (puedeCobrar && saldo.saldo > 0)) && <section className="grid gap-2 border-t pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mesa y cuenta</h3>{puedeCobrar && saldo.saldo > 0 && <Button disabled={trabajando} onClick={() => accion("cobro")}><CreditCard />Cobrar</Button>}{salon && <><Button variant="outline" disabled={trabajando} onClick={() => accion("mover_mesa")}>Mover mesa</Button><Button variant="outline" disabled={trabajando} onClick={() => accion("unir")}>Unir cuentas</Button>{pedido.cuenta === "abierta" && entregado && <Button disabled={trabajando} onClick={() => accion("solicitar_cuenta")}>Solicitar cuenta</Button>}</>}</section>}
        {data.admin && abierto && entregado && (pedido.modalidad !== "mesa" || pedido.cuenta === "solicitada") && <section className="grid gap-2 border-t pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cerrar cuenta</h3><Button disabled={trabajando} onClick={() => accion("cerrar")}><Receipt />Cerrar y generar comprobante</Button></section>}
        {(puede("salon") || puede("cobros")) && <section className="grid gap-2 border-t pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comprobantes</h3>{pedido.venta_id ? <Button variant="print" onClick={verVenta}><Receipt />Ver / imprimir comprobante</Button> : <RestauranteImpresion vertical data={data} pedido={pedido} disabled={trabajando} />}</section>}
        {abierto && data.admin && <section className="border-t pt-3"><Button className="w-full" variant="outline" disabled={trabajando} onClick={() => accion("cancelar")}><Ban />Cancelar pedido</Button></section>}
      </aside>
    </div>
  </Modal>;
}
