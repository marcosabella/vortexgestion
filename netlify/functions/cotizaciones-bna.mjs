import { consultarBilletesBna } from "./lib/bna.mjs";
export default async function handler(request) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: { ...headers, Allow: "GET", "Cache-Control": "no-store" } });
  if (new URL(request.url).search) return new Response(JSON.stringify({ error: "Esta consulta muestra la última cotización de billetes BNA." }), { status: 400, headers: { ...headers, "Cache-Control": "no-store" } });
  try {
    return new Response(JSON.stringify(await consultarBilletesBna()), { headers: { ...headers, "Cache-Control": "public, max-age=60, s-maxage=120" } });
  } catch {
    return new Response(JSON.stringify({ error: "No se pudo obtener la cotización de billetes del Banco Nación. Volvé a intentar o consultá su sitio oficial." }), { status: 502, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
