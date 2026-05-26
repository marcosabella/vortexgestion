import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Producto } from "@/types/producto";

export interface ProductoReporte extends Producto {
  unidades_vendidas: number;
  valor_stock_costo: number;
  valor_stock_venta: number;
  ultima_venta?: string;
}

export const useProductosReport = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["productos-report"],
    queryFn: async () => {
      // Obtener productos con sus relaciones
      const { data: productos, error: productosError } = await supabase
        .from("productos")
        .select(`
          *,
          proveedor:proveedores(nombre, apellido, razon_social),
          marca:marcas(nombre),
          rubro:rubros(nombre),
          subrubro:subrubros(nombre)
        `)
        .order("descripcion");

      if (productosError) throw productosError;

      // Obtener ventas por producto
      const { data: ventasData, error: ventasError } = await supabase
        .from("venta_items")
        .select(`
          producto_id,
          cantidad,
          venta:ventas(fecha_venta)
        `);

      if (ventasError) throw ventasError;

      // Procesar datos de ventas
      const ventasPorProducto = new Map<string, { cantidad: number; ultima_venta?: string }>();
      
      ventasData?.forEach((item: any) => {
        if (!item.producto_id) return;

        const existing = ventasPorProducto.get(item.producto_id) || { cantidad: 0 };
        existing.cantidad += item.cantidad;
        
        if (item.venta?.fecha_venta) {
          const fechaVenta = new Date(item.venta.fecha_venta).getTime();
          const fechaExistente = existing.ultima_venta ? new Date(existing.ultima_venta).getTime() : 0;
          
          if (fechaVenta > fechaExistente) {
            existing.ultima_venta = item.venta.fecha_venta;
          }
        }
        
        ventasPorProducto.set(item.producto_id, existing);
      });

      // Combinar datos
      const productosReporte: ProductoReporte[] = productos?.map((producto: Producto) => {
        const ventas = ventasPorProducto.get(producto.id) || { cantidad: 0 };
        const valor_stock_costo = producto.stock * producto.precio_costo;
        const valor_stock_venta = producto.stock * producto.precio_venta;

        return {
          ...producto,
          unidades_vendidas: ventas.cantidad,
          valor_stock_costo,
          valor_stock_venta,
          ultima_venta: ventas.ultima_venta,
        };
      }) || [];

      // Calcular estadísticas
      const totalProductos = productosReporte.length;
      const productosSinStock = productosReporte.filter(p => p.stock === 0).length;
      const productoMasVendido = productosReporte.reduce((max, p) => 
        p.unidades_vendidas > max.unidades_vendidas ? p : max
      , productosReporte[0] || { unidades_vendidas: 0, descripcion: 'N/A' });
      
      const valorTotalStockCosto = productosReporte.reduce((sum, p) => sum + p.valor_stock_costo, 0);
      const valorTotalStockVenta = productosReporte.reduce((sum, p) => sum + p.valor_stock_venta, 0);

      return {
        productos: productosReporte,
        estadisticas: {
          totalProductos,
          productosSinStock,
          productoMasVendido: {
            descripcion: productoMasVendido?.descripcion || 'N/A',
            unidades: productoMasVendido?.unidades_vendidas || 0,
          },
          valorTotalStockCosto,
          valorTotalStockVenta,
        },
      };
    },
  });

  return {
    productos: data?.productos || [],
    estadisticas: data?.estadisticas,
    isLoading,
    error,
  };
};
