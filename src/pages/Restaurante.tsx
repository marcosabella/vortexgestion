import { useEffect, useState } from "react";
import { Eye, Plus, PackageCheck, Truck, Check, LogOut, AlertTriangle, CreditCard, Receipt, Ban, RotateCcw, Phone } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { RestauranteGrilla, RestauranteAccion } from "@/components/restaurante/RestauranteGrilla";
import { RestauranteMesasGrilla, RestauranteCocinaGrilla, RestauranteRendicionesGrilla } from "@/components/restaurante/RestauranteBandejas";
import { RestauranteVenta } from "@/components/restaurante/RestauranteVenta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRestaurante } from "@/hooks/useRestaurante";
import { useComercio } from "@/hooks/useComercio";
import { restauranteSecciones } from "@/config/restauranteNavigation";
import { NuevoPedido, AgregarProducto, Modal } from "@/components/restaurante/RestauranteForms";
import { RestauranteOperacion, type OperacionElegida } from "@/components/restaurante/RestauranteOperacion";
import { RestauranteBusqueda } from "@/components/restaurante/RestauranteBusqueda";
import { RestauranteConfiguracion } from "@/components/restaurante/RestauranteConfiguracion";
import { restauranteAbierto as abierto, restauranteMoney as money, restauranteMesas, restauranteSaldo, restauranteCobrosRendibles, restauranteTiempo } from "@/utils/restaurante";
import { RestauranteImpresion } from "@/components/restaurante/RestauranteImpresion";
import type { AccionRestaurante, ComandaRestaurante, ItemRestaurante, PedidoRestaurante, PermisoRestaurante } from "@/types/restaurante";

