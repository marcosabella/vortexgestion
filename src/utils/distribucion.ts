import type { ResumenDistribucion } from "@/types/distribucion";

export const distribucionMoney = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    value,
  );
export const distribucionToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
export function resumenParada(data: ResumenDistribucion, paradaId: string) {
  const cargas = data.cargas.filter((c) => c.parada_id === paradaId);
  const total = cargas.reduce(
    (s, c) =>
      s + Math.round(
          (c.entregada - c.devuelta) * Number(
            data.items.find((i) => i.id === c.item_id)?.precio || 0,
          ) * 100,
        ) / 100,
    0,
  );
  const cobros = data.eventos.filter((e) =>
    e.parada_id === paradaId && cobroVigente(data, e.id)
  );
  const cobrado = cobros.reduce((s, e) => s + Number(e.datos.monto || 0), 0);
  return {
    cargas,
    total,
    cobrado,
    saldo: Math.round((total - cobrado) * 100) / 100,
  };
}
export function cobroVigente(data: ResumenDistribucion, eventoId: string) {
  return data.eventos.some((e) => e.id === eventoId && e.tipo === "cobro") &&
    !data.eventos.some((e) =>
      e.tipo === "anular_cobro" && e.datos.evento_id === eventoId
    );
}
export function pendienteItem(data: ResumenDistribucion, itemId: string) {
  const item = data.items.find((i) => i.id === itemId);
  const comprometido = data.cargas.filter((c) => c.item_id === itemId).reduce(
    (s, c) => {
      const parada = data.paradas.find((p) => p.id === c.parada_id);
      const reparto = data.repartos.find((r) => r.id === parada?.reparto_id);
      return s +
        (reparto?.estado === "rendido"
          ? c.entregada - c.devuelta
          : reparto?.estado === "cancelado"
          ? 0
          : c.cargada);
    },
    0,
  );
  return Math.max(0, (item?.cantidad || 0) - comprometido);
}
