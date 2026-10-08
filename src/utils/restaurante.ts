import type { CobroRestaurante, PedidoRestaurante, ResumenRestaurante } from "@/types/restaurante";
export const restauranteMoney = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
export const restauranteAbierto = (p: PedidoRestaurante) => !["completado", "cancelado", "unido"].includes(p.estado);
export const restauranteResponsableCobro = (c: CobroRestaurante) => c.recibido_por || c.responsable_id || c.usuario_id;
export const restauranteCobrosRendibles = (data: ResumenRestaurante) => data.cobros.filter(c =>
  c.medio === "contado" && !c.anulado && !c.rendicion_id && data.usuarios.some(u => u.id === restauranteResponsableCobro(c))
  && data.pedidos.some(p => p.id === c.pedido_id && (p.modalidad !== "mesa" || (p.cuenta === "cerrada" && p.venta_id)))
  && !data.envios.some(e => e.pedido_id === c.pedido_id && !["entregado", "cancelado"].includes(e.estado))
);
export function restauranteTiempo(data: ResumenRestaurante, p: PedidoRestaurante, ahora: number, inicio = p.created_at) {
  const finalizado = !restauranteAbierto(p);
  const accionFinal = p.estado === "completado" ? "cerrar" : p.estado === "cancelado" ? "cancelar" : "unir";
  const fin = finalizado ? data.eventos.filter(e => e.pedido_id === p.id && e.accion === accionFinal)
    .map(e => Date.parse(e.created_at)).filter(Number.isFinite).sort((a, b) => a - b)[0] : ahora;
  const desde = Date.parse(inicio);
  return { finalizado, minutos: Number.isFinite(fin) && Number.isFinite(desde) ? Math.max(0, Math.floor((fin - desde) / 60000)) : null };
}
export function restauranteSaldo(data: ResumenRestaurante, p: PedidoRestaurante) {
  const cobrado = p.cobrado ?? data.cobros.filter(c => c.pedido_id === p.id && !c.anulado).reduce((s, c) => s + Number(c.monto), 0);
  return { cobrado, saldo: Math.round((Number(p.total) - cobrado) * 100) / 100 };
}
export const restauranteMesas = (data: ResumenRestaurante, pedidoId: string) => {
  const cerrada = data.pedidos.some(p => p.id === pedidoId && p.cuenta === "cerrada");
  const nombres = data.cuenta_mesas.filter(m => m.pedido_id === pedidoId && (m.activa || cerrada)).map(m => data.mesas.find(x => x.id === m.mesa_id)?.nombre).filter(Boolean);
  return [...new Set(nombres)].join(" + ");
};
