import { format } from "date-fns";
import type { Comercio } from "@/types/comercio";
import type { CuentaCorriente } from "@/types/cuenta-corriente";
import type { ReciboPagoCliente } from "@/types/recibo-pago-cliente";
import { formatCuentaCorrienteMovimiento } from "@/utils/cuentaCorrientePresentation";

type Movimiento = CuentaCorriente & { moneda?: string; comercio_id?: string };
const normalizar = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const dia = (date: string) => format(new Date(date), "yyyy-MM-dd");

export const esPagoCliente = (movimiento: CuentaCorriente) => movimiento.tipo_movimiento === "credito"
  && /^pago(?:[_\s-]|$)/.test(normalizar(movimiento.concepto || "")) && Number(movimiento.monto) > 0;

// Representación de consulta: no crea recibos numerados ni movimientos nuevos.
// Los saldos históricos se calculan al cierre del día, sin inventar el orden
// intradiario de movimientos importados que comparten fecha y hora.
export function buildReciboPagoHistorico(
  movimiento: Movimiento,
  movimientos: Movimiento[],
  comercio: Comercio,
  generadoEn = new Date().toISOString(),
): ReciboPagoCliente {
  if (!esPagoCliente(movimiento) || !movimientos.some((m) => m.id === movimiento.id)
    || (movimiento.comercio_id && movimiento.comercio_id !== comercio.id)) {
    throw new Error("No se puede recuperar el comprobante de este pago.");
  }
  const fecha = dia(movimiento.fecha_movimiento);
  const moneda = movimiento.moneda || "ARS";
  const presentation = formatCuentaCorrienteMovimiento(movimiento);
  const concepto = normalizar(presentation.concepto);
  const tipo = /transferencia/.test(concepto) ? "transferencia"
    : /tarjeta/.test(concepto) ? "tarjeta" : /cheque/.test(concepto) ? "cheque"
      : /contado|efectivo/.test(concepto) ? "contado" : null;
  const saldoCentavos = movimientos.filter((m) => m.cliente_id === movimiento.cliente_id
    && (!m.comercio_id || m.comercio_id === comercio.id)
    && (m.moneda || "ARS") === moneda && dia(m.fecha_movimiento) <= fecha)
    .reduce((sum, m) => sum + (m.tipo_movimiento === "debito" ? 1 : -1) * Math.round(Number(m.monto) * 100), 0);
  const importe = Number(movimiento.monto);
  return {
    id: `historico-${movimiento.id}`, comercio_id: comercio.id, cliente_id: movimiento.cliente_id,
    numero: 0, solicitud_id: "", fecha, creado_en: generadoEn, importe, moneda,
    saldo_anterior: saldoCentavos / 100 + importe, saldo_posterior: saldoCentavos / 100,
    cliente_snapshot: {
      nombre: [movimiento.cliente?.nombre, movimiento.cliente?.apellido].filter(Boolean).join(" ") || "Cliente",
      cuit: movimiento.cliente?.cuit, telefono: movimiento.cliente?.telefono,
    },
    comercio_snapshot: comercio,
    pagos: tipo ? [{ tipo, monto: importe }] : [],
    documentos: movimiento.venta?.numero_comprobante ? [{ numero: movimiento.venta.numero_comprobante, importe }] : [],
    movimiento_ids: [movimiento.id], observaciones: presentation.observaciones || undefined,
    historico: { movimiento_id: movimiento.id, generado_en: generadoEn, saldo_a_fecha: fecha },
  };
}
