import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};
export const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" },
  });
export const adminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
export async function authenticatedUser(req: Request, db: any) {
  const token = (req.headers.get("Authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) throw new Error("Usuario no autenticado");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Sesion invalida");
  return data.user;
}
export async function assertComercio(
  db: any,
  userId: string,
  comercioId: string,
) {
  const { data, error } = await db.from("comercio_usuarios").select(
    "comercio_id",
  ).eq("user_id", userId).eq("comercio_id", comercioId).eq("activo", true)
    .maybeSingle();
  if (error || !data) throw new Error("No tiene acceso al comercio");
}
export async function credential(db: any, comercioId: string) {
  const { data, error } = await db.from("mercadopago_credenciales").select("*")
    .eq("comercio_id", comercioId).maybeSingle();
  if (error || !data) {
    throw new Error("El comercio no conecto su cuenta de Mercado Pago");
  }
  return data;
}
export async function mpFetch(
  path: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(payload?.cause) && payload.cause.length
      ? ` | ${JSON.stringify(payload.cause)}`
      : "";
    throw new Error(
      `${
        payload?.message || payload?.error ||
        `Mercado Pago respondio ${response.status}`
      }${detail}`,
    );
  }
  return payload;
}
export const externalReference = (
  comercioId: string,
  type: "venta" | "pedido",
  id: string,
) => `svw:${comercioId}:${type}:${id}`;
export async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}
export async function verifySignature(
  req: Request,
  dataId: string,
  secret?: string | null,
) {
  if (!secret) return false;
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(
    signature.split(",").map((part) => part.trim().split("=")),
  );
  if (!parts.ts || !parts.v1 || !requestId) return false;
  const manifest =
    `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  const expected = Array.from(new Uint8Array(signed)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  if (expected.length !== parts.v1.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  }
  return difference === 0;
}
