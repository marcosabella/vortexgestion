import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Bell, Check, ChefHat, Clock3, Inbox, Maximize2, Minimize2, RefreshCw, Search, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { useRestaurante } from "@/hooks/useRestaurante";
import { cocinaMinutos, cocinaPaso, cocinaTablero, type EtapaCocina, type TarjetaCocina } from "@/utils/restauranteCocina";
import { restauranteAbierto } from "@/utils/restaurante";
import { restaurantePedidoIntento } from "@/utils/restauranteSolicitud";
import type { AccionRestaurante, ResumenRestaurante } from "@/types/restaurante";
import { RestauranteImpresion } from "./RestauranteImpresion";

const columnas = [
  { id: "recibidas", titulo: "Recibidas", detalle: "Pendientes de aceptar", icono: Inbox, color: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  { id: "preparacion", titulo: "En preparación", detalle: "Aceptadas y en marcha", icono: ChefHat, color: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { id: "listas", titulo: "Listas", detalle: "Para retirar o servir", icono: Check, color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
] as const;
const estados = { borrador: "Sin enviar", pendiente: "Recibido", aceptada: "Aceptado", preparacion: "En preparación", lista: "Listo", entregada: "Entregado", cancelada: "Cancelado" };
const acciones = { aceptar: "Aceptar", preparar: "Comenzar preparación", listo: "Marcar listo" };

function Comanda({ tarjeta, data, ahora, disabled, ejecutar, imprimir }: {
  tarjeta: TarjetaCocina; data: ResumenRestaurante; ahora: number; disabled: boolean;
  ejecutar: (accion: AccionRestaurante, tarjeta: TarjetaCocina, itemId?: string) => void;
  imprimir: (tarjeta: TarjetaCocina) => Promise<boolean>;
}) {
  const { comanda, pedido, items, destino } = tarjeta;
  const minutos = cocinaMinutos(comanda.created_at, ahora);
  const pendiente = items.find(i => i.estado === "pendiente") || items.find(i => i.estado === "aceptada") || items.find(i => i.estado === "preparacion");
  const paso = pendiente && cocinaPaso(pendiente.estado);
  const abierto = restauranteAbierto(pedido);
  const motivos = data.eventos.filter(e => e.pedido_id === pedido.id && (e.accion === "cancelar" || (e.accion === "cancelar_item" && items.some(i => i.id === e.datos.item_id))));
  return <article aria-label={`Comanda ${comanda.numero}`} className={`min-w-0 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm ${comanda.aviso_cancelacion ? "border-destructive/50" : pedido.prioridad ? "border-amber-500/50" : "border-border"}`}>
    <div className="border-b bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-xl font-semibold">{destino}</h3><p className="mt-1 text-xs text-muted-foreground">Comanda #{comanda.numero} · Pedido #{pedido.numero}</p></div><span className="flex shrink-0 items-center gap-1 rounded-lg bg-background px-2 py-1 text-sm font-semibold tabular-nums"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{minutos === null ? "—" : `${minutos} min`}</span></div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border px-2 py-1 text-muted-foreground">{data.sectores.find(s => s.id === comanda.sector_id)?.nombre || "Preparación"}</span><span className="rounded-full border px-2 py-1 text-muted-foreground">{new Date(comanda.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>{pedido.prioridad && <span className="rounded-full bg-amber-500/15 px-2 py-1 font-semibold text-amber-700 dark:text-amber-300">Prioridad</span>}{pedido.prometido_at && <span className="rounded-full border px-2 py-1">Prometido {new Date(pedido.prometido_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
    </div>
    {comanda.aviso_cancelacion && <div role="alert" className="grid gap-2 border-b border-destructive/20 bg-destructive/5 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle aria-hidden="true" className="h-4 w-4" />Cancelación recibida</p>{motivos.map(e => <p key={e.id} className="break-words text-sm">{e.datos.motivo || "Pedido modificado"}</p>)}<Button variant="destructive" className="min-h-11 whitespace-normal" disabled={disabled} onClick={() => ejecutar("reconocer", tarjeta)}>Confirmar aviso recibido</Button></div>}
    {pedido.observaciones && <p className="m-4 break-words rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm"><span className="font-semibold">Nota del pedido: </span>{pedido.observaciones}</p>}
    <ul className="divide-y px-4">{items.map(item => {
      const siguiente = cocinaPaso(item.estado);
      return <li key={item.id} className={`py-4 ${item.estado === "cancelada" ? "opacity-65" : ""}`}><div className="flex items-start gap-3"><span className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-muted px-2 text-lg font-bold">{item.cantidad}</span><div className="min-w-0 flex-1"><p className={`break-words font-semibold ${item.estado === "cancelada" ? "line-through" : ""}`}>{item.descripcion}</p>{item.adicionales.length > 0 && <p className="mt-1 break-words text-sm text-muted-foreground">+ {item.adicionales.map(a => a.nombre).join(", ")}</p>}{item.observaciones && <p className="mt-2 break-words rounded-lg bg-amber-500/10 p-2 text-sm font-medium">{item.observaciones}</p>}<div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className={`text-xs font-medium ${item.estado === "cancelada" ? "text-destructive" : item.estado === "lista" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{estados[item.estado]}</span>{abierto && !comanda.aviso_cancelacion && siguiente && <Button variant="outline" size="sm" className="min-h-11 h-auto whitespace-normal" aria-label={`${acciones[siguiente]}: ${item.descripcion}`} disabled={disabled} onClick={() => ejecutar(siguiente, tarjeta, item.id)}>{acciones[siguiente]}</Button>}</div></div></div></li>;
    })}</ul>
    {abierto && !comanda.aviso_cancelacion && paso && <div className="border-t p-4"><Button className={`min-h-12 w-full gap-2 whitespace-normal rounded-xl ${paso === "listo" ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-cyan-800 text-white hover:bg-cyan-900"}`} disabled={disabled} onClick={() => ejecutar(paso, tarjeta)}>{paso === "aceptar" ? "Aceptar pendientes" : paso === "preparar" ? "Preparar aceptados" : "Marcar en preparación como listos"}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Button></div>}
    <details className="border-t px-4 pb-3"><summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">Impresión y PDF</summary><RestauranteImpresion data={data} pedido={pedido} comanda={comanda} disabled={disabled || !abierto} registrar={() => imprimir(tarjeta)} /></details>
  </article>;
}

export function RestauranteCocina({ data, query, ahora, online, comercioNombre }: {
  data: ResumenRestaurante; query: ReturnType<typeof useRestaurante>; ahora: number; online: boolean; comercioNombre?: string;
}) {
  const [buscar, setBuscar] = useState("");
  const [sector, setSector] = useState("");
  const [filtro, setFiltro] = useState<EtapaCocina | "todas">("todas");
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [errorPantalla, setErrorPantalla] = useState("");
  const [nuevas, setNuevas] = useState(0);
  const vistas = useRef<Set<string> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const tarjetas = cocinaTablero(data, sector);
  const recibidas = tarjetas.filter(t => t.items.some(i => i.estado === "pendiente")).map(t => t.comanda.id).sort().join(",");
  useEffect(() => {
    const actuales = new Set(recibidas ? recibidas.split(",") : []);
    if (vistas.current) setNuevas(n => n + [...actuales].filter(id => !vistas.current!.has(id)).length);
    vistas.current = actuales;
  }, [recibidas]);
  useEffect(() => {
    const update = () => setPantallaCompleta(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function ampliar() {
    setErrorPantalla("");
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); }
    catch { setErrorPantalla("Este navegador no permite pantalla completa. Podés usar el tablero en esta vista."); }
  }
  const disabled = query.trabajando || !online || Boolean(query.error);
  const bloqueada = (tarjeta: TarjetaCocina) => disabled || query.pendientes.some(p => {
    const pedidoId = restaurantePedidoIntento(p.datos);
    return !pedidoId || pedidoId === tarjeta.pedido.id;
  });
  const ejecutar = (accion: AccionRestaurante, tarjeta: TarjetaCocina, itemId?: string) => {
    if (bloqueada(tarjeta)) return;
    void query.operar(accion, { pedido_id: tarjeta.pedido.id, version: tarjeta.pedido.version, comanda_id: tarjeta.comanda.id, ...(itemId ? { item_id: itemId } : {}) });
  };
  const imprimir = async (tarjeta: TarjetaCocina) => !bloqueada(tarjeta) && Boolean(await query.operar("impresion", { pedido_id: tarjeta.pedido.id, version: tarjeta.pedido.version, comanda_id: tarjeta.comanda.id }));
  const visibles = tarjetas.filter(t => `${t.comanda.numero} ${t.pedido.numero} ${t.destino} ${t.items.map(i => i.descripcion).join(" ")}`.toLocaleLowerCase().includes(buscar.trim().toLocaleLowerCase()));
  const avisos = tarjetas.filter(t => t.comanda.aviso_cancelacion);
  const pendientes = tarjetas.flatMap(t => t.items).filter(i => ["pendiente", "aceptada", "preparacion"].includes(i.estado));
  const espera = tarjetas.filter(t => t.etapa !== "listas" && t.etapa !== "finalizadas").map(t => cocinaMinutos(t.comanda.created_at, ahora)).filter((n): n is number => n !== null);
  return <div ref={root} className="min-h-[calc(100dvh-3.5rem)] min-w-0 overflow-auto bg-muted text-foreground fullscreen:h-screen">
    <header className="relative overflow-hidden bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,#164e63_0%,transparent_65%),radial-gradient(ellipse_at_100%_100%,#78350f_0%,transparent_50%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><ChefHat aria-hidden="true" className="h-6 w-6 text-cyan-200" /></div><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-100/70">Vortex Restaurante · {comercioNombre || "Terminal"}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{data.sectores.find(s => s.id === data.sector_id)?.nombre || "Terminal de cocina"}</h1></div></div><div className="flex flex-wrap items-center gap-2"><span role="status" className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs"><span className={`h-2 w-2 rounded-full ${!online || query.error ? "bg-amber-400" : "bg-emerald-400"}`} />{!online ? "Sin conexión" : query.error ? "Sin actualizar" : query.isFetching ? "Actualizando…" : `Actualizado ${query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""}`}</span><Button variant="outline" className="min-h-11 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white" disabled={!online || query.isFetching} onClick={() => void query.refetch()}><RefreshCw aria-hidden="true" className="h-4 w-4" />Actualizar</Button><Button variant="outline" className="min-h-11 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => void ampliar()}>{pantallaCompleta ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}{pantallaCompleta ? "Reducir" : "Pantalla completa"}</Button></div></div>
      <p className="relative mt-4 text-sm text-slate-300">Aceptá, prepará y avisá cuando esté listo. Las nuevas rondas llegan como comandas independientes.</p>
    </header>
    <div className="grid gap-5 p-4 sm:p-6">
      {!online && <p role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><WifiOff aria-hidden="true" className="h-5 w-5 shrink-0" />Sin conexión. Los estados están bloqueados hasta recuperar la conexión y actualizar los pedidos.</p>}
      {query.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">No se pudo actualizar: {query.error.message}. Se muestra la última información recibida. Actualizá antes de operar.</p>}
      {errorPantalla && <p role="status" className="text-sm text-muted-foreground">{errorPantalla}</p>}
      {query.errorOperacion && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{query.errorOperacion}</p>}
      {query.pendientes.length > 0 && <section className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="text-sm font-medium">Hay cambios pendientes de confirmación. Solo se pausan los pedidos involucrados.</p><p className="text-sm">Comprobá el resultado con el mismo intento, sin duplicar la operación. Si la conexión no responde, el botón se habilitará nuevamente en hasta 15 segundos.</p>{query.pendientes.map(p => { const pedido = data.pedidos.find(x => x.id === restaurantePedidoIntento(p.datos)); return <div key={p.clave} className="grid gap-2">{pedido && <p className="text-sm font-semibold">Pedido #{pedido.numero}</p>}<Button variant="outline" className="min-h-11" disabled={!online || query.trabajando} onClick={async () => { await query.reintentar(p); void query.refetch(); }}>{query.trabajando ? "Esperando confirmación…" : `Comprobar operación: ${p.accion}`}</Button></div>; })}</section>}
      {nuevas > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3"><p className="flex items-center gap-2 text-sm font-medium"><Bell aria-hidden="true" className="h-4 w-4" />{nuevas} {nuevas === 1 ? "comanda nueva recibida" : "comandas nuevas recibidas"}</p><Button variant="outline" className="min-h-11" onClick={() => { setNuevas(0); setBuscar(""); setFiltro("recibidas"); }}>Ver recibidas</Button></div>}
      <section aria-label="Resumen de cocina" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{columnas.map(c => <div key={c.id} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{c.titulo}</p><c.icono aria-hidden="true" className="h-5 w-5 text-muted-foreground" /></div><p className="mt-2 text-3xl font-semibold tabular-nums">{tarjetas.filter(t => t.etapa === c.id).length}</p></div>)}<div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-sm text-muted-foreground">Mayor tiempo en curso</p><p className="mt-2 text-3xl font-semibold tabular-nums">{espera.length ? `${Math.max(...espera)} min` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{pendientes.reduce((n, i) => n + Number(i.cantidad), 0)} unidades por preparar</p></div></section>
      <div className="flex flex-wrap items-end gap-3"><div className="grid min-w-0 flex-1 gap-2 sm:min-w-64"><Label htmlFor="cocina-buscar">Buscar comanda</Label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="cocina-buscar" className="h-12 rounded-xl bg-background pl-10" placeholder="Mesa, pedido o plato…" value={buscar} onChange={e => setBuscar(e.target.value)} /></div></div>{(data.admin || !data.sector_id) && <div className="grid w-full gap-2 sm:w-auto"><Label htmlFor="cocina-sector">Sector</Label><select id="cocina-sector" className="h-12 rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sector} onChange={e => { setSector(e.target.value); setNuevas(0); vistas.current = null; }}><option value="">Todos los sectores</option>{data.sectores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>}<div aria-label="Filtrar estado" className="flex max-w-full flex-wrap gap-1 rounded-xl border bg-background p-1">{[{ id: "todas", titulo: "Todas" }, ...columnas].map(c => <Button key={c.id} variant={filtro === c.id ? "secondary" : "ghost"} aria-pressed={filtro === c.id} className="min-h-11 rounded-lg" onClick={() => setFiltro(c.id as typeof filtro)}>{c.titulo}</Button>)}</div></div>
      {avisos.length > 0 && <section aria-label="Cancelaciones pendientes" className="grid gap-3"><h2 className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle aria-hidden="true" className="h-5 w-5" />Cancelaciones por confirmar ({avisos.length})</h2><div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{avisos.map(t => <Comanda key={t.comanda.id} tarjeta={t} data={data} ahora={ahora} disabled={bloqueada(t)} ejecutar={ejecutar} imprimir={imprimir} />)}</div></section>}
      <div className={`grid items-start gap-4 ${filtro === "todas" ? "xl:grid-cols-3" : ""}`}>{columnas.filter(c => filtro === "todas" || filtro === c.id).map(c => {
        const lista = visibles.filter(t => t.etapa === c.id && !t.comanda.aviso_cancelacion);
        return <section key={c.id} aria-label={c.titulo} className="min-w-0 rounded-2xl border bg-muted/30 p-3"><div className={`mb-4 flex items-center justify-between rounded-xl border p-3 ${c.color}`}><div className="flex items-center gap-2"><c.icono aria-hidden="true" className="h-5 w-5" /><div><h2 className="font-semibold">{c.titulo}</h2><p className="mt-0.5 text-xs">{c.detalle}</p></div></div><span className="rounded-lg bg-background/60 px-2.5 py-1 text-lg font-semibold tabular-nums">{lista.length}</span></div><div className={`grid items-start gap-3 ${filtro !== "todas" ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>{lista.map(t => <Comanda key={t.comanda.id} tarjeta={t} data={data} ahora={ahora} disabled={bloqueada(t)} ejecutar={ejecutar} imprimir={imprimir} />)}</div>{!lista.length && <p className="py-10 text-center text-sm text-muted-foreground">{buscar ? "Sin coincidencias." : `Sin comandas ${c.id === "recibidas" ? "por aceptar" : c.id === "listas" ? "listas" : "en preparación"}.`}</p>}</section>;
      })}</div>
      <p className="text-xs text-muted-foreground">Actualización automática cada 5 segundos. El tiempo se cuenta desde el envío de cada comanda. Los productos listos permanecen hasta que salón o despacho registre su entrega.</p>
    </div>
  </div>;
}
