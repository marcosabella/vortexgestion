import {
  adminClient,
  assertComercio,
  authenticatedUser,
  corsHeaders,
  credential,
  externalReference,
  json,
  mpFetch,
  sha256,
} from "./mercadopago-shared.ts";
const functionBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const db = adminClient();
  try {
    const user = await authenticatedUser(req, db);
    const body = await req.json();
    const action = String(body.action || "status");
    const comercioId = String(body.comercioId || "");
    if (!comercioId) throw new Error("Comercio requerido");
    await assertComercio(db, user.id, comercioId);
    if (action === "status") {
      const [{ data: config }, { data: cajas }, { data: operaciones }] =
        await Promise.all([
          db.from("mercadopago_configuraciones").select("*").eq(
            "comercio_id",
            comercioId,
          ).maybeSingle(),
          db.from("mercadopago_cajas").select(
            "*,sucursal:mercadopago_sucursales(*)",
          ).eq("comercio_id", comercioId).order("created_at"),
          db.from("mercadopago_operaciones").select("*").eq(
            "comercio_id",
            comercioId,
          ).order("created_at", { ascending: false }).limit(50),
        ]);
      return json({
        config,
        cajas: cajas || [],
        operaciones: operaciones || [],
      });
    }
    if (action === "oauth_url") {
      const state = crypto.randomUUID() + crypto.randomUUID(),
        stateHash = await sha256(state),
        redirectUri = Deno.env.get("MP_OAUTH_REDIRECT_URI") ||
          `${functionBase}/mercadopago-oauth-callback`;
      const { error } = await db.from("mercadopago_oauth_estados").insert({
        state_hash: stateHash,
        comercio_id: comercioId,
        user_id: user.id,
        redirect_to: body.redirectTo || null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      if (error) throw error;
      const params = new URLSearchParams({
        client_id: Deno.env.get("MP_CLIENT_ID")!,
        response_type: "code",
        platform_id: "mp",
        redirect_uri: redirectUri,
        state,
      });
      return json({
        url: `https://auth.mercadopago.com.ar/authorization?${params}`,
      });
    }
    if (action === "disconnect") {
      await db.from("mercadopago_credenciales").delete().eq(
        "comercio_id",
        comercioId,
      );
      await db.from("mercadopago_configuraciones").upsert({
        comercio_id: comercioId,
        connected: false,
        mp_user_id: null,
        cuenta_email: null,
        token_expires_at: null,
      }, { onConflict: "comercio_id" });
      return json({ success: true });
    }
    if (action === "save_config") {
      const c = body.config || {},
        payload = {
          comercio_id: comercioId,
          ambiente: c.ambiente === "production" ? "production" : "test",
          checkout_habilitado: Boolean(c.checkout_habilitado),
          qr_habilitado: Boolean(c.qr_habilitado),
          modo_qr: ["dynamic", "static", "hybrid"].includes(c.modo_qr)
            ? c.modo_qr
            : "dynamic",
          confirmar_pedido_automaticamente: Boolean(
            c.confirmar_pedido_automaticamente,
          ),
          convertir_pedido_en_venta: Boolean(c.convertir_pedido_en_venta),
          registrar_en_caja: Boolean(c.registrar_en_caja),
          reservar_stock: Boolean(c.reservar_stock),
          minutos_reserva: Math.min(
            10080,
            Math.max(1, Number(c.minutos_reserva) || 15),
          ),
        };
      const { data, error } = await db.from("mercadopago_configuraciones")
        .upsert(payload, { onConflict: "comercio_id" }).select().single();
      if (error) throw error;
      return json({ config: data });
    }
    const cred = await credential(db, comercioId);
    const { data: config } = await db.from("mercadopago_configuraciones")
      .select("*").eq("comercio_id", comercioId).single();
    if (action === "cancel_qr") {
      const operacionId = String(body.operacionId || "");
      const { data: operacion, error: operacionError } = await db.from(
        "mercadopago_operaciones",
      )
        .select("*,caja:mercadopago_cajas(*)").eq("id", operacionId)
        .eq("comercio_id", comercioId).eq("modalidad", "qr").single();
      if (operacionError) throw operacionError;
      if (!operacion?.caja?.external_pos_id) {
        throw new Error("Cobro QR no encontrado");
      }
      if (operacion.estado === "aprobado") {
        throw new Error("El cobro ya fue aprobado y no puede cancelarse");
      }
      let detalleCancelacion: string | null = null;
      try {
        await mpFetch(
          `/instore/orders/qr/seller/collectors/${cred.mp_user_id}/pos/${
            encodeURIComponent(operacion.caja.external_pos_id)
          }/qrs`,
          cred.access_token,
          { method: "DELETE" },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const normalizedMessage = message.toLowerCase();
        const orderAlreadyUnavailable =
          (normalizedMessage.includes("deleting") &&
            normalizedMessage.includes("instore")) ||
          normalizedMessage.includes("failed to delete order") ||
          normalizedMessage.includes("in_store_order_creation_error");
        if (!orderAlreadyUnavailable) throw error;

        // La API QR heredada devuelve un 500 generico cuando la orden de la caja
        // ya vencio, fue cobrada o dejo de estar disponible. La operacion aprobada
        // queda protegida arriba y por el webhook; cancelar localmente hace que el
        // boton sea idempotente y permite generar el siguiente cobro de la caja.
        detalleCancelacion =
          `Mercado Pago no tenia una orden QR activa: ${message}`;
      }
      const { error: updateError } = await db.from("mercadopago_operaciones")
        .update({ estado: "cancelado", estado_detalle: detalleCancelacion })
        .eq("id", operacion.id);
      if (updateError) throw updateError;
      return json({ success: true });
    }
    if (action === "create_pos") {
      const location = body.location;
      if (
        !location?.street_name || !location?.street_number ||
        !location?.city_name || !location?.state_name ||
        !Number.isFinite(Number(location?.latitude)) ||
        !Number.isFinite(Number(location?.longitude))
      ) {
        throw new Error(
          "La direccion y las coordenadas de la sucursal son obligatorias",
        );
      }
      const stateAliases: Record<string, string> = {
        cordoba: "Córdoba",
        "entre rios": "Entre Ríos",
        neuquen: "Neuquén",
        "rio negro": "Río Negro",
        tucuman: "Tucumán",
        "ciudad autonoma de buenos aires": "Ciudad Autónoma de Buenos Aires",
        caba: "Ciudad Autónoma de Buenos Aires",
      };
      const stateKey = String(location.state_name).normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      location.state_name = stateAliases[stateKey] ||
        String(location.state_name).trim();
      const cityKey = String(location.city_name).normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      if (stateKey === "cordoba" && cityKey === "jovita") {
        location.city_name = "Santa Magdalena";
      } else {
        location.city_name = String(location.city_name).trim();
      }
      const suffix = crypto.randomUUID().slice(0, 8),
        externalStoreId = String(
          body.externalStoreId || `svw${comercioId.slice(0, 8)}${suffix}`,
        ).replace(/[^a-zA-Z0-9]/g, ""),
        storePayload: any = {
          name: String(body.storeName || "Local principal"),
          external_id: externalStoreId,
          location: {
            ...location,
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
          },
        };
      let store: any;
      const locationCandidates = cityKey === "jovita"
        ? ["Jovita", "Santa Magdalena", "General Roca"].flatMap((city) =>
          [
            "Córdoba",
            "Cordoba",
            "Provincia de Córdoba",
            "Córdoba Province",
          ].map((state) => [city, state])
        )
        : [[storePayload.location.city_name, storePayload.location.state_name]];
      let locationError: unknown;
      const rejectedLocations: string[] = [];
      for (const [cityName, stateName] of locationCandidates) {
        storePayload.location.city_name = cityName;
        storePayload.location.state_name = stateName;
        try {
          store = await mpFetch(
            "/users/" + cred.mp_user_id + "/stores",
            cred.access_token,
            { method: "POST", body: JSON.stringify(storePayload) },
          );
          break;
        } catch (error) {
          locationError = error;
          rejectedLocations.push(
            `${cityName}, ${stateName}: ${String((error as Error)?.message)}`,
          );
          if (
            !/city[\s._-]*name|state[\s._-]*name/i.test(
              String((error as Error)?.message),
            )
          ) {
            throw error;
          }
        }
      }
      if (!store) {
        throw new Error(
          `Mercado Pago rechazo la ubicacion. Intentos: ${
            rejectedLocations.join(" / ") ||
            String((locationError as Error)?.message)
          }`,
        );
      }
      const { data: sucursal, error: sucursalError } = await db.from(
        "mercadopago_sucursales",
      ).insert({
        comercio_id: comercioId,
        mp_store_id: String(store.id),
        external_store_id: externalStoreId,
        nombre: storePayload.name,
        direccion: storePayload.location,
      }).select().single();
      if (sucursalError) throw sucursalError;
      const externalPosId = String(
        body.externalPosId || `svw${comercioId.slice(0, 8)}caja${suffix}`,
      ).replace(/[^a-zA-Z0-9]/g, "");
      const pos = await mpFetch("/pos", cred.access_token, {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          name: String(body.posName || "Caja 1"),
          fixed_amount: true,
          store_id: String(store.id),
          external_id: externalPosId,
        }),
      });
      const { data: caja, error: cajaError } = await db.from(
        "mercadopago_cajas",
      ).insert({
        comercio_id: comercioId,
        sucursal_id: sucursal.id,
        mp_pos_id: String(pos.id),
        external_pos_id: externalPosId,
        nombre: String(body.posName || "Caja 1"),
        qr_data: pos.qr?.image || pos.qr?.template_document || null,
      }).select().single();
      if (cajaError) throw cajaError;
      return json({ sucursal, caja });
    }
    if (action === "create_qr") {
      if (!config?.qr_habilitado) {
        throw new Error("El cobro QR no esta habilitado");
      }
      const ventaId = String(body.ventaId || ""),
        cajaId = String(body.cajaId || "");
      const [{ data: venta }, { data: caja }] = await Promise.all([
        db.from("ventas").select(
          "id,comercio_id,total,numero_comprobante,cliente_nombre",
        ).eq("id", ventaId).eq("comercio_id", comercioId).single(),
        db.from("mercadopago_cajas").select("*").eq("id", cajaId).eq(
          "comercio_id",
          comercioId,
        ).eq("activa", true).single(),
      ]);
      if (!venta || !caja) throw new Error("Venta o caja no encontrada");
      const importe = body.importe == null
          ? Number(venta.total)
          : Number(body.importe),
        idempotencyKey = crypto.randomUUID(),
        ref = externalReference(comercioId, "venta", venta.id);
      if (
        !Number.isFinite(importe) || importe <= 0 ||
        importe > Number(venta.total)
      ) {
        throw new Error("El importe del QR no es valido para esta venta");
      }
      const { data: op, error: opError } = await db.from(
        "mercadopago_operaciones",
      ).insert({
        comercio_id: comercioId,
        venta_id: venta.id,
        caja_mp_id: caja.id,
        origen: "venta",
        modalidad: "qr",
        ambiente: config.ambiente,
        external_reference: ref,
        idempotency_key: idempotencyKey,
        importe,
        moneda: "ARS",
        expires_at: new Date(Date.now() + config.minutos_reserva * 60000)
          .toISOString(),
      }).select().single();
      if (opError) throw opError;
      const payload = {
        external_reference: ref,
        title: `Venta ${venta.numero_comprobante}`,
        description: `Venta ${venta.numero_comprobante}`,
        notification_url: `${functionBase}/mercadopago-webhook?op=${op.id}`,
        total_amount: importe,
        items: [{
          sku_number: String(venta.numero_comprobante),
          category: "others",
          title: `Venta ${venta.numero_comprobante}`,
          description: `Cobro de ${venta.cliente_nombre || "Consumidor Final"}`,
          unit_price: importe,
          quantity: 1,
          unit_measure: "unit",
          total_amount: importe,
        }],
      };
      try {
        const order = await mpFetch(
          `/instore/orders/qr/seller/collectors/${cred.mp_user_id}/pos/${
            encodeURIComponent(caja.external_pos_id)
          }/qrs`,
          cred.access_token,
          {
            method: "PUT",
            headers: { "X-Idempotency-Key": idempotencyKey },
            body: JSON.stringify(payload),
          },
        );
        const qrData = caja.qr_data || null;
        await db.from("mercadopago_operaciones").update({
          order_id: order.id || null,
          qr_data: qrData,
          raw_response: order,
        }).eq("id", op.id);
        return json({
          operacion: { ...op, order_id: order.id || null, qr_data: qrData },
        });
      } catch (error) {
        await db.from("mercadopago_operaciones").update({
          estado: "error",
          estado_detalle: String(error),
        }).eq("id", op.id);
        throw error;
      }
    }
    if (action === "create_checkout") {
      if (!config?.checkout_habilitado) {
        throw new Error("Checkout online no habilitado");
      }
      const pedidoId = String(body.pedidoId || "");
      const { data: pedido } = await db.from("pedidos_online").select(
        "*,pedido_online_items(*)",
      ).eq("id", pedidoId).eq("comercio_id", comercioId).eq(
        "cliente_user_id",
        user.id,
      ).single();
      if (!pedido) throw new Error("Pedido no encontrado");
      if (pedido.estado_pago === "aprobado") {
        throw new Error("El pedido ya esta pagado");
      }
      const ref = externalReference(comercioId, "pedido", pedido.id),
        idempotencyKey = crypto.randomUUID();
      const { data: op, error: opError } = await db.from(
        "mercadopago_operaciones",
      ).insert({
        comercio_id: comercioId,
        pedido_online_id: pedido.id,
        origen: "tienda_online",
        modalidad: "checkout_pro",
        ambiente: config.ambiente,
        external_reference: ref,
        idempotency_key: idempotencyKey,
        importe: Number(pedido.total),
        moneda: "ARS",
      }).select().single();
      if (opError) throw opError;
      const origin = String(body.returnOrigin || "").replace(/\/$/, "");
      if (
        !origin.startsWith("https://") && !origin.startsWith("http://localhost")
      ) throw new Error("Origen de retorno invalido");
      const payload = {
        items: pedido.pedido_online_items.map((i: any) => ({
          id: i.producto_id,
          title: i.descripcion,
          quantity: i.cantidad,
          unit_price: Number(i.precio_unitario),
          currency_id: "ARS",
        })),
        payer: { email: pedido.cliente_email, name: pedido.cliente_nombre },
        external_reference: ref,
        back_urls: {
          success: `${origin}/pago/aprobado?pedido=${pedido.id}`,
          pending: `${origin}/pago/pendiente?pedido=${pedido.id}`,
          failure: `${origin}/pago/rechazado?pedido=${pedido.id}`,
        },
        auto_return: "approved",
        notification_url: `${functionBase}/mercadopago-webhook?op=${op.id}`,
        metadata: {
          operacion_id: op.id,
          comercio_id: comercioId,
          pedido_id: pedido.id,
        },
      };
      try {
        const preference = await mpFetch(
            "/checkout/preferences",
            cred.access_token,
            {
              method: "POST",
              headers: { "X-Idempotency-Key": idempotencyKey },
              body: JSON.stringify(payload),
            },
          ),
          checkoutUrl = config.ambiente === "production"
            ? preference.init_point
            : preference.sandbox_init_point;
        await db.from("mercadopago_operaciones").update({
          preference_id: preference.id,
          checkout_url: checkoutUrl,
          raw_response: preference,
        }).eq("id", op.id);
        await db.from("pedidos_online").update({ estado_pago: "pendiente" }).eq(
          "id",
          pedido.id,
        );
        return json({ checkoutUrl, operacionId: op.id });
      } catch (error) {
        await db.from("mercadopago_operaciones").update({
          estado: "error",
          estado_detalle: String(error),
        }).eq("id", op.id);
        throw error;
      }
    }
    if (["sync", "cancel", "refund"].includes(action)) {
      const { data: op } = await db.from("mercadopago_operaciones").select("*")
        .eq("id", body.operacionId).eq("comercio_id", comercioId).single();
      if (!op) throw new Error("Operacion no encontrada");
      if (action === "sync") {
        const remote = await mpFetch(
          op.order_id
            ? `/v1/orders/${op.order_id}`
            : `/v1/payments/${op.payment_id}`,
          cred.access_token,
        );
        return json({ remote });
      }
      if (action === "cancel") {
        if (!op.order_id) throw new Error("Solo se pueden cancelar ordenes QR");
        const remote = await mpFetch(
          `/v1/orders/${op.order_id}/cancel`,
          cred.access_token,
          {
            method: "POST",
            headers: { "X-Idempotency-Key": crypto.randomUUID() },
          },
        );
        await db.from("mercadopago_operaciones").update({
          estado: "cancelado",
          raw_response: remote,
        }).eq("id", op.id);
        return json({ remote });
      }
      if (!op.order_id) {
        throw new Error("La devolucion requiere una order de Mercado Pago");
      }
      const remote = await mpFetch(
        `/v1/orders/${op.order_id}/refund`,
        cred.access_token,
        {
          method: "POST",
          headers: { "X-Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(
            body.amount
              ? {
                transactions: {
                  refunds: [{ amount: Number(body.amount).toFixed(2) }],
                },
              }
              : {},
          ),
        },
      );
      return json({ remote });
    }
    throw new Error("Accion no soportada");
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
