import {
  adminClient,
  credential,
  json,
  mpFetch,
  verifySignature,
} from "../mercadopago-checkout/mercadopago-shared.ts";

const mapStatus = (status: string) => ({
  approved: "aprobado", processed: "aprobado", pending: "pendiente",
  in_process: "procesando", rejected: "rechazado", cancelled: "cancelado",
  canceled: "cancelado", expired: "vencido", refunded: "reembolsado",
}[status] || "pendiente");

Deno.serve(async (req) => {
  const db = adminClient();
  try {
    const url = new URL(req.url);
    const pagoId = url.searchParams.get("pago");
    const payload = await req.json().catch(() => ({}));
    const dataId = String(payload?.data?.id || payload?.id || url.searchParams.get("data.id") || "");
    if (!pagoId || !dataId) throw new Error("Notificacion sin pago asociado");

    const { data: pago } = await db.from("membresia_pagos_mercadopago")
      .select("*").eq("id", pagoId).maybeSingle();
    if (!pago) throw new Error("Pago no encontrado");

    const validSignature = await verifySignature(req, dataId, Deno.env.get("MP_CHECKOUT_WEBHOOK_SECRET"));
    if (!validSignature) throw new Error("Firma de webhook invalida");

    const cred = await credential(db, pago.receptor_comercio_id);
    const remote = await mpFetch(`/v1/payments/${dataId}`, cred.access_token);
    if (String(remote.external_reference || "") !== pago.external_reference) {
      throw new Error("La referencia del pago no coincide");
    }
    if (String(remote.currency_id || "") !== pago.moneda || Number(remote.transaction_amount) !== Number(pago.importe)) {
      throw new Error("El importe o la moneda del pago no coinciden");
    }

    const estado = mapStatus(String(remote.status || "pending"));
    if (estado === "aprobado") {
      await db.rpc("registrar_pago_membresia_mercadopago", {
        p_pago_id: pago.id,
        p_payment_id: String(remote.id || dataId),
        p_medio_pago: remote.payment_method_id || null,
        p_cuotas: remote.installments || 1,
        p_raw: remote,
      });
    } else {
      await db.from("membresia_pagos_mercadopago").update({
        estado,
        estado_detalle: remote.status_detail || remote.status || null,
        payment_id: String(remote.id || dataId),
        raw_response: remote,
      }).eq("id", pago.id);
    }
    return json({ received: true });
  } catch (error) {
    console.error("membresia-webhook", error);
    // Mercado Pago no debe reintentar indefinidamente eventos invalidos.
    return json({ received: true }, 200);
  }
});

