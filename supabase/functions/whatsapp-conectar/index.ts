import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("Usuario no autenticado");
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await db.auth.getUser(jwt);
    if (userError || !userData.user) throw new Error("Sesión inválida");

    const { comercioId, code, wabaId, phoneNumberId } = await req.json();
    if (![comercioId, code, wabaId, phoneNumberId].every((value) => typeof value === "string" && value.trim())) {
      throw new Error("Meta no devolvió los datos necesarios de la cuenta WhatsApp");
    }
    const { data: membership } = await db.from("comercio_usuarios")
      .select("id").eq("comercio_id", comercioId).eq("user_id", userData.user.id).eq("rol", "admin").eq("activo", true).maybeSingle();
    if (!membership) throw new Error("Solo un administrador del comercio puede conectar WhatsApp");

    const appId = Deno.env.get("META_APP_ID") || "1507426614484981";
    const appSecret = Deno.env.get("META_APP_SECRET") || Deno.env.get("WHATSAPP_APP_SECRET");
    if (!appSecret) throw new Error("Falta configurar META_APP_SECRET en VORTEX");
    const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v26.0";
    const tokenResponse = await fetch(`https://graph.facebook.com/${version}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appId, client_secret: appSecret, code }).toString(),
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenPayload?.access_token) throw new Error(tokenPayload?.error?.message || "No se pudo validar la autorización de Meta");
    const accessToken = String(tokenPayload.access_token);
    const profileResponse = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok) throw new Error(profile?.error?.message || "No se pudo leer el número conectado");
    const subscribe = await fetch(`https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!subscribe.ok) {
      const details = await subscribe.json().catch(() => ({}));
      throw new Error(details?.error?.message || "No se pudo suscribir la cuenta al webhook de VORTEX");
    }
    const expiresAt = tokenPayload.expires_in ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString() : null;
    const { error: credentialError } = await db.from("whatsapp_credenciales").upsert({
      comercio_id: comercioId, access_token: accessToken, waba_id: wabaId, phone_number_id: phoneNumberId,
      token_expires_at: expiresAt, scopes: tokenPayload.scope || null,
    }, { onConflict: "comercio_id" });
    if (credentialError) throw credentialError;
    const { error: connectionError } = await db.from("whatsapp_comercios").upsert({
      comercio_id: comercioId, estado: "conectado", waba_id: wabaId, phone_number_id: phoneNumberId,
      numero_telefono: profile.display_phone_number || null, nombre_visible: profile.verified_name || null,
      plantilla_factura_nombre: "factura_documento", plantilla_factura_estado: "pendiente", conectado_at: new Date().toISOString(), ultimo_error: null,
    }, { onConflict: "comercio_id" });
    if (connectionError) throw connectionError;
    return json({ success: true, phoneNumber: profile.display_phone_number || null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo conectar WhatsApp" }, 400);
  }
});
