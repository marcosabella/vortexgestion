import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import type { Compra } from "@/types/compra";

type Db = {
  from: (
    table: string,
  ) => {
    select: (
      columns: string,
    ) => SelectQuery;
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: Error | null }>;
};
type SelectQuery = {
      eq: (column: string, value: unknown) => SelectQuery;
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: Error | null }>;
      gt: (column: string, value: number) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: Error | null }>;
      };
};
const db = supabase as unknown as Db;

function compraErrorMessage(error: Error) {
  if (
    error.message.includes("comprobante_compra_invalido") ||
    error.message.includes("compras_factura_numero_formato") ||
    error.message.includes("compras_facturas_numero_formato")
  ) {
    return "El número de comprobante debe tener el formato 0000-00000000.";
  }
  if (error.message.includes("compra_eliminacion_stock_insuficiente")) {
    return "No se puede eliminar porque parte de la mercadería ya fue vendida o retirada. Revisá el stock antes de revertir la compra.";
  }
  if (error.message.includes("compra_edicion_stock_insuficiente")) {
    return "No se puede reducir esa cantidad porque el stock disponible no alcanza para revertir la diferencia.";
  }
  if (error.message.includes("pago_proveedor_invalido")) {
    return "El importe debe ser mayor que cero y el medio de pago debe ser válido.";
  }
  if (error.message.includes("pago_gasto_invalido")) {
    return "El importe debe ser mayor que cero y no puede superar el saldo pendiente del gasto.";
  }
  if (error.message.includes("gasto_monto_menor_a_pagos_registrados")) {
    return "El importe del gasto no puede ser menor que los pagos que ya tiene registrados.";
  }
  if (error.message.includes("pago_cheque_supera_saldo")) return "El cheque no puede superar el saldo pendiente del documento.";
  if (error.message.includes("cheque_monto_pago_diferente")) return "El importe del pago debe coincidir con el monto total del cheque seleccionado.";
  if (error.message.includes("cheque_cartera_no_disponible")) return "El cheque ya no está disponible en cartera.";
  if (error.message.includes("datos_cheque_propio_incompletos")) return "Completá todos los datos obligatorios del cheque propio.";
  if (error.message.includes("pagos_proveedor_superan_saldo")) return "La suma de los medios de pago supera el saldo pendiente.";
  if (error.message.includes("pagos_proveedor_mixtos_invalidos") || error.message.includes("pago_proveedor_mixto_item_invalido")) return "Revisá los medios de pago y sus importes.";
  return error.message;
}
export type CompraNuevaItem = {
  producto_id: string;
  cantidad_solicitada: number;
  costo_unitario: number;
  porcentaje_iva: number;
  porcentaje_descuento: number;
  monto_descuento: number;
  porcentaje_recargo: number;
  monto_recargo: number;
  actualizar_costo: boolean;
};
export type MovimientoProveedor = {
  id: string;
  proveedor_id: string;
  factura_id: string | null;
  gasto_egreso_id?: string | null;
  cheque_id?: string | null;
  tipo: "deuda" | "pago";
  monto: number;
  fecha: string;
  medio_pago?: string | null;
  observaciones?: string | null;
  proveedor: {
    nombre?: string;
    apellido?: string;
    razon_social?: string;
    cuit?: string;
  } | null;
  factura: {
    numero_comprobante: string;
    fecha_vencimiento?: string | null;
    compra_id: string;
  } | null;
  gasto?: {
    concepto: string;
    numero_comprobante?: string | null;
  } | null;
  cheque?: {
    numero_cheque: string;
    banco_emisor: string;
    monto: number;
    tipo_cheque?: "propio" | "tercero";
  } | null;
};
export type ChequePropioPago = {
  numero_cheque: string;
  banco_emisor: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  emisor_nombre: string;
  emisor_cuit?: string;
  observaciones?: string;
};
export type PagoProveedorBorrador = {
  tipo: "contado" | "transferencia" | "tarjeta" | "cheque";
  monto: number;
  observaciones?: string;
  cheque_id?: string;
  cheque_propio?: ChequePropioPago;
};
export type FacturaProveedor = {
  id: string;
  compra_id: string;
  numero_comprobante: string;
  total: number;
  fecha: string;
  fecha_vencimiento: string | null;
  proveedor_id: string;
  proveedor: MovimientoProveedor["proveedor"];
  movimientos: Array<{ tipo: "deuda" | "pago"; monto: number }>;
};

