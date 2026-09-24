import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CuentaCorriente, CuentaCorrienteResumen } from "@/types/cuenta-corriente";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";

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
      return fetchAllPages<CuentaCorriente>((from, to) =>
        supabase
          .from("cuenta_corriente")
          .select(`
            *,
            cliente:clientes(nombre, apellido, cuit, telefono),
            venta:ventas(numero_comprobante, cae)
          `)
          .eq("comercio_id", comercioId!)
          .order("fecha_movimiento", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: CuentaCorriente[] | null; error: Error | null }>
      );
    },
  });

  // Get movements by client
  const useMovimientosByCliente = (clienteId: string | null) => {
    return useQuery({
      queryKey: ["cuenta-corriente", comercioId, "cliente", clienteId],
      queryFn: async () => {
        if (!clienteId) return [];

        return fetchAllPages<CuentaCorriente>((from, to) =>
          supabase
            .from("cuenta_corriente")
            .select(`
              *,
              cliente:clientes(nombre, apellido, cuit, telefono),
              venta:ventas(numero_comprobante, cae)
            `)
            .eq("comercio_id", comercioId!)
            .eq("cliente_id", clienteId)
            .order("fecha_movimiento", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to) as unknown as PromiseLike<{ data: CuentaCorriente[] | null; error: Error | null }>
        );
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

        return Array.from(resumenMap.values()) as CuentaCorrienteResumen[];
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

  return {
    movimientos,
    isLoading,
    error,
    useMovimientosByCliente,
    useResumenCuentaCorriente,
    createMovimiento: createMovimientoMutation.mutate,
    deleteMovimiento: deleteMovimientoMutation.mutate,
    deleteVentaFromCuenta: deleteVentaFromCuentaMutation.mutate,
    isCreating: createMovimientoMutation.isPending,
    isDeleting: deleteMovimientoMutation.isPending,
    isDeletingVenta: deleteVentaFromCuentaMutation.isPending,
  };
};
