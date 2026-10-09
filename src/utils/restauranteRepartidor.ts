import type { ResumenRestaurante } from "@/types/restaurante";
import { restauranteAbierto, restauranteResponsableCobro, restauranteCobrosRendibles } from "./restaurante";

export function restauranteRepartos(data: ResumenRestaurante) {
  return data.envios.filter(e => e.repartidor_id === data.usuario_id).flatMap(envio => {
    const pedido = data.pedidos.find(p => p.id === envio.pedido_id && p.modalidad === "delivery");
    if (!pedido) return [];
    const items = data.items.filter(i => i.pedido_id === pedido.id && i.estado !== "cancelada");
    const preparado = pedido.armado && items.length > 0 && items.every(i => ["lista", "entregada"].includes(i.estado));
    const abierto = restauranteAbierto(pedido) && !pedido.venta_id;
    return [{ envio, pedido, items, activo: abierto && ["asignado", "en_camino", "incidencia"].includes(envio.estado),
      puedeSalir: abierto && envio.estado === "asignado" && preparado,
      puedeEntregar: abierto && envio.estado === "en_camino" && preparado && items.some(i => i.estado === "lista") }];
  }).sort((a, b) => {
    const orden = { en_camino: 0, asignado: 1, incidencia: 2, entregado: 3, cancelado: 4 };
    return orden[a.envio.estado] - orden[b.envio.estado] || Number(b.pedido.prioridad) - Number(a.pedido.prioridad)
      || Date.parse(a.pedido.created_at) - Date.parse(b.pedido.created_at);
  });
}

export function restauranteEfectivoRepartidor(data: ResumenRestaurante) {
  const efectivo = data.cobros.filter(c => c.medio === "contado" && !c.anulado && !c.rendicion_id
    && restauranteResponsableCobro(c) === data.usuario_id && data.pedidos.some(p => p.id === c.pedido_id && p.modalidad === "delivery"));
  const rendibles = new Set(restauranteCobrosRendibles(data).map(c => c.id));
  const pendiente = efectivo.reduce((sum, c) => sum + Number(c.monto), 0);
  const disponible = efectivo.filter(c => rendibles.has(c.id)).reduce((sum, c) => sum + Number(c.monto), 0);
  return { pendiente, disponible, bloqueado: Math.round((pendiente - disponible) * 100) / 100 };
}

export function restauranteMinutosReparto(salida: string | null, entrega: string | null, ahora: number) {
  if (!salida) return null;
  const inicio = Date.parse(salida); const fin = entrega ? Date.parse(entrega) : ahora;
  return Number.isFinite(inicio) && Number.isFinite(fin) ? Math.max(0, Math.floor((fin - inicio) / 60000)) : null;
}

export function restauranteEntregaHoy(entrega: string | null, ahora: number) {
  return Boolean(entrega && new Date(entrega).toDateString() === new Date(ahora).toDateString());
}
