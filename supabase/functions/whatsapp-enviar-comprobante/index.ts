import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const graphError = async (result: Response) => {
  const payload = await result.json().catch(() => ({}));
  return payload?.error?.message || payload?.message ||
    `WhatsApp respondió ${result.status}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    // Plantilla aprobada por Meta: encabezado Documento + {{1}} nombre + {{2}} comprobante.
    // El secreto permite una futura personalización sin volver a desplegar la función.
    const facturaTemplateName =
      Deno.env.get("WHATSAPP_FACTURA_TEMPLATE_NAME") || "factura_documento";
    const facturaTemplateLanguage =
      Deno.env.get("WHATSAPP_FACTURA_TEMPLATE_LANGUAGE") || "es_AR";
    const jwt = (req.headers.get("Authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!jwt) throw new Error("Usuario no autenticado");
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await db.auth.getUser(jwt);
    if (userError || !userData.user) throw new Error("Sesión inválida");

    const body = await req.json();
    const ventaId = String(body.ventaId || "");
    const comercioId = String(body.comercioId || "");
    const pdfBase64 = String(body.pdfBase64 || "");
    const filename = String(body.filename || "comprobante.pdf").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    if (!ventaId || !comercioId || !pdfBase64) {
      throw new Error("Faltan datos para enviar el comprobante");
    }
    if (pdfBase64.length > 14_000_000) {
      throw new Error("El PDF supera el tamaño permitido para el envío");
    }

    const { data: membership } = await db.from("comercio_usuarios").select(
      "comercio_id",
    ).eq("user_id", userData.user.id).eq("comercio_id", comercioId).eq(
      "activo",
      true,
    ).maybeSingle();
    if (!membership) throw new Error("No tiene acceso a este comercio");
    const { data: credentials, error: credentialsError } = await db
      .from("whatsapp_credenciales")
      .select("access_token, waba_id, phone_number_id")
      .eq("comercio_id", comercioId)
      .maybeSingle();
    if (credentialsError || !credentials) {
      throw new Error(
        "Este comercio todavía no conectó su cuenta de WhatsApp Business",
      );
    }
    const accessToken = credentials.access_token;
    const wabaId = credentials.waba_id;
    const phoneNumberId = credentials.phone_number_id;
    const { data: venta, error: ventaError } = await db.from("ventas").select(
      "id, comercio_id, numero_comprobante, cliente:clientes(nombre, apellido, telefono)",
    ).eq("id", ventaId).eq("comercio_id", comercioId).maybeSingle();
    if (ventaError || !venta) {
      throw new Error("No se encontró el comprobante solicitado");
    }

    const telefono = String((venta as any).cliente?.telefono || "").replace(
      /\D/g,
      "",
    );
    if (!telefono) {
      throw new Error(
        "El cliente no tiene un teléfono registrado para WhatsApp",
      );
    }
    const destinatarioPrueba =
      (Deno.env.get("WHATSAPP_TEST_RECIPIENT_PHONE") || "").replace(/\D/g, "");
    // Durante pruebas Meta admite únicamente el destinatario registrado en su lista.
    // En producción este secreto debe eliminarse para usar el teléfono real del cliente.
    const destinatario = destinatarioPrueba ||
      (telefono.startsWith("549")
        ? telefono
        : telefono.startsWith("54")
        ? `549${telefono.slice(2)}`
        : `549${telefono}`);
    const pdfBytes = Uint8Array.from(
      atob(pdfBase64.replace(/^data:.*;base64,/, "")),
      (char) => char.charCodeAt(0),
    );
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append(
      "file",
      new Blob([pdfBytes], { type: "application/pdf" }),
      filename,
    );

    const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v26.0";
    const baseUrl = `https://graph.facebook.com/${version}/${phoneNumberId}`;
    if (wabaId) {
      const subscription = await fetch(
        `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!subscription.ok) {
        console.error(
          "No se pudo suscribir la WABA al webhook:",
          await graphError(subscription),
        );
      }
    }
    const upload = await fetch(`${baseUrl}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!upload.ok) throw new Error(await graphError(upload));
    const media = await upload.json();
    const cliente = (venta as any).cliente;
    const nombreCliente =
      [cliente?.nombre, cliente?.apellido].filter(Boolean).join(" ") ||
      "Cliente";
    const comprobante = String(
      (venta as any).numero_comprobante || body.caption || "Comprobante",
    );
    const messagePayload = {
      messaging_product: "whatsapp",
      to: destinatario,
      type: "template",
      template: {
        name: facturaTemplateName,
        language: { code: facturaTemplateLanguage },
        components: [
          {
            type: "header",
            parameters: [{
              type: "document",
              document: { id: media.id, filename },
            }],
          },
          {
            type: "body",
            parameters: [{ type: "text", text: nombreCliente }, {
              type: "text",
              text: comprobante,
            }],
          },
        ],
      },
    };
    const send = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    });
    if (!send.ok) throw new Error(await graphError(send));
    const result = await send.json();
    const messageId = result?.messages?.[0]?.id || null;
    if (messageId) {
      const { error: logError } = await db.from("whatsapp_envios").insert({
        comercio_id: comercioId,
        venta_id: ventaId,
        destinatario,
        mensaje_id: messageId,
        tipo: "plantilla_documento",
        estado: "enviado",
      });
      if (logError) {
        console.error(
          "No se pudo registrar el envío de WhatsApp:",
          logError.message,
        );
      }
    }
    return response({ success: true, messageId });
  } catch (error) {
    return response({
      error: error instanceof Error
        ? error.message
        : "No se pudo enviar el comprobante",
    }, 400);
  }
});
