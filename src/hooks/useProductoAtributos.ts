import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AtributoProducto = { id: string; nombre: string };
export type ProductoVariante = { id?: string; color_id: string | null; talle_id: string | null; stock: number };

type Params = {
  productoId?: string;
  comercioId?: string;
  enabled: boolean;
};

/** Catálogos de talles y colores por comercio, y sus asignaciones al producto. */
export function useProductoAtributos({ productoId, comercioId, enabled }: Params) {
  const queryClient = useQueryClient();
  const queryKey = ["producto-atributos", comercioId, productoId];

  const coloresQuery = useQuery({
    queryKey: ["producto-colores", comercioId],
    enabled: enabled && Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("producto_colores").select("id, nombre").eq("comercio_id", comercioId).order("nombre");
      if (error) throw error;
      return (data || []) as AtributoProducto[];
    },
  });

  const tallesQuery = useQuery({
    queryKey: ["producto-talles", comercioId],
    enabled: enabled && Boolean(comercioId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("producto_talles").select("id, nombre").eq("comercio_id", comercioId).order("nombre");
      if (error) throw error;
      return (data || []) as AtributoProducto[];
    },
  });

  const asignacionesQuery = useQuery({
    queryKey,
    enabled: enabled && Boolean(productoId),
    queryFn: async () => {
      const [colores, talles] = await Promise.all([
        (supabase as any).from("producto_colores_asignados").select("color_id, producto_colores(id, nombre)").eq("producto_id", productoId),
        (supabase as any).from("producto_talles_asignados").select("talle_id, producto_talles(id, nombre)").eq("producto_id", productoId),
      ]);
      if (colores.error) throw colores.error;
      if (talles.error) throw talles.error;
      return {
        colores: (colores.data || []).map((item: any) => item.producto_colores).filter(Boolean) as AtributoProducto[],
        talles: (talles.data || []).map((item: any) => item.producto_talles).filter(Boolean) as AtributoProducto[],
      };
    },
  });

  const variantesQuery = useQuery({
    queryKey: ["producto-variantes", productoId],
    enabled: enabled && Boolean(productoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("producto_variantes").select("id, color_id, talle_id, stock").eq("producto_id", productoId);
      if (error) throw error;
      return (data || []) as ProductoVariante[];
    },
  });

  const crearAtributo = useMutation({
    mutationFn: async ({ tabla, nombre }: { tabla: "producto_colores" | "producto_talles"; nombre: string }) => {
      if (!comercioId) throw new Error("No se identificó el comercio.");
      const limpio = nombre.trim();
      if (!limpio) throw new Error("Ingrese un nombre.");
      const { data, error } = await (supabase as any).from(tabla).insert({ comercio_id: comercioId, nombre: limpio }).select("id, nombre").single();
      if (error) throw error;
      return data as AtributoProducto;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [variables.tabla === "producto_colores" ? "producto-colores" : "producto-talles", comercioId] });
    },
  });

  const guardarAsignaciones = async (id: string, colorIds: string[], talleIds: string[]) => {
    const [deleteColors, deleteSizes] = await Promise.all([
      (supabase as any).from("producto_colores_asignados").delete().eq("producto_id", id),
      (supabase as any).from("producto_talles_asignados").delete().eq("producto_id", id),
    ]);
    if (deleteColors.error) throw deleteColors.error;
    if (deleteSizes.error) throw deleteSizes.error;

    const [insertColors, insertSizes] = await Promise.all([
      colorIds.length ? (supabase as any).from("producto_colores_asignados").insert(colorIds.map((color_id) => ({ producto_id: id, color_id }))) : Promise.resolve({ error: null }),
      talleIds.length ? (supabase as any).from("producto_talles_asignados").insert(talleIds.map((talle_id) => ({ producto_id: id, talle_id }))) : Promise.resolve({ error: null }),
    ]);
    if (insertColors.error) throw insertColors.error;
    if (insertSizes.error) throw insertSizes.error;
    await queryClient.invalidateQueries({ queryKey: ["producto-atributos", comercioId, id] });
  };

  const guardarVariantes = async (id: string, variantes: ProductoVariante[]) => {
    // Las ventas y pedidos referencian estos IDs: conservarlos al editar el producto.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: loadError } = await (supabase as any).from("producto_variantes")
      .select("id, color_id, talle_id, stock").eq("producto_id", id);
    if (loadError) throw loadError;
    const actuales = (data || []) as ProductoVariante[];
    const combinacion = (variante: ProductoVariante) => JSON.stringify([variante.color_id, variante.talle_id]);
    const actualesPorCombinacion = new Map(actuales.map((variante) => [combinacion(variante), variante]));
    const seleccionadas = new Set(variantes.map(combinacion));
    const eliminadas = actuales.filter((variante) => !seleccionadas.has(combinacion(variante)));

    if (eliminadas.length) {
      // Un único DELETE: si alguna tiene movimientos, la FK impide quitar todo el grupo.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("producto_variantes").delete()
        .eq("producto_id", id).in("id", eliminadas.map((variante) => variante.id));
      if (error?.code === "23503") {
        throw new Error("No se puede quitar un talle o color con ventas o pedidos asociados. Conservá esa variante para mantener su historial.");
      }
      if (error) throw error;
    }

    for (const variante of variantes) {
      const actual = actualesPorCombinacion.get(combinacion(variante));
      if (!actual || Number(actual.stock) === Number(variante.stock)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("producto_variantes")
        .update({ stock: variante.stock }).eq("producto_id", id).eq("id", actual.id);
      if (error) throw error;
    }

    const nuevas = variantes.filter((variante) => !actualesPorCombinacion.has(combinacion(variante)));
    if (nuevas.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("producto_variantes")
        .insert(nuevas.map(({ color_id, talle_id, stock }) => ({ producto_id: id, color_id, talle_id, stock })));
      if (error) throw error;
    }
    await queryClient.invalidateQueries({ queryKey: ["producto-variantes", id] });
    await queryClient.invalidateQueries({ queryKey: ["productos"] });
  };

  return {
    colores: coloresQuery.data || [],
    talles: tallesQuery.data || [],
    asignaciones: asignacionesQuery.data,
    variantes: variantesQuery.data,
    errorCarga: asignacionesQuery.error || variantesQuery.error,
    crearAtributo: crearAtributo.mutateAsync,
    guardarAsignaciones,
    guardarVariantes,
  };
}