export function useCompras() {
  const client = useQueryClient();
  const { comercio } = useComercio();
  const { toast } = useToast();
  const comercioId = comercio?.id;
  const comprasQuery = useQuery({
    queryKey: ["compras", comercioId],
    enabled: !!comercioId,
    queryFn: async () => {
      const { data, error } = await db.from("compras").select(
        "*, proveedor:proveedores(nombre,apellido,razon_social,cuit), compra_items(*, producto:productos(cod_producto,descripcion))",
      ).eq("comercio_id", comercioId).gt("total", 0).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Compra[];
    },
  });
  const facturasQuery = useQuery({
    queryKey: ["compras-facturas", comercioId],
    enabled: !!comercioId,
    queryFn: async () => {
      const { data, error } = await db.from("compras_facturas").select(
        "*, proveedor:proveedores(nombre,apellido,razon_social,cuit), movimientos:cuenta_corriente_proveedores(tipo,monto)",
      ).eq("comercio_id", comercioId).order("fecha", { ascending: false });
      if (error) throw error;
      return (data || []) as FacturaProveedor[];
    },
  });
  const movimientosQuery = useQuery({
    queryKey: ["cuenta-proveedores", comercioId],
    enabled: !!comercioId,
    queryFn: async () => {
      const { data, error } = await db.from("cuenta_corriente_proveedores")
        .select(
          "*, proveedor:proveedores(nombre,apellido,razon_social,cuit), factura:compras_facturas(numero_comprobante,fecha_vencimiento,compra_id), gasto:gastos_egresos(concepto,numero_comprobante), cheque:cheques(numero_cheque,banco_emisor,monto,tipo_cheque)",
        ).eq("comercio_id", comercioId).order("fecha", { ascending: false });
      if (error) throw error;
      return (data || []) as MovimientoProveedor[];
    },
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["compras"] });
    client.invalidateQueries({ queryKey: ["compras-facturas"] });
    client.invalidateQueries({ queryKey: ["cuenta-proveedores"] });
    client.invalidateQueries({ queryKey: ["productos"] });
    client.invalidateQueries({ queryKey: ["gastos-egresos"] });
    client.invalidateQueries({ queryKey: ["cheques"] });
  };
  const confirmarCompra = useMutation({
    mutationFn: async (
      args: {
        proveedorId: string;
        fecha: string;
        facturaNumero: string;
        vencimiento: string;
        modalidadPago: string;
        porcentajeDescuento: number;
        descuento: number;
        porcentajeRecargo: number;
        recargo: number;
        observaciones: string;
        items: CompraNuevaItem[];
      },
    ) => {
      if (!comercioId) throw new Error("No hay un comercio seleccionado.");
      if (!/^\d{4}-\d{8}$/.test(args.facturaNumero)) {
        throw new Error("comprobante_compra_invalido");
      }
      const items = args.items.map((i) => ({
        producto_id: i.producto_id,
        cantidad: i.cantidad_solicitada,
        costo_unitario: i.costo_unitario,
        porcentaje_iva: i.porcentaje_iva,
        porcentaje_descuento: i.porcentaje_descuento,
        monto_descuento: i.monto_descuento,
        porcentaje_recargo: i.porcentaje_recargo,
        monto_recargo: i.monto_recargo,
        actualizar_costo: i.actualizar_costo,
      }));
      const { error } = await db.rpc("registrar_compra_confirmada_v2", {
        p_comercio_id: comercioId,
        p_proveedor_id: args.proveedorId,
        p_fecha: args.fecha,
        p_factura_numero: args.facturaNumero,
        p_fecha_vencimiento: args.vencimiento || null,
        p_modalidad_pago: args.modalidadPago,
        p_porcentaje_descuento: args.porcentajeDescuento,
        p_monto_descuento: args.descuento,
        p_porcentaje_recargo: args.porcentajeRecargo,
        p_monto_recargo: args.recargo,
        p_items: items,
        p_observaciones: args.observaciones,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({
        title: "Compra registrada",
        description: "Se actualizaron stock, costos y cuenta del proveedor.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "No se pudo registrar la compra",
        description: compraErrorMessage(error),
        variant: "destructive",
      }),
  });
  const editarCompra = useMutation({
    mutationFn: async (
      args: {
        compraId: string;
        proveedorId: string;
        fecha: string;
        facturaNumero: string;
        vencimiento: string;
        modalidadPago: string;
        porcentajeDescuento: number;
        descuento: number;
        porcentajeRecargo: number;
        recargo: number;
        observaciones: string;
        items: CompraNuevaItem[];
      },
    ) => {
      if (!/^\d{4}-\d{8}$/.test(args.facturaNumero)) {
        throw new Error("comprobante_compra_invalido");
      }
      const items = args.items.map((i) => ({
        producto_id: i.producto_id,
        cantidad: i.cantidad_solicitada,
        costo_unitario: i.costo_unitario,
        porcentaje_iva: i.porcentaje_iva,
        porcentaje_descuento: i.porcentaje_descuento,
        monto_descuento: i.monto_descuento,
        porcentaje_recargo: i.porcentaje_recargo,
        monto_recargo: i.monto_recargo,
        actualizar_costo: i.actualizar_costo,
      }));
      const { error } = await db.rpc("editar_compra_confirmada", {
        p_compra_id: args.compraId,
        p_proveedor_id: args.proveedorId,
        p_fecha: args.fecha,
        p_factura_numero: args.facturaNumero,
        p_fecha_vencimiento: args.vencimiento || null,
        p_modalidad_pago: args.modalidadPago,
        p_porcentaje_descuento: args.porcentajeDescuento,
        p_monto_descuento: args.descuento,
        p_porcentaje_recargo: args.porcentajeRecargo,
        p_monto_recargo: args.recargo,
        p_items: items,
        p_observaciones: args.observaciones,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Compra actualizada" });
    },
    onError: (error: Error) =>
      toast({
        title: "No se pudo modificar la compra",
        description: compraErrorMessage(error),
        variant: "destructive",
      }),
  });
  const eliminarCompra = useMutation({
    mutationFn: async (compraId: string) => {
      const { error } = await db.rpc("eliminar_compra_confirmada", {
        p_compra_id: compraId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({
        title: "Compra eliminada",
        description:
          "El stock y los movimientos financieros fueron revertidos.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "No se pudo eliminar la compra",
        description: compraErrorMessage(error),
        variant: "destructive",
      }),
  });
  const registrarPago = useMutation({
    mutationFn: async (
      { facturaId, monto, medioPago, fecha, observaciones }: {
        facturaId: string;
        monto: number;
        medioPago: string;
        fecha: string;
        observaciones?: string;
      },
    ) => {
      const { error } = await db.rpc("registrar_pago_factura_compra", {
        p_factura_id: facturaId,
        p_monto: monto,
        p_fecha: fecha,
        p_medio_pago: medioPago,
        p_observaciones: observaciones || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Pago registrado" });
    },
    onError: (error: Error) =>
      toast({
        title: "No se pudo registrar el pago",
        description: error.message,
        variant: "destructive",
      }),
  });
  const editarPago = useMutation({
    mutationFn: async (
      { movimientoId, monto, medioPago, fecha, observaciones }: {
        movimientoId: string;
        monto: number;
        medioPago: string;
        fecha: string;
        observaciones?: string;
      },
    ) => {
      const { error } = await db.rpc("editar_pago_factura_compra", {
        p_movimiento_id: movimientoId,
        p_monto: monto,
        p_fecha: fecha,
        p_medio_pago: medioPago,
        p_observaciones: observaciones || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Pago actualizado" });
    },
    onError: (error: Error) =>
      toast({
        title: "No se pudo modificar el pago",
        description: compraErrorMessage(error),
        variant: "destructive",
      }),
  });
  const eliminarPago = useMutation({
    mutationFn: async (movimientoId: string) => {
      const { error } = await db.rpc("eliminar_pago_factura_compra", {
        p_movimiento_id: movimientoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Pago eliminado" });
    },
    onError: (error: Error) =>
      toast({
        title: "No se pudo eliminar el pago",
        description: compraErrorMessage(error),
        variant: "destructive",
      }),
  });
  const registrarPagoGasto = useMutation({
    mutationFn: async (
      { gastoId, monto, medioPago, fecha, observaciones }: {
        gastoId: string;
        monto: number;
        medioPago: string;
        fecha: string;
        observaciones?: string;
      },
    ) => {
      const { error } = await db.rpc("registrar_pago_gasto_egreso", {
        p_gasto_id: gastoId,
        p_monto: monto,
        p_fecha: fecha,
        p_medio_pago: medioPago,
        p_observaciones: observaciones || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: "Pago del gasto registrado" }); },
    onError: (error: Error) => toast({ title: "No se pudo registrar el pago", description: compraErrorMessage(error), variant: "destructive" }),
  });
  const editarPagoGasto = useMutation({
    mutationFn: async (
      { movimientoId, monto, medioPago, fecha, observaciones }: {
        movimientoId: string;
        monto: number;
        medioPago: string;
        fecha: string;
        observaciones?: string;
      },
    ) => {
      const { error } = await db.rpc("editar_pago_gasto_egreso", {
        p_movimiento_id: movimientoId,
        p_monto: monto,
        p_fecha: fecha,
        p_medio_pago: medioPago,
        p_observaciones: observaciones || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: "Pago del gasto actualizado" }); },
    onError: (error: Error) => toast({ title: "No se pudo modificar el pago", description: compraErrorMessage(error), variant: "destructive" }),
  });
  const eliminarPagoGasto = useMutation({
    mutationFn: async (movimientoId: string) => {
      const { error } = await db.rpc("eliminar_pago_gasto_egreso", { p_movimiento_id: movimientoId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: "Pago del gasto eliminado" }); },
    onError: (error: Error) => toast({ title: "No se pudo eliminar el pago", description: compraErrorMessage(error), variant: "destructive" }),
  });
  const registrarPagoCheque = useMutation({
    mutationFn: async (
      { facturaId, gastoId, monto, fecha, observaciones, chequeId, chequePropio }: {
        facturaId?: string;
        gastoId?: string;
        monto: number;
        fecha: string;
        observaciones?: string;
        chequeId?: string;
        chequePropio?: ChequePropioPago;
      },
    ) => {
      const { error } = await db.rpc("registrar_pago_proveedor_con_cheque", {
        p_factura_id: facturaId || null,
        p_gasto_id: gastoId || null,
        p_monto: monto,
        p_fecha: fecha,
        p_observaciones: observaciones || null,
        p_cheque_id: chequeId || null,
        p_cheque_propio: chequePropio || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: "Pago con cheque registrado", description: "La cuenta corriente y la cartera de cheques fueron actualizadas." }); },
    onError: (error: Error) => toast({ title: "No se pudo registrar el pago con cheque", description: compraErrorMessage(error), variant: "destructive" }),
  });
  const eliminarPagoCheque = useMutation({
    mutationFn: async (movimientoId: string) => {
      const { error } = await db.rpc("eliminar_pago_proveedor_con_cheque", { p_movimiento_id: movimientoId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: "Pago con cheque eliminado", description: "La cartera de cheques fue actualizada." }); },
    onError: (error: Error) => toast({ title: "No se pudo eliminar el pago con cheque", description: compraErrorMessage(error), variant: "destructive" }),
  });
  const registrarPagosMixtos = useMutation({
    mutationFn: async (
      { facturaId, gastoId, fecha, observaciones, pagos }: {
        facturaId?: string;
        gastoId?: string;
        fecha: string;
        observaciones?: string;
        pagos: PagoProveedorBorrador[];
      },
    ) => {
      const { error } = await db.rpc("registrar_pagos_proveedor_mixtos", {
        p_factura_id: facturaId || null,
        p_gasto_id: gastoId || null,
        p_fecha: fecha,
        p_observaciones: observaciones || null,
        p_pagos: pagos,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: "Pago registrado", description: "Se actualizaron la cuenta corriente y todos los medios asociados." }); },
    onError: (error: Error) => toast({ title: "No se pudo registrar el pago", description: compraErrorMessage(error), variant: "destructive" }),
  });
  return {
    compras: comprasQuery.data || [],
    facturas: facturasQuery.data || [],
    movimientos: movimientosQuery.data || [],
    isLoading: comprasQuery.isLoading || facturasQuery.isLoading ||
      movimientosQuery.isLoading,
    confirmarCompra,
    editarCompra,
    eliminarCompra,
    registrarPago,
    editarPago,
    eliminarPago,
    registrarPagoGasto,
    editarPagoGasto,
    eliminarPagoGasto,
    registrarPagoCheque,
    eliminarPagoCheque,
    registrarPagosMixtos,
  };
}
