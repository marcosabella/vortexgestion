import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";

export type EstadoConciliacion = "pendiente" | "conciliada" | "con_diferencia" | "anulada";

export interface PagoTarjetaConciliacion {
  id: string;
  monto: number;
  cuotas: number | null;
  porcentaje_comision_aplicado: number;
  monto_comision_estimado: number;
  monto_neto_estimado: number;
  monto_comision_real: number | null;
  monto_neto_acreditado: number | null;
  fecha_acreditacion: string | null;
  referencia_liquidacion: string | null;
  observaciones_conciliacion: string | null;
  estado_conciliacion: EstadoConciliacion;
  venta: {
    id: string;
    numero_comprobante: string;
    fecha_venta: string;
    cliente_nombre: string;
  } | null;
  tarjeta: {
    id: string;
    nombre: string;
  } | null;
}

export interface RegistrarConciliacionPayload {
  pagos: PagoTarjetaConciliacion[];
  montoNetoAcreditado: number;
  fechaAcreditacion: string;
  referencia?: string;
  observaciones?: string;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const useConciliacionTarjetas = () => {
  const { comercio } = useComercio();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conciliacion-tarjetas", comercio?.id],
    enabled: Boolean(comercio?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pagos_venta")
        .select(`
          id,
          monto,
          cuotas,
          porcentaje_comision_aplicado,
          monto_comision_estimado,
          monto_neto_estimado,
          monto_comision_real,
          monto_neto_acreditado,
          fecha_acreditacion,
          referencia_liquidacion,
          observaciones_conciliacion,
          estado_conciliacion,
          venta:ventas(id, numero_comprobante, fecha_venta, cliente_nombre),
          tarjeta:tarjetas_credito(id, nombre)
        `)
        .eq("comercio_id", comercio!.id)
        .eq("tipo_pago", "tarjeta")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as PagoTarjetaConciliacion[];
    },
  });

  const registrarMutation = useMutation({
    mutationFn: async ({
      pagos,
      montoNetoAcreditado,
      fechaAcreditacion,
      referencia,
      observaciones,
    }: RegistrarConciliacionPayload) => {
      if (pagos.length === 0) throw new Error("Seleccione al menos una operación");
      if (montoNetoAcreditado < 0) throw new Error("El neto acreditado no puede ser negativo");
      const tarjetasSeleccionadas = new Set(pagos.map((pago) => pago.tarjeta?.id).filter(Boolean));
      if (tarjetasSeleccionadas.size > 1) {
        throw new Error("Una liquidación solo puede contener operaciones de la misma tarjeta");
      }

      const totalEsperado = roundMoney(pagos.reduce((sum, pago) => sum + Number(pago.monto_neto_estimado || 0), 0));
      let distribuido = 0;

      for (let index = 0; index < pagos.length; index += 1) {
        const pago = pagos[index];
        const esUltimo = index === pagos.length - 1;
        const proporcion = totalEsperado > 0 ? Number(pago.monto_neto_estimado || 0) / totalEsperado : 1 / pagos.length;
        const netoReal = esUltimo
          ? roundMoney(montoNetoAcreditado - distribuido)
          : roundMoney(montoNetoAcreditado * proporcion);
        distribuido = roundMoney(distribuido + netoReal);
        const comisionReal = roundMoney(Number(pago.monto || 0) - netoReal);
        const diferencia = roundMoney(netoReal - Number(pago.monto_neto_estimado || 0));

        const { error } = await (supabase as any)
          .from("pagos_venta")
          .update({
            monto_neto_acreditado: netoReal,
            monto_comision_real: comisionReal,
            fecha_acreditacion: fechaAcreditacion,
            referencia_liquidacion: referencia?.trim() || null,
            observaciones_conciliacion: observaciones?.trim() || null,
            estado_conciliacion: Math.abs(diferencia) <= 0.01 ? "conciliada" : "con_diferencia",
          })
          .eq("id", pago.id)
          .eq("comercio_id", comercio!.id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conciliacion-tarjetas"] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas"] });
      toast({ title: "Liquidación registrada", description: "La acreditación quedó conciliada correctamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    pagos: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    registrarConciliacion: registrarMutation.mutateAsync,
    isRegistrando: registrarMutation.isPending,
  };
};
