import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, CheckCheck, Clock3, CreditCard, MapPin, Navigation, Phone, RefreshCw, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restauranteMoney as money, restaurantePuedeCobrar, restauranteSaldo } from "@/utils/restaurante";
import { restauranteRepartos, restauranteEfectivoRepartidor, restauranteEntregaHoy, restauranteMinutosReparto } from "@/utils/restauranteRepartidor";
import type { AccionRestaurante, ContextoRestaurante, PedidoRestaurante } from "@/types/restaurante";

type Props = ContextoRestaurante & {
  ahora: number; online: boolean; comercioNombre?: string; error?: string; pendientes: number;
  actualizar: () => void; accion: (accion: AccionRestaurante, pedido: PedidoRestaurante) => void;
};
const etiquetas = { asignado: "Asignado", en_camino: "En camino", incidencia: "Con incidencia", entregado: "Entregado", cancelado: "Cancelado" };
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function RestauranteRepartidor({ data, trabajando, errorOperacion, ahora, online, comercioNombre, error, pendientes, actualizar, accion }: Props) {
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [nuevos, setNuevos] = useState(0);
  const anteriores = useRef<Set<string> | null>(null);
  const repartos = restauranteRepartos(data);
  const efectivo = restauranteEfectivoRepartidor(data);
  const firma = repartos.filter(r => r.activo).map(r => r.envio.id).sort().join(",");
  useEffect(() => {
    const ids = new Set(firma ? firma.split(",") : []);
    if (anteriores.current) {
      const cantidad = [...ids].filter(id => !anteriores.current?.has(id)).length;
      if (cantidad) setNuevos(n => n + cantidad);
    }
    anteriores.current = ids;
  }, [firma]);
  const bloqueado = trabajando || !online || Boolean(error) || pendientes > 0;
  const entregadosHoy = repartos.filter(r => r.envio.estado === "entregado" && restauranteEntregaHoy(r.envio.entrega_at, ahora));
  const visibles = repartos.filter(r => (filtro === "todos" || filtro === "activos" && r.activo
    || filtro === "entregado" && r.envio.estado === "entregado" && restauranteEntregaHoy(r.envio.entrega_at, ahora)
    || r.activo && r.envio.estado === filtro)
    && normalizar(`${r.pedido.numero} ${r.pedido.cliente_nombre} ${r.pedido.direccion} ${r.pedido.telefono}`).includes(normalizar(buscar)))
    .sort((a, b) => ["todos", "entregado"].includes(filtro) ? Date.parse(b.pedido.created_at) - Date.parse(a.pedido.created_at) : 0);

  return <div data-terminal="repartidor" className="grid min-w-0 gap-5">
    <header className="relative overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_top_right,_#296570,_#112b35_65%)] p-5 text-white md:p-7">
      <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{comercioNombre || "Vortex Restaurante"} · Terminal de reparto</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Truck className="h-6 w-6" />Mis entregas</h1><p className="mt-2 text-sm text-slate-200">Tus pedidos asignados, el recorrido y los cobros.</p></div><Button variant="outline" disabled={!online} className="min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={actualizar}><RefreshCw className="h-4 w-4" />Actualizar</Button></div>
      <p className="mt-4 text-xs text-slate-200">{online ? "Actualización automática cada 5 segundos" : "Sin conexión · acciones pausadas"}</p>
    </header>
    <section aria-label="Resumen de mis entregas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Asignados", repartos.filter(r => r.activo && r.envio.estado === "asignado").length], ["En camino", repartos.filter(r => r.activo && r.envio.estado === "en_camino").length], ["Con incidencia", repartos.filter(r => r.activo && r.envio.estado === "incidencia").length], ["Entregados hoy", entregadosHoy.length]].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</section>
    {!online && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Sin conexión. Podés consultar los últimos datos recibidos. Las salidas, entregas y cobros están pausados.</p>}
    {error && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm">No se pudo actualizar: {error}. Actualizá antes de registrar acciones.</p>}
    {errorOperacion && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm">{errorOperacion}</p>}
    {nuevos > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3"><p className="flex items-center gap-2 text-sm"><BellRing className="h-4 w-4" />{nuevos} {nuevos === 1 ? "nuevo envío asignado" : "nuevos envíos asignados"}</p><Button size="sm" variant="ghost" onClick={() => { setNuevos(0); setFiltro("asignado"); setBuscar(""); }}>Ver asignados</Button></div>}
    <section aria-label="Mi efectivo pendiente" className="rounded-2xl border bg-card p-4"><h2 className="flex items-center gap-2 font-semibold"><Wallet className="h-5 w-5 text-sky-600" />Mi efectivo pendiente de rendición</h2><p className="mt-2 text-2xl font-semibold">{money(efectivo.pendiente)}</p><p className="mt-2 text-sm text-muted-foreground">Disponible para rendir: {money(efectivo.disponible)}. La recepción de la rendición la registra caja.</p>{efectivo.bloqueado > 0 && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{money(efectivo.bloqueado)} pendiente de resolver la entrega o incidencia antes de rendir.</p>}</section>
    <div className="grid gap-3"><Input aria-label="Buscar mi entrega" placeholder="Pedido, cliente, dirección o teléfono…" className="max-w-md" value={buscar} onChange={e => setBuscar(e.target.value)} /><div className="flex flex-wrap gap-2" aria-label="Filtrar mis entregas">{[["activos", "Activos"], ["asignado", "Asignados"], ["en_camino", "En camino"], ["incidencia", "Incidencias"], ["entregado", "Entregados hoy"], ["todos", "Historial"]].map(([id, label]) => <Button key={id} size="sm" className="min-h-11" variant={filtro === id ? "default" : "outline"} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</Button>)}</div></div>
    <section aria-label="Mis pedidos de reparto" className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">{visibles.map(({ envio, pedido, items, activo, puedeSalir, puedeEntregar }) => {
      const saldo = restauranteSaldo(data, pedido).saldo;
      const minutos = restauranteMinutosReparto(envio.salida_at, envio.entrega_at, ahora);
      const puedeCobrar = restaurantePuedeCobrar(pedido) && saldo > 0 && ["en_camino", "entregado"].includes(envio.estado);
      return <article key={envio.id} aria-label={`Mi entrega ${pedido.numero}`} className={`grid min-w-0 gap-4 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm ${envio.estado === "incidencia" ? "border-destructive/40" : pedido.prioridad ? "border-amber-500/40" : "border-border"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Pedido #{pedido.numero}</h2><p className="mt-1 break-words text-sm">{pedido.cliente_nombre}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-medium ${envio.estado === "en_camino" ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" : envio.estado === "entregado" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{etiquetas[envio.estado]}</span></div>
        {pedido.prioridad && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Entrega prioritaria</p>}
        <div className="grid gap-2 rounded-xl bg-muted/40 p-3"><p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{pedido.direccion || "Sin dirección registrada"}</span></p>{pedido.instrucciones_envio && <p className="break-words text-sm"><strong>Indicaciones: </strong>{pedido.instrucciones_envio}</p>}<div className="flex flex-wrap gap-2">{pedido.direccion.trim() && <Button variant="outline" className="min-h-11" asChild><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.direccion)}`} target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" />Abrir mapa</a></Button>}{pedido.telefono.trim() && <Button variant="outline" className="min-h-11" asChild><a href={`tel:${pedido.telefono}`}><Phone className="h-4 w-4" />Llamar</a></Button>}</div></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">{minutos !== null && <span className="flex items-center gap-1"><Clock3 className="h-4 w-4" />{minutos} min {envio.entrega_at ? "de recorrido" : "desde la salida"}</span>}{pedido.prometido_at && <span>Prometido: {new Date(pedido.prometido_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}{envio.entrega_at && <span>Entregado: {new Date(envio.entrega_at).toLocaleString("es-AR")}</span>}</div>
        <dl className="grid grid-cols-2 gap-2 border-y py-3 text-sm"><div><dt className="text-muted-foreground">Total</dt><dd className="mt-1 break-words font-semibold">{money(pedido.total)}</dd></div><div><dt className="text-muted-foreground">{saldo > 0 ? "Pendiente de cobro" : "Saldo"}</dt><dd className="mt-1 break-words font-semibold">{money(saldo)}</dd></div></dl>
        <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Contenido del pedido ({items.reduce((n, i) => n + i.cantidad, 0)} unidades)</summary><ul className="mt-3 grid gap-2 text-sm">{items.map(i => <li key={i.id}><p className="break-words">{i.cantidad} × {i.descripcion}</p>{i.adicionales.length > 0 && <p className="text-xs text-muted-foreground">{i.adicionales.map(a => a.nombre).join(", ")}</p>}{i.observaciones && <p className="break-words text-xs text-muted-foreground">{i.observaciones}</p>}</li>)}</ul></details>
        {envio.observaciones && <p className="break-words rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><strong>Incidencia: </strong>{envio.observaciones}</p>}
        {activo && envio.estado === "incidencia" && <p className="text-sm text-muted-foreground">Avisá a despacho para resolver la incidencia y volver a asignar el envío si corresponde.</p>}
        {activo && envio.estado === "asignado" && !puedeSalir && <p className="text-sm text-muted-foreground">Esperando que despacho complete el control y armado del pedido.</p>}
        <div className="grid gap-2 sm:grid-cols-2">{puedeSalir && <Button className="min-h-12 whitespace-normal sm:col-span-2" disabled={bloqueado} onClick={() => accion("salida", pedido)}><Truck className="h-4 w-4" />Registrar salida</Button>}{puedeEntregar && <Button variant="success" className="min-h-12 whitespace-normal sm:col-span-2" disabled={bloqueado} onClick={() => accion("entregar", pedido)}><CheckCheck className="h-4 w-4" />Registrar entrega</Button>}{puedeCobrar && <Button className="min-h-11 whitespace-normal" disabled={bloqueado} onClick={() => accion("cobro", pedido)}><CreditCard className="h-4 w-4" />Registrar cobro</Button>}{activo && ["asignado", "en_camino"].includes(envio.estado) && <Button variant="outline" className="min-h-11 whitespace-normal" disabled={bloqueado} onClick={() => accion("incidencia", pedido)}><AlertTriangle className="h-4 w-4" />Incidencia</Button>}</div>
      </article>;
    })}{!visibles.length && <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground lg:col-span-2 xl:col-span-3">No hay entregas para esta selección.</p>}</section>
  </div>;
}
