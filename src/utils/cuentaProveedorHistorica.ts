type MovimientoHistorico = {
  tipo: "deuda" | "pago";
  monto: number;
  factura_id?: string | null;
  gasto_egreso_id?: string | null;
  observaciones?: string | null;
};

export function conceptoHistoricoProveedor(observaciones?: string | null): string | null {
  const compra = /^Historico Access CompraProveedor:\d+\s*\|\s*Comprobante\s+([^|]+)/.exec(observaciones || "");
  if (compra) return `Comprobante ${compra[1].trim()}`;
  const pago = /^Historico Access PagosProveedores:(\d+)(?:\s*\||$)/.exec(observaciones || "");
  return pago ? `Pago: ${pago[1]}` : null;
}

export function saldoHistoricoProveedor(movimientos: MovimientoHistorico[]): number {
  const historicos = movimientos.filter((movement) => !movement.factura_id && !movement.gasto_egreso_id);
  if (!historicos.some((movement) => /^Historico Access (CompraProveedor|PagosProveedores):/.test(movement.observaciones || ""))) return 0;
  return historicos.reduce((sum, movement) => sum + (movement.tipo === "deuda" ? 1 : -1) * Math.round(Number(movement.monto) * 100), 0) / 100;
}

export function periodoCuentaProveedor<T extends MovimientoHistorico & { id: string; fecha: string }>(movimientos: T[], desde: string, hasta: string) {
  const ordered = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  let saldoAnterior = 0;
  let saldo = 0;
  const visibles: Array<{ movement: T; accumulatedBalance: number }> = [];
  for (const movement of ordered) {
    const cents = (movement.tipo === "deuda" ? 1 : -1) * Math.round(Number(movement.monto) * 100);
    if (desde && movement.fecha < desde) { saldoAnterior += cents; continue; }
    if (hasta && movement.fecha > hasta) continue;
    saldo += cents;
    visibles.push({ movement, accumulatedBalance: (saldoAnterior + saldo) / 100 });
  }
  return { saldoAnterior: saldoAnterior / 100, movimientos: visibles };
}
