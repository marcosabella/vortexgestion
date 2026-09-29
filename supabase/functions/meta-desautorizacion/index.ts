import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
};

const verifySignedRequest = async (
  signedRequest: string,
  appSecret: string,
) => {
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Solicitud firmada inválida");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(parts[1]),
    ),
  );
  const received = decodeBase64Url(parts[0]);
  if (!constantTimeEqual(expected, received)) throw new Error("Firma inválida");

  const payload = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(parts[1])),
  ) as Record<string, unknown>;
  if (
    payload.algorithm &&
    String(payload.algorithm).toUpperCase() !== "HMAC-SHA256"
  ) {
    throw new Error("Algoritmo de firma inválido");
  }
  const userId =
    typeof payload.user_id === "string" || typeof payload.user_id === "number"
      ? String(payload.user_id)
      : "";
  if (!userId) throw new Error("Meta no informó el usuario desautorizado");
  return userId;
};

const readSignedRequest = async (req: Request) => {
  const contentType = req.headers.get("content-type") || "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const value = (await req.formData()).get("signed_request");
    return typeof value === "string" ? value : "";
  }
  const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
  return typeof payload.signed_request === "string"
    ? payload.signed_request
    : "";
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      return json({ error: "Configuración de Meta incompleta" }, 500);
    }

    const signedRequest = await readSignedRequest(req);
    if (!signedRequest) return json({ error: "Falta signed_request" }, 400);
    let metaUserId: string;
    try {
      metaUserId = await verifySignedRequest(signedRequest, appSecret);
    } catch (error) {
      console.warn(
        "Meta envió una solicitud de desautorización no válida",
        error,
      );
      return json({ error: "Solicitud no autorizada" }, 401);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: credentials, error: lookupError } = await db
      .from("whatsapp_credenciales")
      .select("comercio_id")
      .eq("meta_user_id", metaUserId);
    if (lookupError) throw lookupError;

    const comercioIds = (credentials || []).map((item) =>
      item.comercio_id as string
    ).filter(Boolean);
    if (comercioIds.length === 0) return json({ success: true });

    const { error: deleteError } = await db
      .from("whatsapp_credenciales")
      .delete()
      .eq("meta_user_id", metaUserId);
    if (deleteError) throw deleteError;

    const { error: updateError } = await db
      .from("whatsapp_comercios")
      .update({
        estado: "no_conectado",
        waba_id: null,
        phone_number_id: null,
        numero_telefono: null,
        nombre_visible: null,
        conectado_at: null,
        ultimo_error: "El acceso fue retirado desde Meta",
      })
      .in("comercio_id", comercioIds);
    if (updateError) throw updateError;

    return json({ success: true });
  } catch (error) {
    console.error("No se pudo procesar la desautorización de Meta", error);
    return json({ error: "No se pudo procesar la desautorización" }, 500);
  }
});
