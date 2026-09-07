import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CampoOrdenDetail, CampoOrdenLaborListItem } from "@/types/campo";
import { requireCampoAdmin, validateCampoScope } from "@/hooks/useCampoTarifas";
import { toast } from "@/hooks/use-toast";
import {
  campoComercialError,
  decimalComercial,
  esMonedaCampo,
  ivaComercial,
  monedaCampoSchema,
  numeroComercial,
} from "@/utils/campoComercial";
import { isCampoUuid } from "@/utils/campo";

export const precioLaborSchema = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("no_facturable") }),
  z.object({ modo: z.literal("tarifa") }),
  z.object({
    modo: z.literal("manual"),
    precio: decimalComercial,
    iva: ivaComercial,
    moneda: monedaCampoSchema,
  }),
]);
export type PrecioLaborValues = z.infer<typeof precioLaborSchema>;
export type PrecioLaborContext = {
  comercioId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  labor: CampoOrdenLaborListItem;
};
function assertContext(c: PrecioLaborContext) {
  if (!c.hasAccess || !c.isAdmin || !isCampoUuid(c.comercioId)) {
    throw new Error("sin_permisos");
  }
  if (
    !isCampoUuid(c.orden.id) || !isCampoUuid(c.labor.id) ||
    c.labor.orden_id !== c.orden.id
  ) throw new Error("campo_labor_no_disponible");
  if (c.orden.estado !== "borrador") throw new Error("campo_orden_no_editable");
}
async function validateLabor(c: PrecioLaborContext) {
  assertContext(c);
  const { data: orden, error } = await supabase.from("campo_ordenes_trabajo")
    .select("id,estado,cliente_id,establecimiento_id")
    .eq("comercio_id", c.comercioId).eq("id", c.orden.id).single();
  if (error) throw error;
  if (orden.estado !== "borrador") throw new Error("campo_orden_no_editable");
  if (
    orden.cliente_id !== c.orden.cliente_id ||
    orden.establecimiento_id !== c.orden.establecimiento_id
  ) throw new Error("campo_tarifa_alcance_incompatible");
  await validateCampoScope(
    c.comercioId,
    orden.cliente_id,
    orden.establecimiento_id,
  );
  const { data: labor, error: laborError } = await supabase.from(
    "campo_orden_labores",
  ).select("id,orden_id,unidad")
    .eq("comercio_id", c.comercioId).eq("orden_id", orden.id).eq(
      "id",
      c.labor.id,
    ).single();
  if (laborError) throw laborError;
  if (labor.unidad !== c.labor.unidad) {
    throw new Error("campo_tarifa_unidad_incompatible");
  }
}
async function resolver(c: PrecioLaborContext) {
  const { data, error } = await supabase.rpc("campo_resolver_tarifa_labor", {
    p_orden_labor_id: c.labor.id,
  });
  if (error) throw error;
  // PostgreSQL puede devolver un registro compuesto nulo: no equivale a una tarifa.
  if (!data || !data.id) return null;
  if (
    data.comercio_id !== c.comercioId || !isCampoUuid(data.id) ||
    data.unidad !== c.labor.unidad || !data.activo ||
    !esMonedaCampo(data.moneda)
  ) throw new Error("campo_tarifa_no_disponible");
  const compatible = data.nivel === "general"
    ? data.cliente_id === null && data.establecimiento_id === null
    : data.nivel === "cliente"
    ? data.cliente_id === c.orden.cliente_id && data.establecimiento_id === null
    : data.nivel === "establecimiento" &&
      data.cliente_id === c.orden.cliente_id &&
      data.establecimiento_id === c.orden.establecimiento_id;
  if (!compatible) throw new Error("campo_tarifa_alcance_incompatible");
  // Lista blanca: los campos de auditoría de la RPC no llegan al componente.
  return {
    id: data.id,
    nombre: data.nombre,
    nivel: data.nivel,
    precio_unitario: data.precio_unitario,
    porcentaje_iva: data.porcentaje_iva,
    unidad: data.unidad,
    vigente_desde: data.vigente_desde,
    vigente_hasta: data.vigente_hasta,
    moneda: data.moneda,
  };
}
export function useResolverCampoTarifa(
  c: PrecioLaborContext,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      "campo",
      c.comercioId,
      "orden",
      c.orden.id,
      "labor",
      c.labor.id,
      "tarifa-vigente",
      c.labor.unidad,
      c.orden.cliente_id,
      c.orden.establecimiento_id,
    ],
    enabled: enabled && c.hasAccess && c.isAdmin &&
      c.orden.estado === "borrador" && c.labor.orden_id === c.orden.id,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      await validateLabor(c);
      return resolver(c);
    },
  });
}
type TarifaResuelta = NonNullable<Awaited<ReturnType<typeof resolver>>>;
export function useConfigurarCampoPrecio(
  c: PrecioLaborContext,
  tarifa: TarifaResuelta | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: PrecioLaborValues) => {
      assertContext(c);
      await requireCampoAdmin(c.comercioId, c.hasAccess && c.isAdmin);
      await validateLabor(c);
      const v = precioLaborSchema.parse(values);
      let args:
        Database["public"]["Functions"]["campo_configurar_precio_labor"][
          "Args"
        ];
      if (v.modo === "no_facturable") {
        args = { p_orden_labor_id: c.labor.id, p_facturable: false };
      } else if (v.modo === "manual") {
        args = {
          p_orden_labor_id: c.labor.id,
          p_facturable: true,
          p_precio_manual: numeroComercial(v.precio),
          p_porcentaje_iva_manual: numeroComercial(v.iva),
          p_moneda_manual: v.moneda,
        };
      } else {
        const actual = await resolver(c);
        if (
          !tarifa || !actual ||
          JSON.stringify(actual) !== JSON.stringify(tarifa)
        ) throw new Error("campo_tarifa_no_disponible");
        args = {
          p_orden_labor_id: c.labor.id,
          p_facturable: true,
          p_tarifa_id: actual.id,
        };
      }
      const { data, error } = await supabase.rpc(
        "campo_configurar_precio_labor",
        args,
      );
      if (error) throw error;
      if (!data || data.id !== c.labor.id) {
        throw new Error("campo_labor_no_disponible");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["campo", c.comercioId, "orden", c.orden.id, "labores"],
        exact: true,
      });
      toast({ title: "Precio de la labor configurado" });
    },
    onError: (error) =>
      toast({
        title: "No se pudo configurar el precio",
        description: campoComercialError(error),
        variant: "destructive",
      }),
  });
}
