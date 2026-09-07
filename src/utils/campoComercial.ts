import { z } from "zod";
import type {
  CampoOrdenLaborListItem,
  CampoOrdenLaborLoteListItem,
} from "@/types/campo";

export const monedaCampoSchema = z.enum(["ARS", "USD"], {
  errorMap: () => ({ message: "Elegí ARS o USD." }),
});
export type MonedaCampo = z.infer<typeof monedaCampoSchema>;
export const monedasCampo = monedaCampoSchema.options;
export const monedaCampoLabel: Record<MonedaCampo, string> = {
  ARS: "ARS — Pesos argentinos",
  USD: "USD — Dólares estadounidenses (U$S)",
};
export function esMonedaCampo(value: unknown): value is MonedaCampo {
  return monedaCampoSchema.safeParse(value).success;
}

export const tarifaUnidades = z.enum([
  "ha",
  "hora",
  "km",
  "tonelada",
  "unidad",
  "fijo",
]).options;
export const tarifaNiveles =
  z.enum(["general", "cliente", "establecimiento"]).options;
export const nivelLabel: Record<string, string> = {
  general: "General",
  cliente: "Cliente",
  establecimiento: "Establecimiento",
  manual: "Manual",
};

// Sin coerción: los valores del formulario siguen siendo strings.
export const decimalComercial = z.string().regex(
  /^\d+(?:[.,]\d+)?$/,
  "Usá un número sin signos, con coma o punto decimal.",
)
  .refine(
    (v) => Number.isFinite(Number(v.replace(",", "."))),
    "El número está fuera de rango.",
  );
export const ivaComercial = decimalComercial.refine(
  (v) => Number(v.replace(",", ".")) <= 100,
  "El IVA debe estar entre 0 y 100.",
);
export const numeroComercial = (v: string) =>
  Number(decimalComercial.parse(v).replace(",", "."));
