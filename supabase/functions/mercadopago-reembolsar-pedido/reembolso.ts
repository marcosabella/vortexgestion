export interface ReembolsoPreparado {
  id: string;
  intento: string;
  operacion_id: string;
  comercio_id: string;
  estado: string;
  puede_procesar: boolean;
  payment_id: string;
  external_reference: string;
  idempotency_key: string;
  importe: number | string;
}

interface Dependencias {
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  fijarImporte: (importe: number) => Promise<number>;
  sincronizar: (total: number, refundId?: string) => Promise<void>;
  finalizar: (estado: 'pendiente' | 'error', error: string | null, refundId: string | null) => Promise<void>;
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta de Mercado Pago invalida');
  return value as Record<string, unknown>;
};
const centavos = (value: unknown) => {
  const n = Number(value);
  if (value === null || value === '' || !Number.isFinite(n) || n < 0) throw new Error('Importe de Mercado Pago invalido');
  return Math.round(n * 100);
};

// Sin credenciales ni dependencias de Deno: permite probar fallos de red y reintentos.
export async function procesarReembolso(job: ReembolsoPreparado, collectorId: string, deps: Dependencias) {
  if (!job.puede_procesar) return { estado: job.estado === 'completado' ? 'completado' : 'pendiente' };
  const path = `/v1/payments/${encodeURIComponent(job.payment_id)}`;
  const importe = centavos(job.importe);
  const leerPago = async () => {
    const pago = record(await deps.request(path));
    if (String(pago.id) !== job.payment_id || String(pago.collector_id) !== collectorId
      || pago.external_reference !== job.external_reference || pago.currency_id !== 'ARS'
      || centavos(pago.transaction_amount) !== importe) {
      throw new Error('El pago de Mercado Pago no coincide con el pedido y la cuenta del comercio');
    }
    const devuelto = centavos(pago.transaction_amount_refunded ?? 0);
    if (devuelto > importe) throw new Error('El importe devuelto supera el pago');
    return { pago, devuelto };
  };
  try {
    let { pago, devuelto } = await leerPago();
    if (devuelto === importe && pago.status === 'refunded') {
      await deps.sincronizar(devuelto / 100);
      return { estado: 'completado' };
    }
    if (pago.status !== 'approved') throw new Error('El pago no esta aprobado para una devolucion');
    if (devuelto > 0) await deps.sincronizar(devuelto / 100);
    const refunds = await deps.request(`${path}/refunds`);
    if (!Array.isArray(refunds)) throw new Error('No se pudo verificar el historial de devoluciones');
    // No se superpone una solicitud nueva a una devolucion pendiente, incluso externa.
    if (refunds.some(value => !['approved', 'rejected', 'cancelled', 'canceled'].includes(String(record(value).status)))) {
      await deps.finalizar('pendiente', null, null);
      return { estado: 'pendiente' };
    }
    const solicitado = centavos(await deps.fijarImporte((importe - devuelto) / 100));
    if (solicitado !== importe - devuelto) {
      throw new Error('El saldo a devolver cambio. Revisar las devoluciones realizadas en Mercado Pago');
    }
    const refund = record(await deps.request(`${path}/refunds`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': job.idempotency_key },
      body: JSON.stringify({ amount: solicitado / 100 }),
    }));
    if (!refund.id || centavos(refund.amount) !== solicitado) throw new Error('Mercado Pago no confirmo el importe solicitado');
    if (['rejected', 'cancelled', 'canceled'].includes(String(refund.status))) {
      throw new Error('Mercado Pago rechazo la devolucion. Revisar el cobro antes de reintentar');
    }
    // La respuesta al POST puede adelantarse a la actualizacion del pago.
    ({ pago, devuelto } = await leerPago());
    if (devuelto === importe && pago.status === 'refunded') {
      await deps.sincronizar(devuelto / 100, String(refund.id));
      return { estado: 'completado' };
    }
    if (devuelto > 0) await deps.sincronizar(devuelto / 100);
    await deps.finalizar('pendiente', null, String(refund.id));
    return { estado: 'pendiente' };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'No se pudo confirmar la devolucion';
    await deps.finalizar('error', detalle, null);
    return { estado: 'error', detalle };
  }
}
