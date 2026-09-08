import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { PagoVenta, Venta, VentaItem } from "@/types/venta";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

type VentaNueva = Omit<Venta, "id" | "created_at" | "updated_at">;
type VentaItemNuevo = Omit<VentaItem, "id" | "venta_id" | "created_at" | "updated_at">;
type PagoVentaNuevo = Omit<PagoVenta, "id" | "venta_id" | "created_at" | "updated_at">;

type CrearVentaPayload = {
  venta: VentaNueva;
  items: VentaItemNuevo[];
  pagos?: PagoVentaNuevo[];
  idempotencyKey: string;
  mercadoPago?: boolean;
};

const getRpcErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("ventas_numeracion_no_disponible")) {
    return "No se pudo asignar un número de comprobante. Intente nuevamente.";
  }
  if (message.includes("ventas_idempotency_conflicto")) {
    return "Este intento de venta ya fue procesado con datos diferentes. Inicie una venta nueva.";
  }
  if (message.includes("Stock insuficiente")) {
    return "Stock insuficiente para el producto seleccionado.";
  }
  if (message.includes("ventas_pago_") || message.includes("ventas_pagos_no_coinciden")) {
    return "Los pagos informados no son válidos o no coinciden con el total calculado.";
  }
  if (
    message.includes("ventas_no_disponible") ||
    message.includes("ventas_auth_requerida") ||
    message.includes("ventas_cliente_no_disponible") ||
    message.includes("ventas_producto_no_disponible")
  ) {
    return "No tiene permisos para registrar esta venta o para usar los datos seleccionados.";
  }

  return message || "No se pudo registrar la venta.";
};

const assertVentaSinCAE = async (ventaId: string) => {
  const { data, error } = await supabase
    .from("ventas")
    .select("cae")
    .eq("id", ventaId)
    .single();

  if (error) throw error;

  if (data.cae?.trim()) {
    throw new Error("La venta tiene CAE y no puede editarse ni eliminarse");
  }
};

