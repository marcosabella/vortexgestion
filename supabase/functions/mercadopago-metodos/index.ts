import {
  adminClient,
  corsHeaders,
  credential,
  json,
  mpFetch,
} from "../mercadopago-checkout/mercadopago-shared.ts";

const visibleMethodIds = new Set([
  "mercadocredito",
  "mercado_credito",
  "visa",
  "amex",
  "master",
  "naranja",
  "debvisa",
  "maestro",
  "cabal",
  "debmaster",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { comercioId } = await req.json() as { comercioId?: string };
    if (!comercioId) throw new Error("Comercio requerido");

    const db = adminClient();
    const { data: config } = await db.from("mercadopago_configuraciones")
      .select("connected, checkout_habilitado")
      .eq("comercio_id", comercioId)
      .maybeSingle();
    if (!config?.connected || !config.checkout_habilitado) return json({ methods: [] });

    const cred = await credential(db, comercioId);
    const methods = await mpFetch("/v1/payment_methods", cred.access_token) as Array<{
      id: string;
      name: string;
      payment_type_id: string;
      status: string;
      secure_thumbnail?: string;
    }>;
    return json({
      methods: methods
        .filter((method) => method.status === "active" && (visibleMethodIds.has(method.id) || method.payment_type_id === "digital_currency") && method.secure_thumbnail)
        .map(({ id, name, payment_type_id, secure_thumbnail }) => ({ id, name, payment_type_id, secure_thumbnail })),
    }, 200, { "Cache-Control": "public, max-age=900" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
