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
    const { error: deleteError } = await (supabase as any).from("producto_variantes").delete().eq("producto_id", id);
    if (deleteError) throw deleteError;
    if (variantes.length) {
      const { error } = await (supabase as any).from("producto_variantes").insert(variantes.map(({ color_id, talle_id, stock }) => ({ producto_id: id, color_id, talle_id, stock })));
      if (error) throw error;
    }
    await queryClient.invalidateQueries({ queryKey: ["producto-variantes", id] });
    await queryClient.invalidateQueries({ queryKey: ["productos"] });
  };

  return {
    colores: coloresQuery.data || [],
    talles: tallesQuery.data || [],
    asignaciones: asignacionesQuery.data,
    variantes: variantesQuery.data || [],
    crearAtributo: crearAtributo.mutateAsync,
    guardarAsignaciones,
    guardarVariantes,
  };
}