export const useVentas = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { comercio } = useComercio();

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
          cliente:clientes(nombre, apellido, cuit, calle, numero, codigo_postal, localidad, provincia, telefono, situacion_afip, tipo_persona),
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
        .order("fecha_venta", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as any[];
    },
  });

  const createVentaMutation = useMutation({
    mutationFn: async ({ venta, items, pagos = [], idempotencyKey, mercadoPago = false }: CrearVentaPayload) => {
      // Mercado Pago conserva su alta previa: la venta se crea antes de solicitar
      // el QR y ese flujo no forma parte de la RPC transaccional normal.
      if (mercadoPago) {
        const { data: ventaData, error: ventaError } = await supabase
          .from("ventas")
          .insert([venta])
          .select()
          .single();

        if (ventaError) throw ventaError;

        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from("venta_items")
            .insert(items.map((item) => ({ ...item, venta_id: ventaData.id })));

          if (itemsError) throw itemsError;
        }

        if (pagos.length > 0) {
          const { error: pagosError } = await supabase
            .from("pagos_venta")
            .insert(pagos.map((pago) => ({ ...pago, venta_id: ventaData.id })));

          if (pagosError) throw pagosError;

          const pagosCuentaCorriente = pagos.filter((pago) => pago.tipo_pago === "cta_cte");
          if (pagosCuentaCorriente.length > 0 && venta.cliente_id) {
            const { error: cuentaError } = await supabase
              .from("cuenta_corriente")
              .insert(pagosCuentaCorriente.map((pago) => ({
                cliente_id: venta.cliente_id,
                tipo_movimiento: "debito",
                monto: pago.monto,
                concepto: "pago_cuenta_corriente",
                venta_id: ventaData.id,
                fecha_movimiento: venta.fecha_venta,
              })));

            if (cuentaError) throw cuentaError;
          }
        }

        return ventaData;
      }

      if (!comercio?.id) throw new Error("Seleccione un comercio antes de registrar la venta.");

      const pagosCuentaCorriente = pagos.filter((pago) => pago.tipo_pago === "cta_cte");
      const esCuentaCorriente = pagosCuentaCorriente.length > 0;
      if (esCuentaCorriente && pagosCuentaCorriente.length !== pagos.length) {
        throw new Error("La cuenta corriente no puede combinarse con otros medios de pago.");
      }

      const rpcItems: Json = items.map((item) => {
        const productoId = item.producto_id || undefined;
        const descripcionManual = item.descripcion_manual?.trim();

        if (!productoId && !descripcionManual) {
          throw new Error("Cada ítem manual debe incluir una descripción.");
        }

        return {
          ...(productoId ? { producto_id: productoId } : { descripcion_manual: descripcionManual }),
          ...(item.codigo_manual?.trim() ? { codigo_manual: item.codigo_manual.trim() } : {}),
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
          porcentaje_iva: Number(item.porcentaje_iva),
          porcentaje_descuento: Number(item.porcentaje_descuento || 0),
          monto_descuento: Number(item.monto_descuento || 0),
          porcentaje_recargo: Number(item.porcentaje_recargo || 0),
          monto_recargo: Number(item.monto_recargo || 0),
          afecta_stock: Boolean(productoId),
        };
      });

      const rpcPagos: Json = esCuentaCorriente
        ? []
        : pagos.map((pago) => ({
            tipo_pago: pago.tipo_pago,
            monto: Number(pago.monto),
            ...(pago.banco_id ? { banco_id: pago.banco_id } : {}),
            ...(pago.tarjeta_id ? { tarjeta_id: pago.tarjeta_id } : {}),
            ...(pago.cuotas ? { cuotas: Number(pago.cuotas) } : {}),
            ...(pago.recargo_cuotas ? { recargo_cuotas: Number(pago.recargo_cuotas) } : {}),
            ...(pago.cheque_id ? { cheque_id: pago.cheque_id } : {}),
          }));

      const { data: ventaData, error: ventaError } = await supabase.rpc("registrar_venta_transaccional", {
        p_comercio_id: comercio.id,
        p_tipo_comprobante: venta.tipo_comprobante,
        p_punto_venta: 1,
        p_cliente_id: venta.cliente_id || null,
        p_cliente_nombre: venta.cliente_nombre,
        p_moneda: "ARS",
        p_modalidad: esCuentaCorriente ? "cta_cte" : "contado",
        p_items: rpcItems,
        p_pagos: rpcPagos,
        p_idempotency_key: idempotencyKey,
        p_fecha_venta: venta.fecha_venta,
        p_observaciones: venta.observaciones || null,
        p_porcentaje_descuento: Number(venta.porcentaje_descuento || 0),
        p_monto_descuento: Number(venta.monto_descuento || 0),
        p_porcentaje_recargo: Number(venta.porcentaje_recargo || 0),
        p_monto_recargo: Number(venta.monto_recargo || 0),
      });

      if (ventaError) throw new Error(getRpcErrorMessage(ventaError));
      if (!ventaData) throw new Error("La venta no devolvió una confirmación.");

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
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Error al registrar venta: ${getRpcErrorMessage(error)}`,
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
      await assertVentaSinCAE(ventaId);

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
      const { error: deletePagosError } = await supabase
        .from("pagos_venta")
        .delete()
        .eq("venta_id", ventaId);

      if (deletePagosError) throw deletePagosError;

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
      await assertVentaSinCAE(id);

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

      // Las operaciones QR pertenecen a la venta. Deben eliminarse antes porque
      // su restriccion exige conservar una venta o un pedido asociado.
      const { error: mercadoPagoError } = await (supabase as any)
        .from("mercadopago_operaciones")
        .delete()
        .eq("venta_id", id);

      if (mercadoPagoError) throw mercadoPagoError;

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
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
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
    createVentaAsync: createVentaMutation.mutateAsync,
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
        let errorMessage = error.message || 'Error al obtener CAE';
        const context = (error as any).context;

        if (context && typeof context.json === "function") {
          try {
            const errorBody = await context.json();
            errorMessage = errorBody?.error || errorMessage;
          } catch (parseError) {
            console.error("No se pudo leer el detalle del error CAE:", parseError);
          }
        }

        throw new Error(errorMessage);
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
        description: data.numero_comprobante
          ? `${data.mensaje || "CAE obtenido"} - Comprobante ${data.numero_comprobante}`
          : data.mensaje || `CAE: ${data.cae}`,
      });
    },
    onError: (error: Error) => {
      console.error('Error en mutación:', error);
      toast({
        title: "Error al obtener CAE",
        description: error.message || "No se pudo obtener el CAE. Revise la configuracion ARCA y vuelva a intentar.",
        variant: "destructive",
      });
    },
  });
};
