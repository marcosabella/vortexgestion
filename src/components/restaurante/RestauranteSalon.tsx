import { useEffect, useRef, useState } from "react";
import { BellRing, ChefHat, RefreshCw, Users, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restauranteAbierto, restauranteMesas, restauranteMoney, restauranteTiempo } from "@/utils/restaurante";
import type { ContextoRestaurante, PedidoRestaurante, ResumenRestaurante } from "@/types/restaurante";

const estados = { borrador: "Sin enviar", pendiente: "Recibida", aceptada: "Aceptada", preparacion: "En preparación", lista: "Lista para servir", entregada: "Servida", cancelada: "Cancelada" };

export function RestauranteComandasSalon({ data, pedido }: { data: ResumenRestaurante; pedido: PedidoRestaurante }) {
  const rondas = data.comandas.filter(c => c.pedido_id === pedido.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return <section className="grid gap-3" aria-label="Estado de las comandas"><h2 className="flex items-center gap-2 font-semibold"><ChefHat className="h-5 w-5" />Comandas por ronda</h2>
    {!rondas.length && <p className="text-sm text-muted-foreground">Todavía no se enviaron productos a cocina.</p>}
    {rondas.map(c => <article key={c.id} className="rounded-xl border p-3"><div className="mb-2 flex flex-wrap justify-between gap-2"><h3 className="font-medium">Comanda #{c.numero} · {data.sectores.find(s => s.id === c.sector_id)?.nombre || "Sector"}</h3><span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span></div>
      <ul className="grid gap-2">{data.items.filter(i => i.comanda_id === c.id).map(i => <li key={i.id} className="flex flex-wrap justify-between gap-2 text-sm"><div><p>{i.cantidad} × {i.descripcion}</p>{i.observaciones && <p className="text-xs text-muted-foreground">{i.observaciones}</p>}</div><span className={i.estado === "lista" ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{estados[i.estado]}</span></li>)}</ul>
    </article>)}
  </section>;
}

type Props = ContextoRestaurante & {
  ahora: number; online: boolean; comercioNombre?: string; error?: string; pendientes: number;
  actualizar: () => void; abrir: (id: string) => void; ocupar: (id: string) => void;
};

export function RestauranteSalon({ data, operar, trabajando, ahora, online, comercioNombre, error, pendientes, actualizar, abrir, ocupar }: Props) {
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [mias, setMias] = useState(false);
  const [aviso, setAviso] = useState("");
  const anteriores = useRef<Set<string> | null>(null);
  const pedidos = data.pedidos.filter(p => p.modalidad === "mesa" && restauranteAbierto(p));
  const listos = data.items.filter(i => i.estado === "lista" && pedidos.some(p => p.id === i.pedido_id));
  const firmaListos = listos.map(i => i.id).sort().join(",");
  useEffect(() => {
    const ids = new Set(firmaListos ? firmaListos.split(",") : []);
    if (anteriores.current && [...ids].some(id => !anteriores.current?.has(id))) setAviso("Hay nuevos productos listos para servir.");
    anteriores.current = ids;
  }, [firmaListos]);
  const bloqueado = trabajando || !online || Boolean(error) || pendientes > 0;
  const coincide = (p: PedidoRestaurante) => (!mias || p.creado_por === data.usuario_id) && `${restauranteMesas(data, p.id)} ${p.numero} ${p.cliente_nombre}`.toLowerCase().includes(buscar.toLowerCase());
  const mesas = data.mesas.filter(m => m.activo).map(m => {
    const p = pedidos.find(p => data.cuenta_mesas.some(c => c.activa && c.mesa_id === m.id && c.pedido_id === p.id));
    const items = p ? data.items.filter(i => i.pedido_id === p.id && i.estado !== "cancelada") : [];
    const estado = !p ? "libre" : p.cuenta === "solicitada" ? "cuenta" : items.some(i => i.estado === "lista") ? "lista" : "ocupada";
    return { m, p, items, estado };
  });
  const visibles = mesas.filter(({ m, p, estado }) => (filtro === "todas" || filtro === estado) && (p ? coincide(p) : !mias && m.nombre.toLowerCase().includes(buscar.toLowerCase())));
  const colores: Record<string, string> = { libre: "border-emerald-500/30 bg-emerald-500/5", ocupada: "border-amber-500/40 bg-amber-500/10", lista: "border-sky-500/50 bg-sky-500/10", cuenta: "border-violet-500/40 bg-violet-500/10" };
  const etiquetas: Record<string, string> = { libre: "Libre", ocupada: "En atención", lista: "Lista para servir", cuenta: "Cuenta solicitada" };
  return <div className="grid min-w-0 gap-5" data-terminal="salon">
    <header className="relative overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_top_right,_#296570,_#112b35_65%)] p-5 text-white md:p-7"><p className="text-xs uppercase tracking-[0.2em] text-amber-200">{comercioNombre || "Vortex Restaurante"} · Terminal de salón</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><UtensilsCrossed className="h-6 w-6" />Atención de mesas</h1><p className="mt-2 text-sm text-slate-200">Tus mesas, las comandas y los platos que esperan servicio.</p></div><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={actualizar}><RefreshCw className="h-4 w-4" />Actualizar</Button></div><p className="mt-4 text-xs text-slate-200">{online ? "Actualización automática cada 5 segundos" : "Sin conexión · acciones pausadas"}</p></header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Mesas en atención", mesas.filter(m => m.p).length], ["Mesas libres", mesas.filter(m => !m.p).length], ["Productos listos", listos.reduce((s, i) => s + i.cantidad, 0)], ["Cuentas solicitadas", pedidos.filter(p => p.cuenta === "solicitada").length]].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div>
    {aviso && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3"><p className="flex items-center gap-2 text-sm"><BellRing className="h-4 w-4" />{aviso}</p><Button size="sm" variant="ghost" onClick={() => setAviso("")}>Entendido</Button></div>}
    {error && <p role="alert" className="rounded-xl border border-destructive/30 p-3">No se pudo actualizar: {error}. Actualizá antes de registrar acciones.</p>}
    <div className="flex flex-wrap items-center gap-3"><Input aria-label="Buscar mesa o pedido" placeholder="Mesa, pedido o cliente…" className="max-w-sm" value={buscar} onChange={e => setBuscar(e.target.value)} /><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={mias} onChange={e => setMias(e.target.checked)} />Mesas abiertas por mí</label></div>
    <section aria-label="Listos para servir" className="rounded-2xl border bg-card p-4"><h2 className="flex items-center gap-2 font-semibold"><BellRing className="h-5 w-5 text-sky-600" />Listos para servir</h2><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{listos.filter(i => coincide(pedidos.find(p => p.id === i.pedido_id)!)).map(i => { const p = pedidos.find(p => p.id === i.pedido_id)!; return <article key={i.id} className="grid gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3"><button className="text-left text-sm font-semibold underline-offset-4 hover:underline" onClick={() => abrir(p.id)}>{restauranteMesas(data, p.id) || "Mesa"} · Pedido #{p.numero}</button><p className="font-medium">{i.cantidad} × {i.descripcion}</p><p className="text-xs text-muted-foreground">Comanda #{data.comandas.find(c => c.id === i.comanda_id)?.numero || "—"} · {data.sectores.find(s => s.id === i.sector_id)?.nombre || "Cocina"}</p>{i.observaciones && <p className="text-sm">{i.observaciones}</p>}<Button disabled={bloqueado} onClick={() => void operar("servir", { pedido_id: p.id, version: p.version, item_id: i.id })}>Marcar servido</Button></article>; })}</div>{!listos.some(i => coincide(pedidos.find(p => p.id === i.pedido_id)!)) && <p className="mt-3 text-sm text-muted-foreground">No hay productos listos para servir en esta selección.</p>}</section>
    <section aria-label="Mesas del salón"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5" />Mesas del salón</h2><div className="flex flex-wrap gap-2">{[["todas", "Todas"], ["libre", "Libres"], ["ocupada", "En atención"], ["lista", "Listas"], ["cuenta", "Cuenta solicitada"]].map(([id, label]) => <Button key={id} size="sm" variant={filtro === id ? "default" : "outline"} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</Button>)}</div></div><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{visibles.map(({ m, p, items, estado }) => <button key={m.id} data-mesa-id={m.id} data-estado={p ? "ocupada" : "libre"} aria-label={`${m.nombre} · ${etiquetas[estado]}`} disabled={!p && bloqueado} onClick={() => p ? abrir(p.id) : ocupar(m.id)} className={`flex min-h-40 min-w-0 flex-col rounded-2xl border p-4 text-left transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${colores[estado]}`}><span className="text-lg font-semibold">{m.nombre}</span><span className="mt-1 text-xs font-medium">{etiquetas[estado]}</span>{p ? <><span className="mt-3 break-words text-sm">#{p.numero} · {p.comensales} personas</span><span className="text-xs text-muted-foreground">{restauranteTiempo(data, p, ahora).minutos ?? 0} min · {items.filter(i => i.estado === "lista").reduce((s, i) => s + i.cantidad, 0)} listos</span><span className="mt-auto pt-3 text-sm font-semibold">{restauranteMoney(p.total)}</span></> : <><span className="mt-3 text-xs text-muted-foreground">Hasta {m.capacidad} personas</span><span className="mt-auto pt-3 text-sm font-medium">Abrir mesa →</span></>}</button>)}</div>{!visibles.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No hay mesas para esta selección.</p>}</section>
  </div>;
}