export function esFechaCivil(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dias = [
    31,
    y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= dias[m - 1];
}
export const fechaComercial = (v: string | null) =>
  v && esFechaCivil(v) ? v.split("-").reverse().join("/") : "Sin fecha final";
export const formatoComercial = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
// Código ISO inequívoco y separador inseparable; no convierte monedas.
export const formatoMonetarioCampo = (v: number, moneda: MonedaCampo) =>
  `${moneda}\u00a0${formatoComercial(v)}`;
export const tarifaSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre."),
  codigo_interno: z.string().trim(),
  unidad: z.enum(tarifaUnidades),
  nivel: z.enum(tarifaNiveles),
  cliente_id: z.string(),
  establecimiento_id: z.string(),
  precio_unitario: decimalComercial,
  porcentaje_iva: ivaComercial,
  moneda: monedaCampoSchema,
  vigente_desde: z.string().refine(esFechaCivil, "Ingresá una fecha válida."),
  vigente_hasta: z.string().refine(
    (v) => v === "" || esFechaCivil(v),
    "Ingresá una fecha válida.",
  ),
  observaciones: z.string().trim(),
  activo: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.nivel !== "general" && !v.cliente_id) {
    ctx.addIssue({
      code: "custom",
      path: ["cliente_id"],
      message: "Elegí un cliente autorizado.",
    });
  }
  if (v.nivel === "establecimiento" && !v.establecimiento_id) {
    ctx.addIssue({
      code: "custom",
      path: ["establecimiento_id"],
      message: "Elegí un establecimiento del cliente.",
    });
  }
  if (v.vigente_hasta && v.vigente_hasta < v.vigente_desde) {
    ctx.addIssue({
      code: "custom",
      path: ["vigente_hasta"],
      message: "La fecha final no puede ser anterior a la inicial.",
    });
  }
});
export type TarifaFormValues = z.infer<typeof tarifaSchema>;
export function tarifaPayload(values: TarifaFormValues) {
  const v = tarifaSchema.parse(values);
  return {
    nombre: v.nombre,
    codigo_interno: v.codigo_interno || null,
    unidad: v.unidad,
    nivel: v.nivel,
    cliente_id: v.nivel === "general" ? null : v.cliente_id,
    establecimiento_id: v.nivel === "establecimiento"
      ? v.establecimiento_id
      : null,
    precio_unitario: numeroComercial(v.precio_unitario),
    porcentaje_iva: numeroComercial(v.porcentaje_iva),
    moneda: v.moneda,
    vigente_desde: v.vigente_desde,
    vigente_hasta: v.vigente_hasta || null,
    observaciones: v.observaciones || null,
    activo: v.activo,
  };
}
export function campoComercialError(error: unknown): string {
  const e = typeof error === "object" && error !== null ? error : {};
  const m = "message" in e && typeof e.message === "string" ? e.message : "";
  const code = "code" in e && typeof e.code === "string" ? e.code : "";
  if (m.includes("campo_moneda_manual_invalida")) {
    return "La moneda del precio manual no es válida. Elegí ARS o USD.";
  }
  if (m.includes("campo_labor_facturable_unidad_inmutable")) {
    return "Primero configurá la labor como no facturable para cambiar su unidad.";
  }
  if (m.includes("campo_tarifa_alcance_incompatible")) {
    return "El cliente o establecimiento no es compatible con el alcance comercial. Si cambiás la cabecera, quitá primero los precios facturables de sus labores.";
  }
  if (m.includes("vigencia_superpuesta") || code === "23P01") {
    return "Ya existe una tarifa activa con vigencia superpuesta para ese alcance y unidad.";
  }
  if (code === "23505") {
    return "Ya existe una tarifa con esos datos. Revisá el nombre y el código interno.";
  }
  if (m.includes("fuera_vigencia")) {
    return "La tarifa ya no está vigente. Volvé a consultar la tarifa disponible.";
  }
  if (m.includes("unidad_incompatible")) {
    return "La unidad de la tarifa no coincide con la labor.";
  }
  if (
    m.includes("orden_no_editable") || m.includes("planificacion_congelada")
  ) return "Los precios sólo se pueden configurar con la orden en borrador.";
  if (m.includes("no_disponible") || code === "PGRST116") {
    return "El registro ya no está disponible o no tenés acceso. Actualizá la consulta.";
  }
  if (m.includes("fecha") || m.includes("vigencia")) {
    return "Revisá las fechas de vigencia: la fecha final no puede ser anterior a la inicial.";
  }
  if (
    m.includes("precio_manual_invalido") || m.includes("iva_invalido") ||
    error instanceof z.ZodError
  ) {
    return "Revisá los campos: precio no negativo, IVA entre 0 y 100 y fechas válidas.";
  }
  if (
    code === "42501" ||
    /permission denied|row-level security|auth_requerida|sin_permisos/.test(m)
  ) {
    return "No tenés permisos para realizar esta operación en el comercio activo.";
  }
  if (code === "23514") {
    return "Revisá el alcance, los importes y las fechas de la tarifa.";
  }
  return "No se pudo guardar la configuración comercial. Revisá los datos e intentá nuevamente.";
}

export function importePrevisto(
  labor: CampoOrdenLaborListItem,
  asignaciones: CampoOrdenLaborLoteListItem[],
): { estado: string } | {
  moneda: MonedaCampo;
  neto: number;
  iva: number;
  total: number;
} {
  if (!labor.facturable) return { estado: "Labor no facturable." };
  if (!labor.activo) return { estado: "Labor inactiva: sin importe previsto." };
  if (
    labor.precio_unitario_snapshot === null ||
    labor.porcentaje_iva_snapshot === null ||
    !esMonedaCampo(labor.moneda_snapshot)
  ) return { estado: "Snapshot comercial incompleto." };
  const activas = asignaciones.filter((a) => a.activo);
  if (!activas.length) {
    return {
      estado: "Sin asignaciones activas para calcular el importe previsto.",
    };
  }
  const cantidad = labor.unidad === "fijo"
    ? 1
    : activas.reduce((n, a) => n + a.cantidad_planificada, 0);
  const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const neto = redondear(cantidad * labor.precio_unitario_snapshot);
  const iva = redondear(neto * labor.porcentaje_iva_snapshot / 100);
  const total = redondear(neto + iva);
  if (![neto, iva, total].every(Number.isFinite)) {
    return { estado: "Importe fuera de rango." };
  }
  return { moneda: labor.moneda_snapshot, neto, iva, total };
}
