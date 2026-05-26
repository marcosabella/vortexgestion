import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CajaDiaria, CajaMovimiento, CajaMovimientoTipo } from "@/types/caja";
import { Venta } from "@/types/venta";

const db = supabase as any;

const VENTAS_CAJA_SELECT = `
  *,
  cliente:clientes(nombre, apellido, telefono),
  pagos_venta(
    *,
    banco:bancos(nombre_banco),
    tarjeta:tarjetas_credito(nombre),
    cheque:cheques(numero_cheque, monto, banco_emisor)
  )
`;

const mergeVentas = (...grupos: Venta[][]) => {
  const ventasPorId = new Map<string, Venta>();

  grupos.flat().forEach((venta) => {
    if (venta.id) ventasPorId.set(venta.id, venta);
  });

  return Array.from(ventasPorId.values()).sort(
    (a, b) => new Date(a.fecha_venta).getTime() - new Date(b.fecha_venta).getTime(),
  );
};

type RegistrarVentasPreviasResult = {
  movimientos: CajaMovimiento[];
  ventasRegistradas: Venta[];
};

export const useActualizarCierreCaja = (fecha?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      caja_id,
      monto_cierre_sistema,
      monto_cierre_real,
      observaciones_cierre,
    }: {
      caja_id: string;
      monto_cierre_sistema: number;
      monto_cierre_real: number;
      observaciones_cierre?: string;
    }) => {
      const { data, error } = await db
        .from("cajas_diarias")
        .update({
          monto_cierre_sistema,
          monto_cierre_real,
          diferencia: monto_cierre_real - monto_cierre_sistema,
          observaciones_cierre: observaciones_cierre || null,
        })
        .eq("id", caja_id)
        .eq("estado", "cerrada")
        .select()
        .single();

      if (error) throw error;
      return data as CajaDiaria;
    },
    onSuccess: () => {
      if (fecha) queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Cierre actualizado",
        description: "El dinero contado y la diferencia fueron corregidos",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo actualizar el cierre: ${error.message}`,
        variant: "destructive",
      });
    },
  });
};

export const useEliminarCaja = (fecha?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cajaId: string) => {
      const { error } = await db
        .from("cajas_diarias")
        .delete()
        .eq("id", cajaId);

      if (error) throw error;
    },
    onSuccess: () => {
      if (fecha) queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria"] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas"] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Caja eliminada",
        description: "La caja y sus movimientos manuales fueron eliminados",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo eliminar la caja: ${error.message}`,
        variant: "destructive",
      });
    },
  });
};

