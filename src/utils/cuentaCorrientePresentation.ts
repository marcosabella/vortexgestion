import { CONCEPTOS_MOVIMIENTO, type CuentaCorriente } from "@/types/cuenta-corriente";

const MEDIOS_PAGO: Record<string, string> = {
  contado: "CONTADO",
  efectivo: "EFECTIVO",
  transferencia: "TRANSFERENCIA",
  tarjeta: "TARJETA",
  cheque: "CHEQUE",
  cta_cte: "CUENTA CORRIENTE",
};

export const formatCuentaCorrienteComprobante = (
  movimiento: Pick<CuentaCorriente, "tipo_movimiento" | "concepto" | "venta" | "observaciones">,
  numero = movimiento.venta?.numero_comprobante,
  prefijoVenta = "Venta:",
) => {
  const concepto = formatCuentaCorrienteMovimiento(movimiento).concepto;
  if (!numero || (movimiento.tipo_movimiento === "credito" && /^pago(?:[_\s-]|$)/i.test(movimiento.concepto.trim()))) return concepto;
  return `${prefijoVenta} ${numero}`;
};

const isPagoHistorico = (concepto: string) => /^pago hist[oó]rico\s*#/i.test(concepto.trim());

const getMedioPagoHistorico = (observaciones?: string | null) => {
  const medio = observaciones?.match(/(?:^|\|)\s*medio:\s*([^|]+)/i)?.[1]?.trim().toLowerCase();
  if (!medio) return null;
  return MEDIOS_PAGO[medio] || medio.replaceAll("_", " ").toLocaleUpperCase("es-AR");
};

export const formatCuentaCorrienteMovimiento = (
  movimiento: Pick<{ concepto: string; observaciones?: string | null }, "concepto" | "observaciones">
) => {
  const concepto = movimiento.concepto?.trim() || "Movimiento";

  if (isPagoHistorico(concepto)) {
    const medio = getMedioPagoHistorico(movimiento.observaciones);
    return {
      concepto: medio ? `PAGO ${medio}` : "PAGO",
      observaciones: "",
    };
  }

  const observaciones = (movimiento.observaciones || "")
    .split("|")
    .map((parte) => parte.trim())
    .filter((parte) => parte && !/^migrado de access(?:\b|;)/i.test(parte))
    .join(" | ");

  return {
    concepto: concepto === "pago_efectivo" ? "PAGO EN EFECTIVO" : CONCEPTOS_MOVIMIENTO.find((item) => item.value === concepto)?.label || concepto,
    observaciones,
  };
};
