import { addDays, format, isValid, parseISO } from "date-fns";
import type { CuentaCorriente, CuentaCorrienteResumen } from "@/types/cuenta-corriente";
import { periodoCuentaCliente } from "@/utils/cuentaClientePeriodo";

export type ClienteParaResumen = { id?: string; nombre: string; apellido: string; cuit: string; telefono?: string };
export type TipoSaldoResumen = "deudor" | "acreedor" | "todos";
export type ResumenCuentaClientePdf = { resumen: CuentaCorrienteResumen; movimientos: CuentaCorriente[]; saldoInicial: number; fechaDesde: string };

export function agruparMovimientosClientes(movimientos: CuentaCorriente[]) {
  const groups = new Map<string, CuentaCorriente[]>();
  for (const movement of movimientos) {
    const group = groups.get(movement.cliente_id) || [];
    group.push(movement);
    groups.set(movement.cliente_id, group);
  }
  return groups;
}

export function saldoActualResumenCliente(movimientos: CuentaCorriente[]) {
  return movimientos.reduce((sum, movement) => sum + (movement.tipo_movimiento === "debito" ? 1 : -1) * Math.round(Number(movement.monto) * 100), 0) / 100;
}

export function coincideTipoSaldoResumen(saldo: number, tipo: TipoSaldoResumen) {
  return tipo === "todos" || (tipo === "deudor" ? saldo > 0 : saldo < 0);
}

export function resumenClienteAlCorte(cliente: ClienteParaResumen, movimientos: CuentaCorriente[], fechaCorte: string): ResumenCuentaClientePdf {
  const date = parseISO(fechaCorte);
  if (!cliente.id || !/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte) || !isValid(date)) throw new Error("Cliente o fecha de corte inválidos.");
  if (movimientos.some((movement) => movement.cliente_id !== cliente.id)) throw new Error("Los movimientos no corresponden al cliente seleccionado.");
  const fechaDesde = format(addDays(date, 1), "yyyy-MM-dd");
  const period = periodoCuentaCliente(movimientos, fechaDesde);
  return {
    saldoInicial: period.saldoAnterior,
    fechaDesde,
    movimientos: period.movimientos,
    resumen: {
      cliente_id: cliente.id, cliente_nombre: cliente.nombre, cliente_apellido: cliente.apellido, cliente_cuit: cliente.cuit, cliente_telefono: cliente.telefono,
      total_debitos: period.totalDebitos, total_creditos: period.totalCreditos, saldo_actual: period.saldoFinal,
      ultimo_movimiento: period.movimientos.at(-1)?.fecha_movimiento || `${fechaCorte}T12:00:00`,
    },
  };
}