export const useReabrirCaja = (fecha?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cajaId: string) => {
      const { data, error } = await db
        .from("cajas_diarias")
        .update({
          estado: "abierta",
          monto_cierre_sistema: null,
          monto_cierre_real: null,
          diferencia: null,
          cerrado_at: null,
          observaciones_cierre: null,
        })
        .eq("id", cajaId)
        .eq("estado", "cerrada")
        .select()
        .single();

      if (error) throw error;
      return data as CajaDiaria;
    },
    onSuccess: () => {
      if (fecha) queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria"] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas"] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Caja reabierta",
        description: "Ahora podes corregir sus movimientos y volver a cerrarla",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo reabrir la caja: ${error.message}`,
        variant: "destructive",
      });
    },
  });
};

export const useCajaDiaria = (fecha: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const actualizarCierreCajaMutation = useActualizarCierreCaja(fecha);
  const eliminarCajaMutation = useEliminarCaja(fecha);
  const reabrirCajaMutation = useReabrirCaja(fecha);

  const cajaQuery = useQuery({
    queryKey: ["caja-diaria", fecha],
    enabled: Boolean(fecha),
    queryFn: async () => {
      const { data, error } = await db
        .from("cajas_diarias")
        .select("*, caja_movimientos(*)")
        .eq("fecha", fecha)
        .order("abierto_at", { ascending: false });

      if (error) throw error;
      const cajas = (data || []) as CajaDiaria[];
      return cajas.find((caja) => caja.estado === "abierta") || cajas[0] || null;
    },
  });

  const caja = cajaQuery.data;

  const ventasPreviasPendientesQuery = useQuery({
    queryKey: ["caja-diaria-ventas-previas-pendientes", fecha, caja?.id, caja?.abierto_at],
    enabled: Boolean(fecha && caja?.id && caja?.estado === "abierta" && caja?.abierto_at),
    queryFn: async () => {
      const abiertoAt = caja?.abierto_at;
      if (!abiertoAt) return [];

      const { data: cajasDelDiaData, error: cajasDelDiaError } = await db
        .from("cajas_diarias")
        .select("*, caja_movimientos(*)")
        .eq("fecha", fecha);

      if (cajasDelDiaError) throw cajasDelDiaError;

      const { data: ventasDelDiaData, error: ventasDelDiaError } = await db
        .from("ventas")
        .select(VENTAS_CAJA_SELECT)
        .gte("fecha_venta", `${fecha}T00:00:00`)
        .lt("fecha_venta", abiertoAt)
        .order("fecha_venta", { ascending: true });

      if (ventasDelDiaError) throw ventasDelDiaError;

      const cajasDelDia = (cajasDelDiaData || []) as CajaDiaria[];
      const ventasDelDia = (ventasDelDiaData || []) as Venta[];
      const movimientosVentaIds = new Set(
        cajasDelDia.flatMap((cajaDelDia) =>
          (cajaDelDia.caja_movimientos || [])
            .map((movimiento) => movimiento.venta_id)
            .filter(Boolean),
        ),
      );

      return ventasDelDia.filter((venta) => {
        if (!venta.id || movimientosVentaIds.has(venta.id)) return false;
        if (Number(venta.total || 0) <= 0) return false;

        const fechaVenta = new Date(venta.fecha_venta).getTime();
        const incluidaEnCaja = cajasDelDia.some((cajaDelDia) => {
          if (!cajaDelDia.abierto_at) return false;
          const desdeCaja = new Date(cajaDelDia.abierto_at).getTime();
          const hastaCaja = cajaDelDia.cerrado_at
            ? new Date(cajaDelDia.cerrado_at).getTime()
            : new Date().getTime();

          return fechaVenta >= desdeCaja && fechaVenta <= hastaCaja;
        });

        return !incluidaEnCaja;
      });
    },
  });

  const ventasQuery = useQuery({
    queryKey: ["caja-diaria-ventas", fecha, caja?.id, caja?.abierto_at, caja?.cerrado_at],
    enabled: Boolean(fecha && caja?.id),
    queryFn: async () => {
      const desde = caja?.abierto_at || `${fecha}T00:00:00`;
      const hasta = caja?.cerrado_at || new Date().toISOString();
      const ventasEnlazadasIds = Array.from(
        new Set(
          (caja?.caja_movimientos || [])
            .map((movimiento) => movimiento.venta_id)
            .filter(Boolean),
        ),
      ) as string[];

      const { data: ventasDelPeriodoData, error } = await db
        .from("ventas")
        .select(VENTAS_CAJA_SELECT)
        .gte("fecha_venta", desde)
        .lte("fecha_venta", hasta)
        .order("fecha_venta", { ascending: true });

      if (error) throw error;

      if (ventasEnlazadasIds.length === 0) return ventasDelPeriodoData as Venta[];

      const { data: ventasEnlazadasData, error: ventasEnlazadasError } = await db
        .from("ventas")
        .select(VENTAS_CAJA_SELECT)
        .in("id", ventasEnlazadasIds);

      if (ventasEnlazadasError) throw ventasEnlazadasError;

      return mergeVentas((ventasDelPeriodoData || []) as Venta[], (ventasEnlazadasData || []) as Venta[]);
    },
  });

  const abrirCajaMutation = useMutation({
    mutationFn: async ({
      monto_apertura,
      observaciones_apertura,
    }: {
      monto_apertura: number;
      observaciones_apertura?: string;
    }) => {
      const { data, error } = await db
        .from("cajas_diarias")
        .insert({
          fecha,
          monto_apertura,
          observaciones_apertura: observaciones_apertura || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CajaDiaria;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Caja abierta",
        description: "La caja fue abierta correctamente",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo abrir la caja: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const agregarMovimientoMutation = useMutation({
    mutationFn: async ({
      caja_id,
      tipo,
      concepto,
      descripcion,
      monto,
    }: {
      caja_id: string;
      tipo: CajaMovimientoTipo;
      concepto: string;
      descripcion?: string;
      monto: number;
    }) => {
      const { data, error } = await db
        .from("caja_movimientos")
        .insert({
          caja_id,
          tipo,
          concepto,
          descripcion: descripcion || null,
          monto,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CajaMovimiento;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Movimiento registrado",
        description: "El movimiento de caja fue guardado",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo registrar el movimiento: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const registrarVentasPreviasMutation = useMutation({
    mutationFn: async (): Promise<RegistrarVentasPreviasResult> => {
      if (!caja?.id) return { movimientos: [], ventasRegistradas: [] };

      const ventasPrevias = ventasPreviasPendientesQuery.data || [];
      const movimientos = ventasPrevias
        .map((venta) => ({
          caja_id: caja.id,
          venta_id: venta.id,
          tipo: "ingreso" as CajaMovimientoTipo,
          concepto: `Venta ${venta.numero_comprobante}`,
          descripcion: `Comprobante anterior a la apertura de caja (${venta.cliente_nombre || "Consumidor Final"})`,
          monto: Number(venta.total || 0),
          fecha_movimiento: venta.fecha_venta,
        }))
        .filter((movimiento) => movimiento.venta_id && movimiento.monto > 0);

      if (movimientos.length === 0) return { movimientos: [], ventasRegistradas: [] };

      const { data, error } = await db
        .from("caja_movimientos")
        .insert(movimientos)
        .select();

      if (error) throw error;
      const movimientosGuardados = (data || []) as CajaMovimiento[];
      const ventasRegistradasIds = new Set(movimientosGuardados.map((movimiento) => movimiento.venta_id).filter(Boolean));

      return {
        movimientos: movimientosGuardados,
        ventasRegistradas: ventasPrevias.filter((venta) => venta.id && ventasRegistradasIds.has(venta.id)),
      };
    },
    onSuccess: ({ movimientos, ventasRegistradas }) => {
      if (movimientos.length > 0) {
        queryClient.setQueryData<CajaDiaria | null>(["caja-diaria", fecha], (cajaActual) => {
          if (!cajaActual || cajaActual.id !== caja?.id) return cajaActual;

          const movimientosActuales = cajaActual.caja_movimientos || [];
          const movimientosActualesIds = new Set(movimientosActuales.map((movimiento) => movimiento.id).filter(Boolean));
          const movimientosNuevos = movimientos.filter(
            (movimiento) => !movimiento.id || !movimientosActualesIds.has(movimiento.id),
          );

          return {
            ...cajaActual,
            caja_movimientos: [...movimientosActuales, ...movimientosNuevos],
          };
        });

        const ventasRegistradasIds = new Set(ventasRegistradas.map((venta) => venta.id).filter(Boolean));

        queryClient.setQueriesData<Venta[]>(
          { queryKey: ["caja-diaria-ventas", fecha] },
          (ventasActuales) => mergeVentas((ventasActuales || []) as Venta[], ventasRegistradas),
        );

        queryClient.setQueriesData<Venta[]>(
          { queryKey: ["caja-diaria-ventas-previas-pendientes", fecha] },
          (ventasPendientesActuales) =>
            ((ventasPendientesActuales || []) as Venta[]).filter(
              (venta) => !venta.id || !ventasRegistradasIds.has(venta.id),
            ),
        );
      }

      queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas-previas-pendientes", fecha] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas", fecha] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Ventas registradas en caja",
        description: `Se agregaron ${movimientos.length} comprobante${movimientos.length === 1 ? "" : "s"} como movimiento de caja`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudieron registrar las ventas previas: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const actualizarMovimientoMutation = useMutation({
    mutationFn: async ({
      movimiento_id,
      tipo,
      concepto,
      descripcion,
      monto,
    }: {
      movimiento_id: string;
      tipo: CajaMovimientoTipo;
      concepto: string;
      descripcion?: string;
      monto: number;
    }) => {
      const { data, error } = await db
        .from("caja_movimientos")
        .update({
          tipo,
          concepto,
          descripcion: descripcion || null,
          monto,
        })
        .eq("id", movimiento_id)
        .select()
        .single();

      if (error) throw error;
      return data as CajaMovimiento;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Movimiento actualizado",
        description: "El movimiento de caja fue corregido",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo actualizar el movimiento: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const eliminarMovimientoMutation = useMutation({
    mutationFn: async (movimientoId: string) => {
      const { error } = await db
        .from("caja_movimientos")
        .delete()
        .eq("id", movimientoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
    },
  });

  const cerrarCajaMutation = useMutation({
    mutationFn: async ({
      caja_id,
      monto_cierre_sistema,
      monto_cierre_real,
      observaciones_cierre,
    }: {
      caja_id: string;
      monto_cierre_sistema: number;
      monto_cierre_real: number;
      observaciones_cierre?: string;
    }) => {
      const { data, error } = await db
        .from("cajas_diarias")
        .update({
          estado: "cerrada",
          monto_cierre_sistema,
          monto_cierre_real,
          diferencia: monto_cierre_real - monto_cierre_sistema,
          cerrado_at: new Date().toISOString(),
          observaciones_cierre: observaciones_cierre || null,
        })
        .eq("id", caja_id)
        .select()
        .single();

      if (error) throw error;
      return data as CajaDiaria;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caja-diaria", fecha] });
      queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
      toast({
        title: "Caja cerrada",
        description: "El cierre y arqueo fueron registrados",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `No se pudo cerrar la caja: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    caja,
    ventas: ventasQuery.data || [],
    ventasPreviasPendientes: ventasPreviasPendientesQuery.data || [],
    isLoading: cajaQuery.isLoading || ventasQuery.isLoading,
    abrirCaja: abrirCajaMutation.mutate,
    agregarMovimiento: agregarMovimientoMutation.mutate,
    registrarVentasPrevias: registrarVentasPreviasMutation.mutate,
    actualizarMovimiento: actualizarMovimientoMutation.mutate,
    eliminarMovimiento: eliminarMovimientoMutation.mutate,
    eliminarCaja: eliminarCajaMutation.mutate,
    reabrirCaja: reabrirCajaMutation.mutate,
    cerrarCaja: cerrarCajaMutation.mutate,
    actualizarCierreCaja: actualizarCierreCajaMutation.mutate,
    isAbriendo: abrirCajaMutation.isPending,
    isAgregandoMovimiento: agregarMovimientoMutation.isPending,
    isRegistrandoVentasPrevias: registrarVentasPreviasMutation.isPending,
    isActualizandoMovimiento: actualizarMovimientoMutation.isPending,
    isEliminandoCaja: eliminarCajaMutation.isPending,
    isReabriendoCaja: reabrirCajaMutation.isPending,
    isCerrando: cerrarCajaMutation.isPending,
    isActualizandoCierre: actualizarCierreCajaMutation.isPending,
  };
};

