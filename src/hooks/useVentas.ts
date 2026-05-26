import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Venta, VentaItem } from "@/types/venta";
import { useToast } from "@/hooks/use-toast";

export const useVentas = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: ventas = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ventas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas")
        .select(`
          *,
          cliente:clientes(nombre, apellido, telefono),
          banco:bancos(nombre_banco, numero_cuenta),
          tarjeta:tarjetas_credito(nombre),
          venta_items(
            *,
            producto:productos(cod_producto, descripcion, precio_venta, porcentaje_iva)
          ),
          pagos_venta(
            *,
            banco:bancos(nombre_banco),
            tarjeta:tarjetas_credito(nombre),
            cheque:cheques(numero_cheque, monto, banco_emisor)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as any[];
    },
  });

  const createVentaMutation = useMutation({
    mutationFn: async ({ venta, items, pagos = [] }: { venta: Omit<Venta, "id" | "created_at" | "updated_at">; items: Omit<VentaItem, "id" | "venta_id" | "created_at" | "updated_at">[]; pagos?: any[] }) => {
      const { data: ventaData, error: ventaError } = await supabase
        .from("ventas")
        .insert([venta])
        .select()
        .single();

      if (ventaError) throw ventaError;

      if (items.length > 0) {
        const itemsWithVentaId = items.map(item => ({
          ...item,
          venta_id: ventaData.id
        }));

        const { error: itemsError } = await supabase
          .from("venta_items")
          .insert(itemsWithVentaId);

        if (itemsError) throw itemsError;
      }

      // Insertar pagos
      if (pagos.length > 0) {
        const pagosConVentaId = pagos.map(pago => ({
          ...pago,
          venta_id: ventaData.id
        }));

        const { error: pagosError } = await supabase
          .from("pagos_venta")
          .insert(pagosConVentaId);

        if (pagosError) throw pagosError;

        // Check if any payment is "cta_cte" and create debit movements
        const pagosCuentaCorriente = pagos.filter(pago => pago.tipo_pago === 'cta_cte');

        if (pagosCuentaCorriente.length > 0 && venta.cliente_id) {
          const movimientos = pagosCuentaCorriente.map(pago => ({
            cliente_id: venta.cliente_id,
            tipo_movimiento: 'debito',
            monto: pago.monto,
            concepto: 'pago_cuenta_corriente',
            venta_id: ventaData.id,
            fecha_movimiento: venta.fecha_venta,
          }));

          const { error: cuentaError } = await supabase
            .from("cuenta_corriente")
            .insert(movimientos);

          if (cuentaError) throw cuentaError;
        }
      }

      return ventaData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas"] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["productos-report"] });
      toast({
        title: "Éxito",
        description: "Venta registrada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al registrar venta: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateVentaMutation = useMutation({
    mutationFn: async ({ 
      ventaId, 
      venta, 
      items,
      pagos = []
    }: { 
      ventaId: string; 
      venta: Omit<Venta, "id" | "created_at" | "updated_at">; 
      items: Omit<VentaItem, "id" | "venta_id" | "created_at" | "updated_at">[]; 
      pagos?: any[]
    }) => {
      // First, delete any existing cuenta corriente movements for this sale
      const { error: deleteCuentaError } = await supabase
        .from("cuenta_corriente")
        .delete()
        .eq("venta_id", ventaId);

      if (deleteCuentaError) throw deleteCuentaError;

      // Update venta
      const { data: ventaData, error: ventaError } = await supabase
        .from("ventas")
        .update(venta)
        .eq("id", ventaId)
        .select()
        .single();

      if (ventaError) throw ventaError;

      // Delete existing items
      const { error: deleteError } = await supabase
        .from("venta_items")
        .delete()
        .eq("venta_id", ventaId);

      if (deleteError) throw deleteError;

      // Insert new items
      if (items.length > 0) {
        const itemsWithVentaId = items.map(item => ({
          ...item,
          venta_id: ventaId
        }));

        const { error: itemsError } = await supabase
          .from("venta_items")
          .insert(itemsWithVentaId);

        if (itemsError) throw itemsError;
      }

      // Delete existing pagos
      await supabase
        .from("pagos_venta")
        .delete()
        .eq("venta_id", ventaId);

      // Insert new pagos
      if (pagos.length > 0) {
        const pagosConVentaId = pagos.map(pago => ({
          ...pago,
          venta_id: ventaId
        }));

        const { error: pagosError } = await supabase
          .from("pagos_venta")
          .insert(pagosConVentaId);

        if (pagosError) throw pagosError;

        // Check if any payment is "cta_cte" and create debit movements
        const pagosCuentaCorriente = pagos.filter(pago => pago.tipo_pago === 'cta_cte');

        if (pagosCuentaCorriente.length > 0 && venta.cliente_id) {
          const movimientos = pagosCuentaCorriente.map(pago => ({
            cliente_id: venta.cliente_id,
            tipo_movimiento: 'debito',
            monto: pago.monto,
            concepto: 'pago_cuenta_corriente',
            venta_id: ventaId,
            fecha_movimiento: venta.fecha_venta,
          }));

          const { error: cuentaError } = await supabase
            .from("cuenta_corriente")
            .insert(movimientos);

          if (cuentaError) throw cuentaError;
        }
      }

      return ventaData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas"] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["productos-report"] });
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      toast({
        title: "Éxito",
        description: "Venta actualizada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar venta: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteVentaMutation = useMutation({
    mutationFn: async (id: string) => {
      // First delete related cuenta corriente movements
      const { error: cuentaError } = await supabase
        .from("cuenta_corriente")
        .delete()
        .eq("venta_id", id);
      
      if (cuentaError) throw cuentaError;

      // Delete related cash movements so the sale does not become a manual movement
      const { error: cajaError } = await (supabase as any)
        .from("caja_movimientos")
        .delete()
        .eq("venta_id", id);

      if (cajaError) throw cajaError;

      // Then delete the sale
      const { error } = await supabase.from("ventas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas"] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["productos-report"] });
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      toast({
        title: "Éxito",
        description: "Venta eliminada correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar venta: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    ventas,
    isLoading,
    error,
    createVenta: createVentaMutation.mutate,
    updateVenta: updateVentaMutation.mutate,
    deleteVenta: deleteVentaMutation.mutate,
    isCreating: createVentaMutation.isPending,
    isUpdating: updateVentaMutation.isPending,
    isDeleting: deleteVentaMutation.isPending,
  };
};

export const useObtenerCAE = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ventaId: string) => {
      console.log('Solicitando CAE para venta:', ventaId);
      
      const { data, error } = await supabase.functions.invoke('obtener-cae-afip', {
        body: { ventaId },
      });

      if (error) {
        console.error('Error al invocar función:', error);
        throw new Error(error.message || 'Error al obtener CAE');
      }

      if (!data.success) {
        console.error('Error en respuesta:', data.error);
        throw new Error(data.error || 'Error al obtener CAE');
      }

      console.log('CAE obtenido exitosamente:', data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      toast({
        title: "CAE obtenido",
        description: data.mensaje || `CAE: ${data.cae}`,
      });
    },
    onError: (error: Error) => {
      console.error('Error en mutación:', error);
      toast({
        title: "Error al obtener CAE",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
