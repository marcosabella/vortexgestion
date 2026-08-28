import {
  adminClient,
  credential,
  json,
  mpFetch,
  verifySignature,
} from "./mercadopago-shared.ts";
const mapStatus = (status: string) => ({
  approved: "aprobado",
  processed: "aprobado",
  pending: "pendiente",
  in_process: "procesando",
  rejected: "rechazado",
  cancelled: "cancelado",
  canceled: "cancelado",
  expired: "vencido",
  refunded: "reembolsado",
}[status] || "pendiente");
Deno.serve(async (req) => {
  const db = adminClient();
  let eventId: string | null = null;
  try {
    const url = new URL(req.url),
      opId = url.searchParams.get("op"),
      payload = await req.json().catch(() => ({})),
      dataId = String(
        payload?.data?.id || payload?.id || url.searchParams.get("data.id") ||
          "",
      );
    if (!opId) throw new Error("Notificacion sin operacion asociada");
    const { data: op } = await db.from("mercadopago_operaciones").select("*")
      .eq("id", opId).single();
    if (!op) throw new Error("Operacion no encontrada");
    const secret = op.modalidad === "qr"
      ? Deno.env.get("MP_QR_WEBHOOK_SECRET")
      : Deno.env.get("MP_CHECKOUT_WEBHOOK_SECRET");
    const signaturePresent = Boolean(req.headers.get("x-signature"));
    const validSignature = signaturePresent
      ? await verifySignature(req, dataId, secret)
      : op.modalidad === "qr";
    if (!validSignature) throw new Error("Firma de webhook invalida");
    const externalEvent = String(
      payload?.id ||
        `${payload?.type || payload?.topic || "event"}:${dataId}:${
          req.headers.get("x-request-id") || crypto.randomUUID()
        }`,
    );
    const { data: event, error: eventError } = await db.from(
      "mercadopago_webhook_eventos",
    ).insert({
      evento_externo_id: externalEvent,
      comercio_id: op.comercio_id,
      topic: payload?.type || payload?.topic || op.modalidad,
      recurso_id: dataId,
      firma_valida: validSignature,
      payload,
      intentos: 1,
    }).select().single();
    if (eventError?.code === "23505") {
      return json({ received: true, duplicate: true });
    }
    if (eventError) throw eventError;
    eventId = event.id;
    const cred = await credential(db, op.comercio_id);
    let remote: any;
    if (op.order_id) {
      remote = await mpFetch(
        `/v1/orders/${op.order_id}`,
        cred.access_token,
      );
    } else remote = await mpFetch(`/v1/payments/${dataId}`, cred.access_token);
    const status = String(
        remote.status || remote.status_detail ||
          remote.transactions?.payments?.[0]?.status || "pending",
      ),
      localStatus = mapStatus(status);
    const payment = remote.transactions?.payments?.[0] || remote;
    const paymentId = String(payment.id || dataId || "");
    if (localStatus === "aprobado") {
      await db.rpc("registrar_pago_mercadopago_aprobado", {
        p_operacion_id: op.id,
        p_payment_id: paymentId,
        p_medio_pago: payment.payment_method_id || payment.payment_method?.id ||
          null,
        p_cuotas: payment.installments || 1,
        p_raw: remote,
      });
    } else {
      await db.from("mercadopago_operaciones").update({
        estado: localStatus,
        estado_detalle: remote.status_detail || status,
        payment_id: paymentId || op.payment_id,
        raw_response: remote,
      }).eq("id", op.id);
      if (op.pedido_online_id) {
        await db.from("pedidos_online").update({
          estado_pago: localStatus === "procesando" ? "pendiente" : localStatus,
        }).eq("id", op.pedido_online_id);
      }
    }
    await db.from("mercadopago_webhook_eventos").update({
      procesado_at: new Date().toISOString(),
      error: null,
    }).eq("id", event.id);
    return json({ received: true });
  } catch (error) {
    if (eventId) {
      await db.from("mercadopago_webhook_eventos").update({
        error: error instanceof Error ? error.message : String(error),
      }).eq("id", eventId);
    }
    console.error("mercadopago-webhook", error);
    return json({ received: true }, 200);
  }
});