export const useCajasDiarias = (fechaDesde?: string, fechaHasta?: string) =>
  useQuery({
    queryKey: ["cajas-diarias", fechaDesde, fechaHasta],
    queryFn: async () => {
      let query = db
        .from("cajas_diarias")
        .select("*, caja_movimientos(*)")
        .order("fecha", { ascending: false })
        .order("abierto_at", { ascending: false });

      if (fechaDesde) query = query.gte("fecha", fechaDesde);
      if (fechaHasta) query = query.lte("fecha", fechaHasta);

      const { data, error } = await query;

      if (error) throw error;
      const cajas = (data || []) as CajaDiaria[];
      if (cajas.length === 0) return cajas;

      const fechas = cajas.map((caja) => caja.fecha).sort();
      const desde = `${fechas[0]}T00:00:00`;
      const hasta = `${fechas[fechas.length - 1]}T23:59:59.999`;

      const { data: ventasData, error: ventasError } = await db
        .from("ventas")
        .select(VENTAS_CAJA_SELECT)
        .gte("fecha_venta", desde)
        .lte("fecha_venta", hasta)
        .order("fecha_venta", { ascending: true });

      if (ventasError) throw ventasError;

      return cajas.map((caja) => {
        const ventasEnlazadasIds = new Set(
          (caja.caja_movimientos || [])
            .map((movimiento) => movimiento.venta_id)
            .filter(Boolean),
        );

        return {
          ...caja,
          ventas: ((ventasData || []) as Venta[]).filter((venta) => {
            const fechaVenta = venta.fecha_venta ? new Date(venta.fecha_venta).getTime() : 0;
            const desdeCaja = new Date(caja.abierto_at || `${caja.fecha}T00:00:00`).getTime();
            const hastaCaja = caja.cerrado_at
              ? new Date(caja.cerrado_at).getTime()
              : new Date(`${caja.fecha}T23:59:59.999`).getTime();

            return Boolean(venta.id && ventasEnlazadasIds.has(venta.id)) || (fechaVenta >= desdeCaja && fechaVenta <= hastaCaja);
          }),
        };
      });
    },
  });
