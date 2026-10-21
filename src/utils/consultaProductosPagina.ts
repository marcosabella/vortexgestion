import { supabase } from "@/integrations/supabase/client";
import type { Producto } from "@/types/producto";

export async function consultaProductosPagina({ comercioId, search, page, pageSize, signal, totalConocido }: {
  comercioId: string; search: string; page: number; pageSize: number; signal?: AbortSignal; totalConocido?: number;
}) {
  // Los alias vacíos permiten buscar relaciones sin ocultar los datos de la fila.
  const term = search.trim();
  const relations = `proveedor:proveedores(nombre, apellido, razon_social),
    marca:marcas(nombre)`;
  let query = supabase.from("productos")
    .select(`*, ${relations}${term ? ", marca_busqueda:marcas(), proveedor_busqueda:proveedores()" : ""}`, totalConocido === undefined ? { count: "exact" } : {})
    .eq("comercio_id", comercioId);

  if (term) {
    // Citar el patrón evita que comas o paréntesis alteren la expresión OR.
    const pattern = `%${term.replace(/[\\%_*]/g, "\\$&")}%`;
    const literal = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    query = query.ilike("marca_busqueda.nombre", pattern)
      .or(`nombre.ilike.${literal},apellido.ilike.${literal},razon_social.ilike.${literal}`, { referencedTable: "proveedor_busqueda" })
      .or(`descripcion.ilike.${literal},cod_producto.ilike.${literal},cod_barras.ilike.${literal},marca_busqueda.not.is.null,proveedor_busqueda.not.is.null`);
  }

  const first = (page - 1) * pageSize;
  query = query.order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(first, first + pageSize - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  const productos = (data || []) as unknown as Producto[];
  // Un borrado concurrente puede dejar incompleta una página cuyo total estaba en caché.
  if (totalConocido !== undefined && productos.length < Math.min(pageSize, Math.max(0, totalConocido - first))) {
    return consultaProductosPagina({ comercioId, search, page, pageSize, signal });
  }
  const total = count ?? totalConocido;
  if (total === undefined) throw new Error("No se pudo obtener el total de productos.");
  return { productos, total };
}
