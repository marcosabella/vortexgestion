import { z } from "zod";

export const BCRA_API = "https://api.bcra.gob.ar";
export const BCRA_FUENTE = "https://www.bcra.gob.ar/apis-banco-central/";
const numero = z.number().finite().nonnegative();
const fecha = z.string().nullable();
const marcas = {
  enRevision: z.boolean().optional(), procesoJud: z.boolean().optional(),
};
export const cotizacionesSchema = z.object({
  fecha, detalle: z.array(z.object({ codigoMoneda: z.string(), descripcion: z.string(), tipoPase: numero, tipoCotizacion: numero })),
});
export const entidadesSchema = z.array(z.object({ codigoEntidad: z.number().int().positive(), denominacion: z.string() }));
const deudaSchema = z.object({
  entidad: z.string(), situacion: z.number().int(), monto: numero,
  diasAtrasoPago: z.number().int().nonnegative().optional(), fechaSit1: fecha.optional(),
  refinanciaciones: z.boolean().optional(), recategorizacionOblig: z.boolean().optional(),
  situacionJuridica: z.boolean().optional(), irrecDisposicionTecnica: z.boolean().optional(), ...marcas,
});
export const deudoresSchema = z.object({
  identificacion: z.union([z.number(), z.string()]), denominacion: z.string(),
  periodos: z.array(z.object({ periodo: z.string(), entidades: z.array(deudaSchema) })),
});
export const rechazadosSchema = z.object({
  identificacion: z.union([z.number(), z.string()]), denominacion: z.string(),
  causales: z.array(z.object({ causal: z.string(), entidades: z.array(z.object({
    entidad: z.number().int(), detalle: z.array(z.object({
      nroCheque: z.union([z.number(), z.string()]), fechaRechazo: fecha, monto: numero,
      fechaPago: fecha, fechaPagoMulta: fecha, estadoMulta: z.string().nullable(),
      ctaPersonal: z.boolean(), denomJuridica: z.string().nullable(), ...marcas,
    })),
  })) })),
});
export const denunciadosSchema = z.object({
  numeroCheque: z.union([z.number(), z.string()]), denunciado: z.boolean(),
  fechaProcesamiento: fecha, denominacionEntidad: z.string(),
  detalles: z.array(z.object({ sucursal: z.union([z.number(), z.string()]), numeroCuenta: z.union([z.number(), z.string()]), causal: z.string() })),
});
export type CotizacionesBcra = z.infer<typeof cotizacionesSchema>;
export type DeudoresBcra = z.infer<typeof deudoresSchema>;
export type RechazadosBcra = z.infer<typeof rechazadosSchema>;
export type DenunciadosBcra = z.infer<typeof denunciadosSchema>;
export type EntidadesBcra = z.infer<typeof entidadesSchema>;
export type ConsultaBcra =
  | { tipo: "cotizaciones"; fecha: string }
  | { tipo: "deudores"; identificacion: string; historico: boolean }
  | { tipo: "cheques-rechazados"; identificacion: string }
  | { tipo: "cheques-denunciados"; entidad: string; cheque: string }
  | { tipo: "entidades" };

