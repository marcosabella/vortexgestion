import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Producto } from "@/types/producto";
import { useToast } from "@/hooks/use-toast";

type ProductoInsert = Database["public"]["Tables"]["productos"]["Insert"];
type ProductoUpdate = Database["public"]["Tables"]["productos"]["Update"];
type ProductoMutationPayload = Partial<Producto> & {
  proveedor?: unknown;
  marca?: unknown;
  rubro?: unknown;
  subrubro?: unknown;
};

const normalizeProductoPayload = <T extends ProductoInsert | ProductoUpdate>(producto: T) => {
  const normalized = { ...producto } as Record<string, unknown>;
  const uuidFields = ["proveedor_id", "marca_id", "rubro_id", "subrubro_id", "comercio_id"];

  uuidFields.forEach((field) => {
    if (normalized[field] === "") {
      normalized[field] = null;
    }
  });

  return normalized as T;
};

export const useProductos = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: productos = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos")
        .select(`
          *,
          proveedor:proveedores(nombre, apellido, razon_social),
          marca:marcas(nombre),
          rubro:rubros(nombre),
          subrubro:subrubros(nombre)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Producto[];
    },
  });

  const createProductoMutation = useMutation({
    mutationFn: async (producto: ProductoMutationPayload) => {
      const {
        precio_venta: _precioVenta,
        proveedor: _proveedor,
        marca: _marca,
        rubro: _rubro,
        subrubro: _subrubro,
        created_at: _createdAt,
        updated_at: _updatedAt,
        id: _id,
        ...cleanProducto
      } = producto;
      const payload = normalizeProductoPayload(cleanProducto as ProductoInsert);

      const { data, error } = await supabase
        .from("productos")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      toast({
        title: "Éxito",
        description: "Producto creado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al crear producto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateProductoMutation = useMutation({
    mutationFn: async ({ id, ...producto }: Partial<Producto> & { id: string }) => {
      // Excluir campos relacionados y calculados que no existen en la tabla
      const {
        proveedor: _proveedor,
        marca: _marca,
        rubro: _rubro,
        subrubro: _subrubro,
        precio_venta: _precioVenta,
        created_at: _createdAt,
        updated_at: _updatedAt,
        ...cleanProducto
      } = producto as ProductoMutationPayload;
      const payload = normalizeProductoPayload(cleanProducto as ProductoUpdate);

      const { data, error } = await supabase
        .from("productos")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      toast({
        title: "Éxito",
        description: "Producto actualizado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar producto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteProductoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("productos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      toast({
        title: "Éxito",
        description: "Producto eliminado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar producto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    productos,
    isLoading,
    error,
    createProducto: createProductoMutation.mutate,
    updateProducto: updateProductoMutation.mutate,
    deleteProducto: deleteProductoMutation.mutate,
    isCreating: createProductoMutation.isPending,
    isUpdating: updateProductoMutation.isPending,
    isDeleting: deleteProductoMutation.isPending,
  };
};
