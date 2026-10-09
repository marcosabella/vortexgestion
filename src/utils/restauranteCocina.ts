import type { ComandaRestaurante, ItemRestaurante, PedidoRestaurante, ResumenRestaurante } from "@/types/restaurante";
import { restauranteAbierto, restauranteMesas } from "./restaurante";

export type EtapaCocina = "recibidas" | "preparacion" | "listas";
export type TarjetaCocina = { comanda: ComandaRestaurante; pedido: PedidoRestaurante; items: ItemRestaurante[]; etapa: EtapaCocina | "finalizadas"; destino: string };
export const cocinaPaso = (estado: ItemRestaurante["estado"]) => ({ pendiente: "aceptar", aceptada: "preparar", preparacion: "listo" } as const)[estado as "pendiente" | "aceptada" | "preparacion"];

export function cocinaEtapa(items: ItemRestaurante[]): TarjetaCocina["etapa"] {
  if (items.some(i => i.estado === "pendiente")) return "recibidas";
  if (items.some(i => ["aceptada", "preparacion"].includes(i.estado))) return "preparacion";
  if (items.some(i => i.estado === "lista")) return "listas";
  return "finalizadas";
}

export function cocinaTablero(data: ResumenRestaurante, sector = ""): TarjetaCocina[] {
  const pedidos = new Map(data.pedidos.map(p => [p.id, p]));
  const items = new Map<string, ItemRestaurante[]>();
  for (const item of data.items) {
    if (item.comanda_id) items.set(item.comanda_id, [...(items.get(item.comanda_id) || []), item]);
  }
  return data.comandas.flatMap(comanda => {
    if ((data.sector_id && !data.admin && comanda.sector_id !== data.sector_id) || (sector && comanda.sector_id !== sector)) return [];
    const pedido = pedidos.get(comanda.pedido_id);
    if (!pedido) return [];
    const productos = (items.get(comanda.id) || []).filter(i => i.sector_id === comanda.sector_id);
    const etapa = cocinaEtapa(productos);
    if (!comanda.aviso_cancelacion && (!restauranteAbierto(pedido) || etapa === "finalizadas")) return [];
    return [{ comanda, pedido, items: productos, etapa, destino: pedido.modalidad === "mesa" ? restauranteMesas(data, pedido.id) || "Salón" : pedido.modalidad === "retiro" ? "Retiro" : "Delivery" }];
  }).sort((a, b) => Number(b.pedido.prioridad) - Number(a.pedido.prioridad) || Date.parse(a.comanda.created_at) - Date.parse(b.comanda.created_at));
}

export function cocinaMinutos(inicio: string, ahora: number) {
  const fecha = Date.parse(inicio);
  return Number.isFinite(fecha) ? Math.max(0, Math.floor((ahora - fecha) / 60000)) : null;
}