export function identificacionBcra(value: string) {
  if (!/^[\d\s-]+$/.test(value)) throw new Error("Ingresá un CUIT, CUIL o CDI de 11 dígitos.");
  const limpio = value.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(limpio)) throw new Error("Ingresá un CUIT, CUIL o CDI de 11 dígitos.");
  return limpio;
}
export function fechaBcra(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00Z`);
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const hoy = ["year", "month", "day"].map(tipo => partes.find(parte => parte.type === tipo)?.value).join("-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value > hoy) throw new Error("Elegí una fecha válida que no sea futura.");
  return value;
}
export function consultaBcraUrl(consulta: ConsultaBcra) {
  switch (consulta.tipo) {
    case "cotizaciones": { const value = fechaBcra(consulta.fecha); return `${BCRA_API}/estadisticascambiarias/v1.0/Cotizaciones${value ? `?fecha=${value}` : ""}`; }
    case "deudores": return `${BCRA_API}/CentralDeDeudores/v1.0/Deudas/${consulta.historico ? "Historicas/" : ""}${identificacionBcra(consulta.identificacion)}`;
    case "cheques-rechazados": return `${BCRA_API}/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/${identificacionBcra(consulta.identificacion)}`;
    case "entidades": return `${BCRA_API}/cheques/v1.0/entidades`;
    case "cheques-denunciados": {
      if (!/^\d{1,10}$/.test(consulta.entidad) || Number(consulta.entidad) < 1 || Number(consulta.entidad) > 2147483647) throw new Error("Seleccioná una entidad bancaria válida.");
      if (!/^\d{1,19}$/.test(consulta.cheque) || BigInt(consulta.cheque) < 1n || BigInt(consulta.cheque) > 9223372036854775807n) throw new Error("Ingresá un número de cheque válido, sin espacios ni guiones.");
      return `${BCRA_API}/cheques/v1.0/denunciados/${Number(consulta.entidad)}/${consulta.cheque}`;
    }
  }
}
export type RespuestaBcra = {
  tipo: ConsultaBcra["tipo"]; consultadoEn: string; sinRegistros: boolean;
  cotizaciones?: CotizacionesBcra; deudores?: DeudoresBcra; rechazados?: RechazadosBcra;
  denunciados?: DenunciadosBcra; entidades?: EntidadesBcra;
};
const envelopeSchema = z.object({ status: z.number().int(), results: z.unknown().optional(), errorMessages: z.array(z.string()).optional() });
export async function consultarBcra(consulta: ConsultaBcra, signal?: AbortSignal): Promise<RespuestaBcra> {
  const url = consultaBcraUrl(consulta);
  const controller = new AbortController();
  const cancelar = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancelar, { once: true });
  if (signal?.aborted) cancelar();
  const timeout = setTimeout(() => controller.abort(new DOMException("Tiempo de espera agotado", "TimeoutError")), 20000);
  try {
    // Información pública oficial. No se envían tokens de Vortex, cookies ni identificadores del comercio.
    const response = await fetch(url, { signal: controller.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
    if (response.status === 429) throw new Error("El BCRA limitó las consultas. Esperá unos minutos antes de volver a intentar.");
    if (response.status >= 500) throw new Error("El servicio del BCRA no está disponible en este momento. Volvé a intentar más tarde.");
    let body: z.infer<typeof envelopeSchema>;
    try { body = envelopeSchema.parse(await response.json()); } catch { throw new Error("El BCRA devolvió una respuesta que no se pudo interpretar."); }
    const base = { tipo: consulta.tipo, consultadoEn: new Date().toISOString(), sinRegistros: false };
    const puedeNoExistir = consulta.tipo === "deudores" || consulta.tipo === "cheques-rechazados";
    if (response.status === 404 && body.status === 404 && puedeNoExistir) return { ...base, sinRegistros: true };
    if (!response.ok || body.status !== 200) throw new Error(body.errorMessages?.join(" ") || "No se pudo realizar la consulta al BCRA.");
    try {
      switch (consulta.tipo) {
        case "cotizaciones": return { ...base, cotizaciones: cotizacionesSchema.parse(body.results) };
        case "deudores": {
          const data = deudoresSchema.parse(body.results);
          if (String(data.identificacion) !== identificacionBcra(consulta.identificacion)) throw new Error("Identificación inesperada.");
          return { ...base, deudores: data };
        }
        case "cheques-rechazados": {
          const data = rechazadosSchema.parse(body.results);
          if (String(data.identificacion) !== identificacionBcra(consulta.identificacion)) throw new Error("Identificación inesperada.");
          return { ...base, rechazados: data };
        }
        case "cheques-denunciados": {
          const data = denunciadosSchema.parse(body.results);
          if (typeof data.numeroCheque === "number" && !Number.isSafeInteger(data.numeroCheque)) throw new Error("Número de cheque impreciso.");
          if (BigInt(data.numeroCheque) !== BigInt(consulta.cheque)) throw new Error("Número de cheque inesperado.");
          return { ...base, denunciados: data };
        }
        case "entidades": return { ...base, entidades: entidadesSchema.parse(body.results) };
      }
    } catch { throw new Error("La respuesta del BCRA cambió de formato. No se muestran datos incompletos."); }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error("El BCRA demoró demasiado en responder. Volvé a intentar.");
    if (error instanceof TypeError) throw new Error("No se pudo conectar con el BCRA. Revisá la conexión y volvé a intentar.");
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancelar); }
}
export const deudaBcraEnPesos = (miles: number) => miles * 1000;
