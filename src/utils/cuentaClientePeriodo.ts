import { format } from "date-fns";
import type { CuentaCorriente } from "@/types/cuenta-corriente";

export const inicioMesCuentaCliente = (date = new Date()) => format(new Date(date.getFullYear(), date.getMonth(), 1), "yyyy-MM-dd");

export function periodoCuentaCliente(movimientos: CuentaCorriente[], desde: string, hasta = "") {
  const ordered = [...movimientos].sort((a, b) => new Date(a.fecha_movimiento).getTime() - new Date(b.fecha_movimiento).getTime() || a.id.localeCompare(b.id));
  let saldoAnterior = 0, debitos = 0, creditos = 0;
  const visibles: CuentaCorriente[] = [];
  for (const movement of ordered) {
    const fecha = format(new Date(movement.fecha_movimiento), "yyyy-MM-dd");
    const cents = Math.round(Number(movement.monto) * 100);
    if (desde && fecha < desde) { saldoAnterior += movement.tipo_movimiento === "debito" ? cents : -cents; continue; }
    if (hasta && fecha > hasta) continue;
    visibles.push(movement);
    if (movement.tipo_movimiento === "debito") debitos += cents; else creditos += cents;
  }
  return { movimientos: visibles, saldoAnterior: saldoAnterior / 100, totalDebitos: debitos / 100, totalCreditos: creditos / 100, saldoFinal: (saldoAnterior + debitos - creditos) / 100 };
}
