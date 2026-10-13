import { z } from "zod";
export const BNA_FUENTE = "https://www.bna.com.ar/Personas";
const schema = z.object({
  fuente: z.literal(BNA_FUENTE), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), consultadoEn: z.string().datetime(),
  detalle: z.array(z.object({ codigoMoneda: z.enum(["USD", "BRL", "EUR"]), descripcion: z.string(), unidades: z.union([z.literal(1),z.literal(100)]), compra: z.number().finite().positive(), venta: z.number().finite().positive() })).length(3),
}).superRefine((data, ctx) => {
  if (new Set(data.detalle.map(item=>item.codigoMoneda)).size !== 3 || data.detalle.some(item=>item.compra>item.venta || item.unidades !== (item.codigoMoneda==="BRL"?100:1))) ctx.addIssue({code:z.ZodIssueCode.custom,message:"Cotizaciones BNA inconsistentes."});
});
export type CotizacionesBna = z.infer<typeof schema>;
export async function consultarBna(signal: AbortSignal): Promise<CotizacionesBna> {
  const response = await fetch("/.netlify/functions/cotizaciones-bna", { signal, credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("No se pudo consultar Banco Nación. Volvé a intentar o consultá su sitio oficial.");
  try { return schema.parse(await response.json()); }
  catch { throw new Error("Banco Nación devolvió una respuesta incompleta. No se muestran cotizaciones."); }
}
