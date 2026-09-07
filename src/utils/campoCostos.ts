import { z } from "zod";

export const campoMonedaSchema = z.enum(["ARS", "USD"]);
export const campoDecimalSchema = (positivo = false) => z.string().trim().refine((v) => {
  if (!/^\d+(?:[.,]\d{1,4})?$/.test(v)) return false;
  const [entero, fraccion = ""] = v.replace(",", ".").split(".");
  const n = Number(v.replace(",", "."));
  const normalizado = (entero.replace(/^0+/, "") || "0") + (fraccion ? `.${fraccion}` : "");
  return entero.replace(/^0+/, "").length <= 12 && Number.isFinite(n) &&
    n.toFixed(fraccion.length) === normalizado && (positivo ? n > 0 : n >= 0);
}, positivo ? "Ingresá una cantidad mayor que cero, hasta 12 enteros y 4 decimales." : "Ingresá un costo desde cero, hasta 12 enteros y 4 decimales.");

export const campoCostoFields = {
  costo: z.string().trim().pipe(z.union([z.literal(""), campoDecimalSchema()])),
  moneda_costo: z.union([z.literal(""), campoMonedaSchema]),
};
export type CampoCostoFormValues = { costo: string; moneda_costo: "" | "ARS" | "USD" };
export function validarParCosto(v: CampoCostoFormValues, ctx: z.RefinementCtx) {
  if ((v.costo === "") !== (v.moneda_costo === "")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [v.costo === "" ? "costo" : "moneda_costo"], message: "Completá costo y moneda, o dejá ambos vacíos." });
  }
}
const costoSchema = z.object(campoCostoFields).superRefine(validarParCosto);
export function campoCostoPayload(values: CampoCostoFormValues) {
  const v = costoSchema.parse(values);
  return { costo: v.costo === "" ? null : Number(v.costo.replace(",", ".")), moneda: v.moneda_costo || null };
}
export const campoCostoCatalogoSchema = z.object({
  id: z.string().uuid(), costo: z.number().finite().nonnegative().nullable(), moneda: campoMonedaSchema.nullable(),
}).refine(v => (v.costo === null) === (v.moneda === null));
export type CampoCostoCatalogo = z.infer<typeof campoCostoCatalogoSchema>;
export const campoCostosKey = (c?: string | null, o?: string | null, p?: string | null) =>
  ["campo", c ?? null, "orden", o ?? null, "parte", p ?? null, "costos"] as const;
export const campoCostosCatalogoKey = (c: string | null | undefined, categoria: string) =>
  ["campo", c ?? null, categoria, "costos-admin"] as const;
export const formatoCosto = (valor: number, moneda: string) => `${moneda} ${valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export const campoOtroCostoSchema = z.object({
  concepto: z.string().trim().min(1, "Ingresá un concepto."),
  cantidad: campoDecimalSchema(true),
  costo_unitario: campoDecimalSchema(),
  moneda: campoMonedaSchema,
  observaciones: z.string().trim(),
  activo: z.boolean(),
});
export type CampoOtroCostoValues = z.infer<typeof campoOtroCostoSchema>;

const numero = z.number().finite().nonnegative();
export const campoCostoCategorias = ["operarios", "maquinarias", "insumos", "otros"] as const;
const categoria = z.enum(campoCostoCategorias);
const suma = z.object({
  moneda: campoMonedaSchema, subtotal_conocido: numero,
  total_efectivo_conocido: numero, cantidad_desconocidos: numero.int(),
});
export const campoCostosParteSchema = z.object({
  version: z.literal(1), parte_id: z.string().uuid(), comercio_id: z.string().uuid(), orden_id: z.string().uuid(),
  estado: z.enum(["borrador", "enviado", "rechazado", "confirmado", "anulado", "descartado"]),
  incluido_en_totales_efectivos: z.boolean(),
  detalles: z.array(z.object({
    categoria, id: z.string().uuid(), recurso_id: z.string().uuid().nullable(), concepto: z.string().nullable(),
    cantidad: numero.nullable(), unidad: z.string().nullable(), costo: numero.nullable(), moneda: campoMonedaSchema.nullable(),
    costo_desconocido: z.boolean(), motivos_desconocido: z.array(z.string()), subtotal: numero.nullable(),
  })),
  subtotales: z.array(suma.extend({ categoria, moneda: campoMonedaSchema.nullable() })),
  totales: z.array(suma).length(2).refine(v => new Set(v.map(t => t.moneda)).size === 2),
  cantidad_desconocidos: numero.int(), cantidad_desconocidos_sin_moneda: numero.int(),
}).refine(v => v.incluido_en_totales_efectivos === (v.estado === "confirmado") &&
  [...v.totales, ...v.subtotales].every(t => t.total_efectivo_conocido === (v.estado === "confirmado" ? t.subtotal_conocido : 0)));