const instrucciones: Record<PermisoRestaurante, string> = {
  pedidos: "1. Registrá el pedido, agregá productos y enviá la nueva ronda a cocina.", salon: "Abrí una mesa, agregá rondas, serví los productos listos y solicitá la cuenta.",
  cocina: "2. Aceptá la comanda, prepará los productos y marcá cada uno como listo.", despacho: "3. Controlá el pedido listo, armalo y registrá el retiro o asigná un repartidor.",
  envios: "4. Registrá la salida y la entrega de cada pedido. El cobro se registra por cliente.", cobros: "5. Registrá cobros anticipados, parciales o divididos por productos.",
  cierre: "6. Recibí el efectivo rendido y cerrá las cuentas entregadas. Administración genera el comprobante.", configuracion: "Configurá modalidades, sectores, mesas, carta y permisos antes de operar.",
};
function Etapa({ p, items, envio }: { p: PedidoRestaurante; items: ItemRestaurante[]; envio?: string }) {
  const activos = items.filter(i => i.estado !== "cancelada");
  const texto = !abierto(p) ? p.estado : envio || (p.cuenta === "solicitada" ? "Cuenta solicitada" : activos.length && activos.every(i => i.estado === "entregada") ? "Entregado · pendiente de cierre" : p.armado ? "Armado" : activos.length && activos.every(i => ["lista", "entregada"].includes(i.estado)) ? "Listo" : p.estado);
  return <Badge className="max-w-full whitespace-normal break-words" variant={p.prioridad ? "destructive" : "secondary"}>{texto}</Badge>;
}
export default function Restaurante({ vista }: { vista: PermisoRestaurante }) {
  const query = useRestaurante(); const { comercio } = useComercio();
  const [nuevo, setNuevo] = useState<string | boolean>(false); const [detalle, setDetalle] = useState<string | null>(null); const [agregar, setAgregar] = useState(false);
  const [ventaDetalle, setVentaDetalle] = useState<string | null>(null);
  const [elegida, setElegida] = useState<OperacionElegida | null>(null); const [buscar, setBuscar] = useState(""); const [sector, setSector] = useState(""); const [historial, setHistorial] = useState(false);
  const [ahora, setAhora] = useState(Date.now()); const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const timer = window.setInterval(() => setAhora(Date.now()), 30000); const update = () => setOnline(navigator.onLine); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { clearInterval(timer); window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);
  useEffect(() => { setDetalle(null); setElegida(null); setAgregar(false); setNuevo(false); setVentaDetalle(null); }, [vista, comercio?.id]);
  const data = query.data;
  if (query.isLoading) return <p className="p-6">Cargando restaurante…</p>;
  if (!data) return <div className="grid gap-3 p-6"><h1 className="text-2xl font-bold">Vortex Restaurante / Delivery</h1><p role="alert">{query.error?.message || "Sin datos"}</p><p>El módulo necesita sus migraciones instaladas, habilitación en parametrización y permisos asignados.</p><Button onClick={() => void query.refetch()}>Reintentar</Button></div>;
  const ctx = { data, operar: query.operar, trabajando: query.trabajando };
  const hayRendicion = restauranteCobrosRendibles(data).length > 0;
  const puede = (permiso: PermisoRestaurante) => data.admin || data.permisos.includes(permiso);
  const seleccionada = data.pedidos.find(p => p.id === detalle);
  const itemsPedido = (p: PedidoRestaurante) => data.items.filter(i => i.pedido_id === p.id);
  const envioPedido = (p: PedidoRestaurante) => data.envios.find(e => e.pedido_id === p.id);
  const listo = (p: PedidoRestaurante) => { const items = itemsPedido(p).filter(i => i.estado !== "cancelada"); return items.length > 0 && items.every(i => ["lista", "entregada"].includes(i.estado)); };
  const entregado = (p: PedidoRestaurante) => listo(p) && itemsPedido(p).every(i => ["entregada", "cancelada"].includes(i.estado));
  const ejecutar = (accion: AccionRestaurante, p: PedidoRestaurante, extra = {}) => void query.operar(accion, { pedido_id: p.id, version: p.version, ...extra });
  const accion = (accion: AccionRestaurante, p?: PedidoRestaurante, extra = {}) => setElegida({ accion, pedido: p, ...extra });
  const imprimir = async (c: ComandaRestaurante, p: PedidoRestaurante) => Boolean(await query.operar("impresion", { pedido_id: p.id, version: p.version, comanda_id: c.id }));
  const pedidos = data.pedidos.filter(p => (historial || abierto(p)) && `${p.numero} ${p.cliente_nombre} ${p.telefono} ${restauranteMesas(data, p.id)}`.toLowerCase().includes(buscar.toLowerCase())).sort((a, b) => Number(b.prioridad) - Number(a.prioridad) || Date.parse(a.created_at) - Date.parse(b.created_at));
  const visibles = pedidos.filter(p => vista === "despacho" ? p.modalidad !== "mesa" : vista === "envios" ? Boolean(envioPedido(p)) : vista === "cierre" ? entregado(p) || !abierto(p) : true);
  const mostrarDireccion = visibles.some(p => p.direccion.trim());
  const mostrarPrometido = visibles.some(p => p.prometido_at);
  const comandas = data.comandas.filter(c => (!sector || c.sector_id === sector) && (pedidos.some(p => p.id === c.pedido_id) || c.aviso_cancelacion) && (historial || c.aviso_cancelacion || data.items.some(i => i.comanda_id === c.id && !["entregada", "cancelada"].includes(i.estado))));
  const filaPedido = (p: PedidoRestaurante) => <TableRow key={p.id}>
    <TableCell className="font-medium">#{p.numero}{p.prioridad && <div className="mt-1"><Badge variant="destructive">Prioridad</Badge></div>}</TableCell>
    <TableCell>{p.cliente_nombre}<p className="text-xs text-muted-foreground">{p.telefono}</p></TableCell>
    <TableCell>{p.modalidad === "mesa" ? "Salón / mesa" : p.modalidad === "retiro" ? "Retiro" : "Delivery"}<p className="text-xs text-muted-foreground">{restauranteMesas(data, p.id)}</p></TableCell>
    {mostrarDireccion && <TableCell>{p.direccion || "—"}</TableCell>}<TableCell title={p.modalidad === "mesa" ? "Desde la apertura del pedido hasta el cierre de la cuenta" : "Desde el registro del pedido hasta su cierre"}>{restauranteTiempo(data, p, ahora).minutos === null ? "Sin dato" : `${restauranteTiempo(data, p, ahora).minutos} min`}<p className="text-xs text-muted-foreground">{restauranteTiempo(data, p, ahora).finalizado ? "Finalizado" : "En curso"}</p></TableCell>{mostrarPrometido && <TableCell>{p.prometido_at ? new Date(p.prometido_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>}
    <TableCell><Etapa p={p} items={itemsPedido(p)} envio={envioPedido(p)?.estado} /></TableCell>
    {vista === "envios" && <TableCell>{data.usuarios.find(u => u.id === envioPedido(p)?.repartidor_id)?.nombre || "—"}</TableCell>}
    <TableCell className="whitespace-nowrap text-right font-medium">{money(p.total)}</TableCell><TableCell className="whitespace-nowrap text-right">{money(restauranteSaldo(data, p).saldo)}</TableCell><TableCell>
    <div className="flex flex-wrap items-center justify-end gap-1"><RestauranteAccion compacta icon={Eye} onClick={() => setDetalle(p.id)}>Ver pedido</RestauranteAccion>
      {vista === "despacho" && listo(p) && abierto(p) && <>{!p.armado ? <RestauranteAccion compacta icon={PackageCheck} variant="success" disabled={query.trabajando} onClick={() => ejecutar("armar", p)}>Controlar y armar</RestauranteAccion> : p.modalidad === "retiro" ? !entregado(p) && <RestauranteAccion compacta icon={Check} variant="success" disabled={query.trabajando} onClick={() => ejecutar("retirar", p)}>Registrar retiro</RestauranteAccion> : (!envioPedido(p) || ["asignado", "incidencia"].includes(envioPedido(p)!.estado)) && <RestauranteAccion compacta icon={Truck} onClick={() => accion("asignar_envio", p)}>Asignar reparto</RestauranteAccion>}</>}
      {vista === "envios" && abierto(p) && <>{envioPedido(p)?.estado === "asignado" && <RestauranteAccion compacta icon={LogOut} disabled={query.trabajando} onClick={() => ejecutar("salida", p)}>Registrar salida</RestauranteAccion>}{envioPedido(p)?.estado === "en_camino" && <RestauranteAccion compacta icon={Check} variant="success" disabled={query.trabajando} onClick={() => ejecutar("entregar", p)}>Registrar entrega</RestauranteAccion>}{["asignado", "en_camino"].includes(envioPedido(p)?.estado || "") && <RestauranteAccion compacta icon={AlertTriangle} onClick={() => accion("incidencia", p)}>Incidencia</RestauranteAccion>}{p.telefono && <RestauranteAccion compacta icon={Phone} asChild><a href={`tel:${p.telefono}`}>Llamar</a></RestauranteAccion>}</>}
      {(vista === "cobros" || (vista === "envios" && ["en_camino", "entregado"].includes(envioPedido(p)?.estado || ""))) && abierto(p) && restauranteSaldo(data, p).saldo > 0 && <RestauranteAccion compacta icon={CreditCard} onClick={() => accion("cobro", p)}>Registrar cobro</RestauranteAccion>}
      {vista === "cierre" && data.admin && abierto(p) && entregado(p) && <RestauranteAccion compacta icon={Receipt} onClick={() => accion("cerrar", p)}>Cerrar y facturar</RestauranteAccion>}
      {p.venta_id && <RestauranteAccion compacta icon={Receipt} onClick={() => setVentaDetalle(p.venta_id)}>Ver venta</RestauranteAccion>}
    </div>
    </TableCell>
  </TableRow>;
  return <div className="grid min-w-0 gap-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">Vortex Restaurante / Delivery</p><h1 className="text-2xl font-bold">{restauranteSecciones.find(s => s.vista === vista)?.title}</h1><p className="mt-1 text-sm text-muted-foreground">{instrucciones[vista]}</p></div>{["pedidos", "salon"].includes(vista) && puede(vista) && <Button variant="new" onClick={() => setNuevo(true)}><Plus className="h-4 w-4" />Nuevo pedido / abrir mesa</Button>}</header>
    {!online && <p role="status" className="rounded border p-3">Sin conexión. No confirmes una entrega o cobro hasta recibir respuesta del sistema. Al volver la conexión se actualizarán los datos.</p>}
    {query.error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded border p-3"><p>No se pudo actualizar la bandeja: {query.error.message}. Se muestra la última consulta recibida.</p><Button variant="outline" onClick={() => void query.refetch()}>Actualizar</Button></div>}
    {query.pendientes.length > 0 && <section className="grid gap-2 rounded border p-3"><p>Operaciones pendientes de confirmación. Reintentá para comprobar el resultado sin duplicar registros.</p>{query.pendientes.map(p => <Button key={p.clave} variant="outline" disabled={query.trabajando} onClick={() => void query.reintentar(p)}>Reintentar {p.accion}</Button>)}</section>}
    {!puede(vista) ? <p>Tu usuario no tiene permiso para esta pantalla. Elegí una opción disponible.</p> : vista === "configuracion" ? <RestauranteConfiguracion {...ctx} /> : <>
      <div className="flex flex-wrap gap-3"><Input className="max-w-sm" aria-label="Buscar pedido" placeholder="Pedido, cliente o mesa…" value={buscar} onChange={e => setBuscar(e.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={historial} onChange={e => setHistorial(e.target.checked)} />Incluir finalizados</label>{vista === "cocina" && <RestauranteBusqueda label="Sector de cocina" className="w-full sm:max-w-xs" value={sector} opciones={[{ id: "", nombre: "Todos los sectores disponibles" }, ...data.sectores.filter(s => !data.sector_id || data.sector_id === s.id).map(s => ({ id: s.id, nombre: s.nombre }))]} cambiar={setSector} />}{vista === "cierre" && <Button disabled={query.trabajando || !hayRendicion} title={hayRendicion ? "Recibir efectivo pendiente" : "No hay cobros en efectivo disponibles para rendir"} onClick={() => accion("rendir")}><CreditCard className="h-4 w-4" />Recibir rendición</Button>}</div>
      {vista === "salon" ? <RestauranteMesasGrilla data={data} buscar={buscar} abrir={setDetalle} ocupar={setNuevo} estado={p => <Etapa p={p} items={itemsPedido(p)} />} />
      : vista === "cocina" ? <RestauranteCocinaGrilla data={data} comandas={comandas} ahora={ahora} trabajando={query.trabajando} ejecutar={ejecutar} imprimir={imprimir} />
      : <RestauranteGrilla compacta label={restauranteSecciones.find(s => s.vista === vista)?.title || "Pedidos"} columnas={[{ titulo: "Pedido" }, { titulo: "Cliente / contacto" }, { titulo: "Modalidad / mesa" }, ...(mostrarDireccion ? [{ titulo: "Dirección" }] : []), { titulo: "Tiempo de atención" }, ...(mostrarPrometido ? [{ titulo: "Prometido" }] : []), { titulo: "Estado" }, ...(vista === "envios" ? [{ titulo: "Repartidor" }] : []), { titulo: "Total", derecha: true }, { titulo: "Saldo", derecha: true }, { titulo: "Acciones", derecha: true }]} vacia={!visibles.length ? "No hay pedidos para mostrar." : undefined}>{visibles.map(filaPedido)}</RestauranteGrilla>}
      {vista === "cierre" && <RestauranteRendicionesGrilla data={data} />}
    </>}
    {nuevo && <NuevoPedido {...ctx} mesaId={typeof nuevo === "string" ? nuevo : undefined} close={() => setNuevo(false)} abrir={id => setDetalle(id)} />}
    {seleccionada && !agregar && !elegida && <Modal title={`Pedido #${seleccionada.numero} · ${seleccionada.modalidad}`} close={() => setDetalle(null)} description="Consultá productos, cobros, estado y comprobantes del pedido."><div className="grid gap-4">
      <p>{seleccionada.cliente_nombre} · {restauranteMesas(data, seleccionada.id)} · {seleccionada.telefono}</p>{seleccionada.direccion && <p>{seleccionada.direccion} · {seleccionada.instrucciones_envio}</p>}<p>Observaciones cocina: {seleccionada.observaciones || "Sin observaciones"}</p><Etapa p={seleccionada} items={itemsPedido(seleccionada)} envio={envioPedido(seleccionada)?.estado} />
      <RestauranteGrilla label="Productos del pedido" columnas={[{ titulo: "Producto / adicionales" }, { titulo: "Cantidad", derecha: true }, { titulo: "Precio", derecha: true }, { titulo: "Estado" }, { titulo: "Acciones", derecha: true }]} vacia={!itemsPedido(seleccionada).length ? "No hay productos en el pedido." : undefined}>
        {itemsPedido(seleccionada).map(i => <TableRow key={i.id}><TableCell className="min-w-40"><p className="font-medium">{i.descripcion}</p><p className="text-xs text-muted-foreground">{i.adicionales.map(a => a.nombre).join(", ")} {i.observaciones}</p></TableCell><TableCell className="text-right">{i.cantidad}</TableCell><TableCell className="whitespace-nowrap text-right">{money(i.precio)}</TableCell><TableCell><Badge variant={i.estado === "cancelada" ? "destructive" : "secondary"}>{i.estado}</Badge></TableCell><TableCell><div className="flex items-center justify-end gap-2">{puede("salon") && seleccionada.modalidad === "mesa" && i.estado === "lista" && <RestauranteAccion icon={Check} variant="success" disabled={query.trabajando} onClick={() => ejecutar("servir", seleccionada, { item_id: i.id })}>Servir producto</RestauranteAccion>}{abierto(seleccionada) && (data.admin || (i.estado === "borrador" && (puede("pedidos") || puede("salon")))) && !["cancelada", "entregada"].includes(i.estado) && <RestauranteAccion icon={Ban} variant="destructive" onClick={() => accion("cancelar_item", seleccionada, { item_id: i.id })}>Cancelar producto</RestauranteAccion>}</div></TableCell></TableRow>)}
      </RestauranteGrilla>
      <p className="font-semibold">Total {money(seleccionada.total)} · Cobrado {money(restauranteSaldo(data, seleccionada).cobrado)} · Saldo {money(restauranteSaldo(data, seleccionada).saldo)}</p>
      {(puede("salon") || puede("cobros")) && <RestauranteImpresion data={data} pedido={seleccionada} disabled={query.trabajando} />}
      {abierto(seleccionada) && <div className="flex flex-wrap gap-2">{(puede("pedidos") || (puede("salon") && seleccionada.modalidad === "mesa")) && seleccionada.cuenta === "abierta" && !seleccionada.armado && <><Button onClick={() => setAgregar(true)}>Agregar productos / nueva ronda</Button>{itemsPedido(seleccionada).some(i => i.estado === "borrador") && <Button disabled={query.trabajando} onClick={() => ejecutar("enviar", seleccionada)}>Enviar nuevos productos a cocina</Button>}</>}{puede("salon") && seleccionada.modalidad === "mesa" && <><Button variant="outline" onClick={() => accion("mover_mesa", seleccionada)}>Mover mesa</Button><Button variant="outline" onClick={() => accion("unir", seleccionada)}>Unir cuentas</Button>{seleccionada.cuenta === "abierta" && entregado(seleccionada) && <Button disabled={query.trabajando} onClick={() => ejecutar("solicitar_cuenta", seleccionada)}>Solicitar cuenta</Button>}</>}{puede("cobros") && restauranteSaldo(data, seleccionada).saldo > 0 && <Button onClick={() => accion("cobro", seleccionada)}>Cobrar</Button>}{data.admin && <Button variant="destructive" onClick={() => accion("cancelar", seleccionada)}>Cancelar pedido</Button>}</div>}
      <section className="grid gap-3"><h3 className="font-semibold">Cobros</h3><RestauranteGrilla label="Cobros del pedido" columnas={[{ titulo: "Importe", derecha: true }, { titulo: "Medio" }, { titulo: "Pagador" }, { titulo: "Estado" }, { titulo: "Acciones", derecha: true }]} vacia={!data.cobros.some(c => c.pedido_id === seleccionada.id) ? "No hay cobros registrados." : undefined}>{data.cobros.filter(c => c.pedido_id === seleccionada.id).map(c => <TableRow key={c.id}><TableCell className="whitespace-nowrap text-right">{money(c.monto)}</TableCell><TableCell>{c.medio}</TableCell><TableCell>{c.pagador || "—"}</TableCell><TableCell><Badge variant={c.anulado ? "destructive" : "secondary"}>{c.anulado ? "Anulado" : c.rendicion_id ? "Rendido" : "Registrado"}</Badge></TableCell><TableCell><div className="flex justify-end">{data.admin && abierto(seleccionada) && !c.anulado && !c.rendicion_id && <RestauranteAccion icon={RotateCcw} variant="destructive" onClick={() => accion("anular_cobro", seleccionada, { cobro_id: c.id })}>Anular y devolver</RestauranteAccion>}</div></TableCell></TableRow>)}</RestauranteGrilla></section>
      <details><summary>Historial del pedido</summary><RestauranteGrilla label="Historial del pedido" columnas={[{ titulo: "Fecha" }, { titulo: "Acción" }, { titulo: "Motivo" }]} vacia={!data.eventos.some(e => e.pedido_id === seleccionada.id) ? "No hay movimientos registrados." : undefined}>{data.eventos.filter(e => e.pedido_id === seleccionada.id).map(e => <TableRow key={e.id}><TableCell className="whitespace-nowrap">{new Date(e.created_at).toLocaleString("es-AR")}</TableCell><TableCell>{e.accion}</TableCell><TableCell>{e.datos.motivo || "—"}</TableCell></TableRow>)}</RestauranteGrilla></details>
    </div></Modal>}
    {seleccionada && agregar && <AgregarProducto {...ctx} pedido={seleccionada} close={() => setAgregar(false)} />}
    {elegida && <RestauranteOperacion {...ctx} elegida={elegida} close={() => setElegida(null)} />}
    {ventaDetalle && <RestauranteVenta ventaId={ventaDetalle} close={() => setVentaDetalle(null)} />}
  </div>;
}
