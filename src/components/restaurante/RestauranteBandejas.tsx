import { Check, ChefHat, Play, Ban, Eye, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { RestauranteAccion, RestauranteGrilla } from "./RestauranteGrilla";
import { RestauranteImpresion } from "./RestauranteImpresion";
import { RestauranteMesasMovil } from "./RestauranteMesasMovil";
import { useIsMobile } from "@/hooks/use-mobile";
import { restauranteAbierto, restauranteMesas, restauranteMoney as money, restauranteTiempo } from "@/utils/restaurante";
import type { AccionRestaurante, ComandaRestaurante, PedidoRestaurante, ResumenRestaurante } from "@/types/restaurante";

export function RestauranteMesasGrilla({ data, buscar, abrir, ocupar, estado }: {
  data: ResumenRestaurante; buscar: string; abrir: (id: string) => void; ocupar: (id: string) => void; estado: (p: PedidoRestaurante) => ReactNode;
}) {
  const isMobile = useIsMobile();
  const mesas = data.mesas.filter(m => m.activo).map(m => ({ ...m, pedido: data.pedidos.find(p => data.cuenta_mesas.some(c => c.activa && c.mesa_id === m.id && c.pedido_id === p.id)) })).filter(m => `${m.nombre} ${m.pedido?.numero || ""} ${m.pedido?.cliente_nombre || ""}`.toLowerCase().includes(buscar.toLowerCase()));
  if (isMobile) return <RestauranteMesasMovil mesas={mesas} abrir={abrir} ocupar={ocupar} />;
  return <RestauranteGrilla label="Salón y mesas" columnas={[{ titulo: "Mesa" }, { titulo: "Capacidad", derecha: true }, { titulo: "Comensales", derecha: true }, { titulo: "Pedido / cliente" }, { titulo: "Estado" }, { titulo: "Cuenta" }, { titulo: "Total", derecha: true }, { titulo: "Acciones", derecha: true }]} vacia={!mesas.length ? "No hay mesas para mostrar." : undefined}>
    {mesas.map(m => <TableRow key={m.id}>
      <TableCell className="font-medium">{m.nombre}</TableCell><TableCell className="text-right">{m.capacidad}</TableCell><TableCell className="text-right">{m.pedido?.comensales || "—"}</TableCell>
      <TableCell>{m.pedido ? `#${m.pedido.numero} · ${m.pedido.cliente_nombre}` : "—"}</TableCell><TableCell>{m.pedido ? estado(m.pedido) : <Badge variant="secondary">Libre</Badge>}</TableCell>
      <TableCell>{m.pedido?.cuenta || "—"}</TableCell><TableCell className="whitespace-nowrap text-right">{m.pedido ? money(m.pedido.total) : "—"}</TableCell>
      <TableCell><div className="flex justify-end">{m.pedido ? <RestauranteAccion icon={Eye} onClick={() => abrir(m.pedido!.id)}>Abrir cuenta</RestauranteAccion> : <RestauranteAccion icon={Plus} onClick={() => ocupar(m.id)}>Ocupar mesa</RestauranteAccion>}</div></TableCell>
    </TableRow>)}
  </RestauranteGrilla>;
}

export function RestauranteCocinaGrilla({ data, comandas, ahora, trabajando, ejecutar, imprimir }: {
  data: ResumenRestaurante; comandas: ComandaRestaurante[]; ahora: number; trabajando: boolean;
  ejecutar: (accion: AccionRestaurante, p: PedidoRestaurante, extra?: Record<string, string>) => void;
  imprimir: (c: ComandaRestaurante, p: PedidoRestaurante) => Promise<boolean>;
}) {
  return <RestauranteGrilla label="Cocina y comandas" columnas={[{ titulo: "Comanda / sector" }, { titulo: "Pedido / mesa" }, { titulo: "Tiempo" }, { titulo: "Cantidad", derecha: true }, { titulo: "Producto / indicaciones" }, { titulo: "Estado" }, { titulo: "Acciones", derecha: true }]} vacia={!comandas.length ? "No hay comandas para mostrar." : undefined}>
    {comandas.flatMap(c => { const p = data.pedidos.find(p => p.id === c.pedido_id); if (!p) return []; return data.items.filter(i => i.comanda_id === c.id).map((i, index) => {
      const paso = ({ pendiente: "aceptar", aceptada: "preparar", preparacion: "listo" } as const)[i.estado as "pendiente" | "aceptada" | "preparacion"];
      return <TableRow key={i.id}>
        <TableCell><span className="font-medium">#{c.numero}</span><p className="text-xs text-muted-foreground">{data.sectores.find(s => s.id === c.sector_id)?.nombre}</p></TableCell>
        <TableCell><span className="font-medium">#{p.numero}</span><p className="text-xs text-muted-foreground">{p.modalidad} {restauranteMesas(data, p.id)}</p>{p.prioridad && <Badge variant="destructive">Prioridad</Badge>}</TableCell>
        <TableCell className="whitespace-nowrap">{restauranteTiempo(data, p, ahora, c.created_at).minutos === null ? "Sin dato" : `${restauranteTiempo(data, p, ahora, c.created_at).minutos} min`}<p className="text-xs text-muted-foreground">{restauranteTiempo(data, p, ahora, c.created_at).finalizado ? "Finalizado" : "En curso"}</p></TableCell><TableCell className="text-right">{i.cantidad}</TableCell>
        <TableCell className="min-w-56"><p className="font-medium">{i.descripcion}</p>{i.adicionales.length > 0 && <p className="text-xs text-muted-foreground">{i.adicionales.map(a => a.nombre).join(", ")}</p>}{i.observaciones && <p>{i.observaciones}</p>}{p.observaciones && <p className="text-sm">Pedido: {p.observaciones}</p>}{data.eventos.filter(e => e.pedido_id === p.id && ["cancelar", "cancelar_item"].includes(e.accion)).map(e => <p key={e.id} className="text-sm text-destructive">Cancelación: {e.datos.motivo}</p>)}</TableCell>
        <TableCell><Badge variant={i.estado === "cancelada" ? "destructive" : "secondary"}>{i.estado}</Badge>{c.aviso_cancelacion && <p className="mt-1 text-xs text-destructive">Aviso de cancelación pendiente</p>}</TableCell>
        <TableCell><div className="flex items-center justify-end gap-2">
          {paso && <RestauranteAccion icon={paso === "listo" ? Check : paso === "preparar" ? ChefHat : Play} variant={paso === "listo" ? "success" : "outline"} disabled={trabajando} onClick={() => ejecutar(paso, p, { comanda_id: c.id, item_id: i.id })}>{paso === "listo" ? "Marcar listo" : paso === "preparar" ? "Comenzar preparación" : "Aceptar"}</RestauranteAccion>}
          {index === 0 && <><RestauranteImpresion data={data} pedido={p} comanda={c} disabled={trabajando || !restauranteAbierto(p)} registrar={() => imprimir(c, p)} />{c.aviso_cancelacion && <RestauranteAccion icon={Ban} variant="destructive" disabled={trabajando} onClick={() => ejecutar("reconocer", p, { comanda_id: c.id })}>Confirmar aviso de cancelación recibido</RestauranteAccion>}</>}
        </div></TableCell>
      </TableRow>;
    }); })}
  </RestauranteGrilla>;
}

export function RestauranteRendicionesGrilla({ data }: { data: ResumenRestaurante }) {
  return <section className="grid gap-3"><h2 className="font-semibold">Rendiciones registradas</h2><RestauranteGrilla label="Rendiciones registradas" columnas={[{ titulo: "Fecha" }, { titulo: "Usuario" }, { titulo: "Esperado", derecha: true }, { titulo: "Recibido", derecha: true }, { titulo: "Diferencia", derecha: true }, { titulo: "Observaciones" }]} vacia={!data.rendiciones.length ? "No hay rendiciones registradas." : undefined}>
    {data.rendiciones.map(r => <TableRow key={r.id}><TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleString("es-AR")}</TableCell><TableCell>{data.usuarios.find(u => u.id === r.usuario_id)?.nombre}</TableCell><TableCell className="whitespace-nowrap text-right">{money(r.esperado)}</TableCell><TableCell className="whitespace-nowrap text-right">{money(r.recibido)}</TableCell><TableCell className="whitespace-nowrap text-right">{money(r.diferencia)}</TableCell><TableCell>{r.observaciones || "—"}</TableCell></TableRow>)}
  </RestauranteGrilla></section>;
}
