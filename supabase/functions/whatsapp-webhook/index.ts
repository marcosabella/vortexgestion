import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const verifyToken = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "";
const appSecret = Deno.env.get("WHATSAPP_APP_SECRET") || "";

const verifySignature = async (payload: string, signature: string | null) => {
  if (!appSecret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const received = signature.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    return mode === "subscribe" && token === verifyToken && challenge
      ? new Response(challenge, { status: 200 })
      : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawPayload = await req.text();
  if (!(await verifySignature(rawPayload, req.headers.get("x-hub-signature-256")))) return new Response("Invalid signature", { status: 401 });
  try {
    const payload = JSON.parse(rawPayload);
    const statuses = (payload?.entry || []).flatMap((entry: any) => (entry?.changes || []).flatMap((change: any) => change?.value?.statuses || []));
    if (!statuses.length) return new Response("EVENT_RECEIVED", { status: 200 });
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    await Promise.all(statuses.map(async (status: any) => {
      const estado = status?.status === "delivered" ? "entregado" : status?.status === "read" ? "leido" : status?.status === "failed" ? "fallido" : "enviado";
      const timestamp = status?.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
      const errorDetalle = status?.errors?.map((error: any) => error?.title || error?.message || error?.code).filter(Boolean).join(" | ") || null;
      const update: Record<string, unknown> = { estado, error_detalle: errorDetalle };
      if (estado === "entregado") update.entregado_at = timestamp;
      if (estado === "leido") update.leido_at = timestamp;
      await db.from("whatsapp_envios").update(update).eq("mensaje_id", status?.id);
    }));
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("Error procesando webhook de WhatsApp:", error);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
});
