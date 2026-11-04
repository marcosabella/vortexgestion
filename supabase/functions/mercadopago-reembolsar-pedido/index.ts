import { adminClient, authenticatedUser, corsHeaders, credential, json, mpFetch } from '../_shared/mercadopago.ts';
import { procesarReembolso, type ReembolsoPreparado } from './reembolso.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405);
  try {
    const db = adminClient();
    const user = await authenticatedUser(req, db);
    const body = await req.json();
    const pedidoId = String(body.pedidoId || '');
    const comercioId = String(body.comercioId || '');
    if (!pedidoId || !comercioId) throw new Error('Pedido y comercio requeridos');
    const { data: anulacion, error: anulacionError } = await db.rpc('preparar_anulacion_comprobante_online', {
      p_pedido_id: pedidoId, p_comercio_id: comercioId, p_usuario_id: user.id,
    });
    if (anulacionError) throw new Error(anulacionError.message);
    if (anulacion?.requiere_cae) {
      try {
        const respuesta = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/obtener-cae-afip`, {
          method: 'POST', headers: { Authorization: req.headers.get('Authorization')!,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ventaId: anulacion.nota_credito_id }), signal: AbortSignal.timeout(45_000),
        });
        const fiscal = await respuesta.json();
        if (!respuesta.ok || !fiscal.success) throw new Error(fiscal.error || 'ARCA no confirmo la nota de credito');
      } catch (error) {
        const detalle = error instanceof Error ? error.message : 'No se pudo confirmar la nota de credito';
        const { error: saveError } = await db.from('pedido_online_cancelaciones').update({ error: detalle.slice(0, 500), updated_at: new Date().toISOString() })
          .eq('pedido_id', pedidoId).eq('comercio_id', comercioId);
        if (saveError) throw new Error(saveError.message);
        return json({ estado: 'fiscal_pendiente', detalle });
      }
    }
    // El backend valida tenant, rol administrador y pago; el navegador no envia importes.
    const { data, error } = await db.rpc('preparar_reembolso_pedido_online', {
      p_pedido_id: pedidoId, p_comercio_id: comercioId, p_usuario_id: user.id,
    });
    if (error) throw new Error(error.message);
    const job = data as ReembolsoPreparado;
    // La lectura de credenciales tambien queda dentro del intento registrado.
    let token: string | null = null;
    let collectorId = '';
    if (job.puede_procesar) {
      try {
        const cred = await credential(db, comercioId);
        token = cred.access_token;
        collectorId = String(cred.mp_user_id);
      } catch {
        const { error: saveError } = await db.rpc('finalizar_intento_reembolso_online', {
          p_id: job.id, p_intento: job.intento, p_estado: 'error',
          p_error: 'El comercio debe revisar su conexion con Mercado Pago', p_refund_id: null,
        });
        if (saveError) throw new Error(saveError.message);
        return json({ estado: 'error', detalle: 'El comercio debe revisar su conexion con Mercado Pago' });
      }
    }
    const result = await procesarReembolso(job, collectorId, {
      request: (path, init) => mpFetch(path, token!, { ...init, signal: AbortSignal.timeout(15_000) }),
      fijarImporte: async importe => {
        const { data: amount, error } = await db.rpc('fijar_importe_reembolso_online', { p_id: job.id, p_intento: job.intento, p_importe: importe });
        if (error) throw new Error(error.message);
        return Number(amount);
      },
      sincronizar: async (total, refundId) => {
        const { error } = await db.rpc('sincronizar_reembolso_pedido_online', {
          p_operacion_id: job.operacion_id, p_payment_id: job.payment_id, p_total: total, p_refund_id: refundId || null,
        });
        if (error) throw new Error(error.message);
      },
      finalizar: async (estado, detalle, refundId) => {
        const { error } = await db.rpc('finalizar_intento_reembolso_online', {
          p_id: job.id, p_intento: job.intento, p_estado: estado, p_error: detalle, p_refund_id: refundId,
        });
        if (error) throw new Error(error.message);
      },
    });
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo iniciar la devolucion. Actualiza el pedido para revisar su estado' }, 400);
  }
});
