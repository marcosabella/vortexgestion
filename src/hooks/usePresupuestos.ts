import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Presupuesto } from "@/types/presupuesto";
import { PagoVenta, Venta, VentaItem } from "@/types/venta";

// Las tablas de presupuestos se agregan por migracion y requieren regenerar los tipos de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const comercioId = () => localStorage.getItem("selectedComercioId");

type PresupuestoRow = Presupuesto & {
  presupuesto_items?: VentaItem[];
  presupuesto_pagos?: PagoVenta[];
};

type PresupuestoPayload = {
  venta: Omit<Venta, "id" | "created_at" | "updated_at">;
  items: Omit<VentaItem, "id" | "venta_id" | "created_at" | "updated_at">[];
  pagos: Omit<PagoVenta, "id" | "venta_id" | "created_at" | "updated_at">[];
};

const getDatabaseErrorMessage = (error: unknown) => {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Error desconocido de base de datos";
};

const presupuestoSaveError = (stage: string, error: unknown) => {
  console.error(`Error al ${stage} el presupuesto:`, error);
  return new Error(`${stage}: ${getDatabaseErrorMessage(error)}`);
};

export const usePresupuestos = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selectedComercioId = comercioId();

  const query = useQuery({
    queryKey: ["presupuestos", selectedComercioId],
    queryFn: async () => {
      let request = db.from("presupuestos").select(`
        *,
        cliente:clientes(nombre, apellido, cuit, calle, numero, codigo_postal, localidad, provincia, telefono, situacion_afip, tipo_persona),
        venta_vinculada:ventas(id, numero_comprobante, fecha_venta, total),
        presupuesto_items(*, producto:productos(cod_producto, descripcion, precio_venta, porcentaje_iva)),
        presupuesto_pagos(*, banco:bancos(nombre_banco), tarjeta:tarjetas_credito(nombre), cheque:cheques(numero_cheque, monto, banco_emisor))
      `);
      if (selectedComercioId) request = request.eq("comercio_id", selectedComercioId);
      const { data, error } = await request.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((item: PresupuestoRow) => ({
        ...item,
        venta_items: item.presupuesto_items || [],
        pagos_venta: item.presupuesto_pagos || [],
      })) as Presupuesto[];
    },
  });

  const save = async (payload: PresupuestoPayload, presupuestoId?: string) => {
    const header = { ...payload.venta, comercio_id: selectedComercioId || undefined };
    let id = presupuestoId;
    let createdId: string | undefined;
    if (id) {
      const { error } = await db.from("presupuestos").update(header).eq("id", id).eq("estado", "pendiente");
      if (error) throw presupuestoSaveError("actualizar los datos generales", error);
      const { error: itemsDeleteError } = await db.from("presupuesto_items").delete().eq("presupuesto_id", id);
      if (itemsDeleteError) throw presupuestoSaveError("reemplazar los productos", itemsDeleteError);
      const { error: pagosDeleteError } = await db.from("presupuesto_pagos").delete().eq("presupuesto_id", id);
      if (pagosDeleteError) throw presupuestoSaveError("reemplazar los medios de pago", pagosDeleteError);
    } else {
      const { data, error } = await db.from("presupuestos").insert(header).select("id").single();
      if (error) throw presupuestoSaveError("crear los datos generales", error);
      id = data.id;
      createdId = data.id;
    }

    try {
      if (payload.items.length > 0) {
        const items = payload.items.map((item) => {
          const productoId = item.producto_id || null;
          const descripcionManual = item.descripcion_manual?.trim() || null;

          if (!productoId && !descripcionManual) {
            throw new Error("Los productos manuales deben tener una descripcion.");
          }

          return {
            presupuesto_id: id,
            producto_id: productoId,
            descripcion_manual: productoId ? null : descripcionManual,
            codigo_manual: productoId ? null : item.codigo_manual?.trim() || null,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            porcentaje_iva: item.porcentaje_iva,
            porcentaje_descuento: item.porcentaje_descuento || 0,
            monto_descuento: item.monto_descuento || 0,
            porcentaje_recargo: item.porcentaje_recargo || 0,
            monto_recargo: item.monto_recargo || 0,
            monto_iva: item.monto_iva,
            subtotal: item.subtotal,
            total: item.total,
          };
        });
        const { error: itemsError } = await db.from("presupuesto_items").insert(items);
        if (itemsError) throw presupuestoSaveError("guardar los productos", itemsError);
      }

      if (payload.pagos.length > 0) {
        const pagos = payload.pagos.map((pago) => ({
          presupuesto_id: id,
          tipo_pago: pago.tipo_pago,
          monto: pago.monto,
          banco_id: pago.banco_id || null,
          tarjeta_id: pago.tarjeta_id || null,
          cuotas: pago.cuotas || 1,
          recargo_cuotas: pago.recargo_cuotas || 0,
          cheque_id: pago.cheque_id || null,
        }));
        const { error: pagosError } = await db.from("presupuesto_pagos").insert(pagos);
        if (pagosError) throw presupuestoSaveError("guardar los medios de pago", pagosError);
      }

      return id;
    } catch (error) {
      if (createdId) await db.from("presupuestos").delete().eq("id", createdId);
      throw error;
    }
  };

  const createMutation = useMutation({
    mutationFn: (payload: PresupuestoPayload) => save(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      toast({ title: "Presupuesto guardado", description: "El presupuesto no modifico el stock." });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ presupuestoId, ...payload }: PresupuestoPayload & { presupuestoId: string }) => save(payload, presupuestoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      toast({ title: "Presupuesto actualizado" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("presupuestos").delete().eq("id", id).eq("estado", "pendiente");
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos"] }),
  });
  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.rpc("confirmar_presupuesto", { p_presupuesto_id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      queryClient.invalidateQueries({ queryKey: ["ventas"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["cuenta-corriente"] });
      queryClient.invalidateQueries({ queryKey: ["caja-diaria-ventas"] });
      toast({ title: "Presupuesto confirmado", description: "La venta fue creada y el stock actualizado." });
    },
  });

  return {
    presupuestos: query.data || [],
    isLoading: query.isLoading,
    createPresupuesto: createMutation.mutateAsync,
    updatePresupuesto: updateMutation.mutateAsync,
    deletePresupuesto: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    confirmarPresupuesto: confirmMutation.mutateAsync,
    isConfirming: confirmMutation.isPending,
  };
};
