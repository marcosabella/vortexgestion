import { PagoVenta, TipoPago, Venta } from "@/types/venta";

export type CajaEstado = "abierta" | "cerrada";
export type CajaMovimientoTipo = "ingreso" | "egreso";

export interface CajaDiaria {
  id?: string;
  comercio_id?: string;
  fecha: string;
  estado: CajaEstado;
  monto_apertura: number;
  monto_cierre_sistema?: number | null;
  monto_cierre_real?: number | null;
  diferencia?: number | null;
  abierto_at?: string;
  cerrado_at?: string | null;
  observaciones_apertura?: string | null;
  observaciones_cierre?: string | null;
  created_at?: string;
  updated_at?: string;
  caja_movimientos?: CajaMovimiento[];
  ventas?: Venta[];
}

export interface CajaMovimiento {
  id?: string;
  comercio_id?: string;
  caja_id: string;
  venta_id?: string | null;
  tipo: CajaMovimientoTipo;
  concepto: string;
  descripcion?: string | null;
  monto: number;
  fecha_movimiento?: string;
  created_at?: string;
  updated_at?: string;
}

export type ResumenPago = {
  tipo: TipoPago;
  monto: number;
  cantidad: number;
};

export type CajaResumen = {
  ventas: Venta[];
  totalVentas: number;
  cantidadVentas: number;
  pagosPorTipo: ResumenPago[];
  totalContado: number;
  totalTransferencia: number;
  totalTarjeta: number;
  totalCheque: number;
  totalCuentaCorriente: number;
  ingresosManuales: number;
  egresosManuales: number;
  totalSistema: number;
};

export const MOVIMIENTOS_CAJA = [
  { value: "ingreso", label: "Ingreso" },
  { value: "egreso", label: "Egreso" },
] as const;

export const getCajaMovimientoLabel = (tipo: CajaMovimientoTipo | string) =>
  MOVIMIENTOS_CAJA.find((item) => item.value === tipo)?.label || tipo;

export const esMovimientoManual = (movimiento: Pick<CajaMovimiento, "venta_id">) => !movimiento.venta_id;

export const buildCajaResumen = (
  caja: CajaDiaria | null | undefined,
  ventas: Venta[],
): CajaResumen => {
  const pagos = ventas.flatMap((venta) => {
    if (venta.pagos_venta?.length) return venta.pagos_venta;

    return [
      {
        tipo_pago: venta.tipo_pago,
        monto: venta.total,
        recargo_cuotas: venta.recargo_cuotas || 0,
      } as PagoVenta,
    ];
  });

  const pagosPorTipo = pagos.reduce<ResumenPago[]>((acc, pago) => {
    const existente = acc.find((item) => item.tipo === pago.tipo_pago);
    const monto = Number(pago.monto || 0);

    if (existente) {
      existente.monto += monto;
      existente.cantidad += 1;
    } else {
      acc.push({ tipo: pago.tipo_pago, monto, cantidad: 1 });
    }

    return acc;
  }, []);

  const totalPorTipo = (tipo: TipoPago) =>
    pagos
      .filter((pago) => pago.tipo_pago === tipo)
      .reduce((sum, pago) => sum + Number(pago.monto || 0), 0);

  const ingresosManuales = (caja?.caja_movimientos || [])
    .filter((movimiento) => esMovimientoManual(movimiento) && movimiento.tipo === "ingreso")
    .reduce((sum, movimiento) => sum + Number(movimiento.monto || 0), 0);

  const egresosManuales = (caja?.caja_movimientos || [])
    .filter((movimiento) => esMovimientoManual(movimiento) && movimiento.tipo === "egreso")
    .reduce((sum, movimiento) => sum + Number(movimiento.monto || 0), 0);

  const totalContado = totalPorTipo("contado");

  return {
    ventas,
    totalVentas: ventas.reduce((sum, venta) => sum + Number(venta.total || 0), 0),
    cantidadVentas: ventas.length,
    pagosPorTipo,
    totalContado,
    totalTransferencia: totalPorTipo("transferencia"),
    totalTarjeta: totalPorTipo("tarjeta"),
    totalCheque: totalPorTipo("cheque"),
    totalCuentaCorriente: totalPorTipo("cta_cte"),
    ingresosManuales,
    egresosManuales,
    totalSistema: Number(caja?.monto_apertura || 0) + totalContado + ingresosManuales - egresosManuales,
  };
};
