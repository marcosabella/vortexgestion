import {
  adminClient,
  authenticatedUser,
  corsHeaders,
  credential,
  json,
  mpFetch,
} from "../mercadopago-checkout/mercadopago-shared.ts";

const functionBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

function metadataObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = adminClient();
  try {
    const user = await authenticatedUser(req, db);
    const body = await req.json();
    const notificacionId = String(body.notificacionId || "");
    const comercioId = String(body.comercioId || "");
    if (!notificacionId || !comercioId) throw new Error("Faltan datos del cobro");

    const { data: membresia } = await db.from("comercio_usuarios")
      .select("comercio_id")
      .eq("user_id", user.id).eq("comercio_id", comercioId).eq("activo", true).eq("solo_restaurante", false)
      .maybeSingle();
    if (!membresia) throw new Error("No tiene acceso al comercio");

    const { data: notificacion } = await db.from("notificaciones")
      .select("*").eq("id", notificacionId).eq("activo", true).maybeSingle();
    if (!notificacion) throw new Error("El comprobante ya no esta disponible");

    const { data: destino } = await db.from("notificacion_destinatarios")
      .select("comercio_id").eq("notificacion_id", notificacionId);
    if (destino?.length && !destino.some((item: { comercio_id: string }) => item.comercio_id === comercioId)) {
      throw new Error("El comprobante no corresponde a este comercio");
    }

    const metadata = metadataObject(notificacion.metadata);
    if (metadata.tipo !== "membresia_pago" || metadata.mercadopago_habilitado !== true) {
      throw new Error("Este comprobante no admite pago con Mercado Pago");
    }
    const receptorComercioId = String(metadata.receptor_comercio_id || "");
    const importe = Number(notificacion.comprobante_monto);
    if (!receptorComercioId || !Number.isFinite(importe) || importe <= 0) {
      throw new Error("El comprobante no tiene un importe de cobro valido");
    }

    const { data: config } = await db.from("mercadopago_configuraciones")
      .select("ambiente,connected").eq("comercio_id", receptorComercioId)
      .eq("connected", true).maybeSingle();
    if (!config) throw new Error("La cuenta de cobro de Mercado Pago no esta conectada");

    const { data: existente } = await db.from("membresia_pagos_mercadopago")
      .select("*").eq("notificacion_id", notificacionId)
      .eq("comercio_id", comercioId).maybeSingle();
    if (existente?.estado === "aprobado") {
      return json({ estado: "aprobado", operacionId: existente.id });
    }
    const mismosTerminos = existente
      && existente.receptor_comercio_id === receptorComercioId
      && Number(existente.importe) === importe;
    if (mismosTerminos && existente.checkout_url && ["pendiente", "procesando"].includes(existente.estado)) {
      return json({ checkoutUrl: existente.checkout_url, estado: existente.estado, operacionId: existente.id });
    }

    let idempotencyKey = mismosTerminos ? existente.idempotency_key : crypto.randomUUID();
    const externalReference = existente?.external_reference ||
      `svw:membresia:${notificacionId}:${comercioId}`;
    let pago = existente;
    if (!pago) {
      const { data, error } = await db.from("membresia_pagos_mercadopago").insert({
        notificacion_id: notificacionId,
        comercio_id: comercioId,
        receptor_comercio_id: receptorComercioId,
        importe,
        external_reference: externalReference,
        idempotency_key: idempotencyKey,
      }).select().single();
      if (error?.code === "23505") {
        const { data: concurrente, error: concurrenteError } = await db
          .from("membresia_pagos_mercadopago").select("*")
          .eq("notificacion_id", notificacionId).eq("comercio_id", comercioId).single();
        if (concurrenteError) throw concurrenteError;
        pago = concurrente;
        idempotencyKey = concurrente.idempotency_key;
      } else {
        if (error) throw error;
        pago = data;
      }
    } else {
      const { data, error } = await db.from("membresia_pagos_mercadopago").update({
        estado: "pendiente", estado_detalle: null, receptor_comercio_id: receptorComercioId,
        importe, idempotency_key: idempotencyKey,
      }).eq("id", pago.id).select().single();
      if (error) throw error;
      pago = data;
    }

    const origin = String(body.returnOrigin || "").replace(/\/$/, "");
    const allowedOrigins = [
      ...(Deno.env.get("MP_ALLOWED_STORE_ORIGINS") || "").split(","),
      Deno.env.get("SVW_APP_URL") || "",
    ].map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
    const local = origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
    if ((!origin.startsWith("https://") && !local) || (allowedOrigins.length && !local && !allowedOrigins.includes(origin))) {
      throw new Error("Origen de retorno no autorizado");
    }

    const cred = await credential(db, receptorComercioId);
    const payerName = String(user.user_metadata?.nombre || user.user_metadata?.name || "");
    const preference = await mpFetch("/checkout/preferences", cred.access_token, {
      method: "POST",
      headers: { "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        items: [{
          id: notificacionId,
          title: `Membresia ${notificacion.comprobante_periodo || notificacion.comprobante_numero || "Vortex Gestion"}`,
          quantity: 1,
          unit_price: importe,
          currency_id: "ARS",
        }],
        payer: { email: user.email, name: payerName || undefined },
        external_reference: externalReference,
        back_urls: {
          success: `${origin}/notificaciones?pago_membresia=aprobado`,
          pending: `${origin}/notificaciones?pago_membresia=pendiente`,
          failure: `${origin}/notificaciones?pago_membresia=rechazado`,
        },
        notification_url: `${functionBase}/membresia-webhook?pago=${pago.id}`,
        metadata: { pago_membresia_id: pago.id, notificacion_id: notificacionId, comercio_id: comercioId },
      }),
    });
    const checkoutUrl = config.ambiente === "production"
      ? preference.init_point
      : (preference.sandbox_init_point || preference.init_point);
    if (!checkoutUrl) throw new Error("Mercado Pago no devolvio una URL de checkout");

    await db.from("membresia_pagos_mercadopago").update({
      preference_id: preference.id, checkout_url: checkoutUrl, raw_response: preference,
    }).eq("id", pago.id);
    return json({ checkoutUrl, estado: "pendiente", operacionId: pago.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
