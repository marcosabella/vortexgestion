import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CuentaCorriente, CuentaCorrienteResumen } from "@/types/cuenta-corriente";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";
import type { Json } from "@/integrations/supabase/types";
import { isLegacyDeletedClient } from "@/utils/legacyVisibility";

export type ChequeClientePago = {
  numero_cheque: string;
  banco_emisor: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  emisor_nombre: string;
  emisor_cuit?: string;
  observaciones?: string;
};

export type PagoClienteBorrador = {
  tipo: "contado" | "transferencia" | "tarjeta" | "cheque";
  monto: number;
  cheque?: ChequeClientePago;
  observaciones?: string;
};

const CUENTA_CORRIENTE_PAGE_SIZE = 1000;

const fetchAllPages = async <T,>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>
) => {
  const rows: T[] = [];

  for (let from = 0; ; from += CUENTA_CORRIENTE_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + CUENTA_CORRIENTE_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < CUENTA_CORRIENTE_PAGE_SIZE) break;
  }

  return rows;
};

export const useCuentaCorriente = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { comercio } = useComercio();
  const comercioId = comercio?.id;

  // Get all movements
  const {
    data: movimientos = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["cuenta-corriente", comercioId],
    enabled: Boolean(comercioId),
    queryFn: async () => {
      const rows = await fetchAllPages<CuentaCorriente>((from, to) =>
        supabase
          .from("cuenta_corriente")
          .select(`
            *,
            cliente:clientes(nombre, apellido, cuit, telefono),
            venta:ventas(numero_comprobante, cae, fecha_venta, tipo_comprobante)
          `)
          .eq("comercio_id", comercioId!)
          .order("fecha_movimiento", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: CuentaCorriente[] | null; error: Error | null }>
      );
      return rows.filter((movimiento) => !isLegacyDeletedClient(movimiento.cliente));
    },
  });

  // Get movements by client
  const useMovimientosByCliente = (clienteId: string | null) => {
    return useQuery({
      queryKey: ["cuenta-corriente", comercioId, "cliente", clienteId],
      queryFn: async () => {
        if (!clienteId) return [];

        const rows = await fetchAllPages<CuentaCorriente>((from, to) =>
          supabase
            .from("cuenta_corriente")
            .select(`
              *,
              cliente:clientes(nombre, apellido, cuit, telefono),
              venta:ventas(numero_comprobante, cae, fecha_venta, tipo_comprobante)
            `)
            .eq("comercio_id", comercioId!)
            .eq("cliente_id", clienteId)
            .order("fecha_movimiento", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to) as unknown as PromiseLike<{ data: CuentaCorriente[] | null; error: Error | null }>
        );
        return rows.filter((movimiento) => !isLegacyDeletedClient(movimiento.cliente));
      },
      enabled: Boolean(comercioId && clienteId),
    });
  };

  // Get account summary by client
  const useResumenCuentaCorriente = () => {
    return useQuery({
      queryKey: ["cuenta-corriente", comercioId, "resumen"],
      enabled: Boolean(comercioId),
      queryFn: async () => {
        const movimientos = await fetchAllPages((from, to) =>
          supabase
            .from("cuenta_corriente")
            .select(`
              id,
              cliente_id,
              tipo_movimiento,
              monto,
              fecha_movimiento,
              cliente:clientes(nombre, apellido, cuit, telefono)
            `)
            .eq("comercio_id", comercioId!)
            .order("id", { ascending: true })
            .range(from, to)
        );

        // Group by cliente_id and calculate totals
        const resumenMap = new Map<string, CuentaCorrienteResumen>();
        
        movimientos.forEach((mov) => {
          const key = mov.cliente_id;
          if (!resumenMap.has(key)) {
            resumenMap.set(key, {
              cliente_id: mov.cliente_id,
              cliente_nombre: mov.cliente?.nombre || '',
              cliente_apellido: mov.cliente?.apellido || '',
              cliente_cuit: mov.cliente?.cuit || '',
              cliente_telefono: mov.cliente?.telefono || '',
              total_debitos: 0,
              total_creditos: 0,
              saldo_actual: 0,
              ultimo_movimiento: mov.fecha_movimiento,
            });
          }

          const resumen = resumenMap.get(key);
          if (mov.tipo_movimiento === 'debito') {
            resumen.total_debitos += Number(mov.monto);
          } else {
            resumen.total_creditos += Number(mov.monto);
          }
          resumen.saldo_actual = resumen.total_debitos - resumen.total_creditos;
          
          // Update last movement date if newer
          if (new Date(mov.fecha_movimiento) > new Date(resumen.ultimo_movimiento)) {
            resumen.ultimo_movimiento = mov.fecha_movimiento;
          }
        });

        return Array.from(resumenMap.values()).filter(
          (item) => Math.round(item.saldo_actual * 100) !== 0 && !isLegacyDeletedClient({ nombre: item.cliente_nombre }),
        ) as CuentaCorrienteResumen[];
      },
    });
  };

  const createMovimientoMutation = useMutation({
    mutationFn: async (movimiento: Omit<CuentaCorriente, "id" | "created_at" | "updated_at">) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de registrar el movimiento.");
      const { data, error } = await supabase
        .from("cuenta_corriente")
        .insert([{ ...movimiento, comercio_id: comercioId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      toast({
        title: "Éxito",
        description: "Movimiento registrado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al registrar movimiento: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMovimientoMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de eliminar el movimiento.");
      const { error } = await supabase.from("cuenta_corriente").delete().eq("id", id).eq("comercio_id", comercioId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      toast({
        title: "Éxito",
        description: "Movimiento eliminado correctamente",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar movimiento: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteVentaFromCuentaMutation = useMutation({
    mutationFn: async (ventaId: string) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de eliminar la venta.");
      const { data: venta, error: ventaConsultaError } = await supabase
        .from("ventas")
        .select("cae")
        .eq("id", ventaId)
        .eq("comercio_id", comercioId)
        .single();

      if (ventaConsultaError) throw ventaConsultaError;

      if (venta.cae?.trim()) {
        throw new Error("La venta tiene CAE y no puede eliminarse");
      }

      // First delete current account movements related to the sale
      const { error: cuentaError } = await supabase
        .from("cuenta_corriente")
        .delete()
        .eq("venta_id", ventaId)
        .eq("comercio_id", comercioId);
      
      if (cuentaError) throw cuentaError;

      // Then delete the sale itself
      const { error: ventaError } = await supabase
        .from("ventas")
        .delete()
        .eq("id", ventaId)
        .eq("comercio_id", comercioId);
      
      if (ventaError) throw ventaError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      toast({
        title: "Éxito",
        description: "Venta eliminada correctamente desde cuenta corriente",
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

  const registrarPagosMixtosMutation = useMutation({
    mutationFn: async ({
      clienteId,
      ventaId,
      fecha,
      observaciones,
      pagos,
    }: {
      clienteId: string;
      ventaId: string;
      fecha: string;
      observaciones?: string;
      pagos: PagoClienteBorrador[];
    }) => {
      if (!comercioId) throw new Error("Seleccioná un comercio antes de registrar el pago.");
      const { error } = await supabase.rpc("registrar_pagos_cliente_mixtos", {
        p_cliente_id: clienteId,
        p_venta_id: ventaId,
        p_fecha: fecha,
        p_observaciones: observaciones || null,
        p_pagos: pagos as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      toast({
        title: "Pago registrado",
        description: "La cuenta corriente del cliente y los medios de cobro fueron actualizados.",
      });
    },
    onError: (error: Error) => {
      const description = error.message.includes("pagos_cliente_superan_saldo")
        ? "Los pagos ingresados superan el saldo pendiente."
        : error.message.includes("comprobante_cliente_sin_saldo")
          ? "El comprobante seleccionado ya no tiene saldo pendiente."
          : error.message;
      toast({ title: "No se pudo registrar el pago", description, variant: "destructive" });
    },
  });

  const eliminarPagoClienteMutation = useMutation({
    mutationFn: async (movimientoId: string) => {
      const { error } = await supabase.rpc("eliminar_pago_cliente", { p_movimiento_id: movimientoId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      toast({ title: "Pago eliminado", description: "La cuenta corriente y la cartera de cheques fueron actualizadas." });
    },
    onError: (error: Error) => {
      const description = error.message.includes("cheque_cliente_pago_ya_utilizado")
        ? "El pago no puede eliminarse porque el cheque ya fue depositado, endosado o utilizado."
        : error.message;
      toast({ title: "No se pudo eliminar el pago", description, variant: "destructive" });
    },
  });

  return {
    movimientos,
    isLoading,
    error,
    useMovimientosByCliente,
    useResumenCuentaCorriente,
    createMovimiento: createMovimientoMutation.mutate,
    deleteMovimiento: deleteMovimientoMutation.mutate,
    deleteVentaFromCuenta: deleteVentaFromCuentaMutation.mutate,
    registrarPagosMixtos: registrarPagosMixtosMutation,
    eliminarPagoCliente: eliminarPagoClienteMutation,
    isCreating: createMovimientoMutation.isPending,
    isDeleting: deleteMovimientoMutation.isPending,
    isDeletingVenta: deleteVentaFromCuentaMutation.isPending,
  };
};
