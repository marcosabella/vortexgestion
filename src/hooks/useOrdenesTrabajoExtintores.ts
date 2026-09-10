import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { toast } from "@/hooks/use-toast";

export type EstadoOrdenTrabajo =
  | "generada"
  | "en_proceso"
  | "cancelada"
  | "finalizada";
export type OrdenTrabajoExtintor = {
  id?: string;
  extintor_id: string;
  extintor?: {
    numero_extintor: string;
    numero_serie: string;
    fecha_proxima_recarga: string | null;
    fecha_vencimiento: string | null;
    marca?: { nombre: string } | null;
    clase?: { nombre: string } | null;
  } | null;
};
export type OrdenTrabajoProducto = {
  id?: string;
  producto_id?: string | null;
  cantidad: number;
  descripcion?: string | null;
  producto?: { cod_producto: string; descripcion: string } | null;
};
export type OrdenTrabajo = {
  id: string;
  comercio_id: string;
  cliente_id: string;
  fecha_orden: string;
  estado: EstadoOrdenTrabajo;
  observaciones: string | null;
  cliente:
    | { nombre: string; apellido: string; telefono?: string | null }
    | null;
  extintores: OrdenTrabajoExtintor[];
  productos: OrdenTrabajoProducto[];
};
export type OrdenTrabajoPayload = {
  id?: string;
  cliente_id: string;
  fecha_orden: string;
  estado: EstadoOrdenTrabajo;
  observaciones?: string;
  extintores: Omit<OrdenTrabajoExtintor, "id" | "extintor">[];
  productos: Omit<OrdenTrabajoProducto, "id" | "producto">[];
};

export function useOrdenesTrabajoExtintores() {
  const { comercio } = useComercio();
  const queryClient = useQueryClient();
  const key = ["ordenes-trabajo-extintores", comercio?.id];
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(comercio?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(
        "ordenes_trabajo_extintores",
      )
        .select(
          "*,cliente:clientes(nombre,apellido,telefono),extintores:ordenes_trabajo_extintores_detalle(*,extintor:extintores(numero_extintor,numero_serie,fecha_proxima_recarga,fecha_vencimiento,marca:extintor_marcas(nombre),clase:extintor_clases(nombre))),productos:ordenes_trabajo_extintores_productos(*,producto:productos(cod_producto,descripcion))",
        )
        .eq("comercio_id", comercio!.id).order("fecha_orden", {
          ascending: false,
        });
      if (error) throw error;
      return data as OrdenTrabajo[];
    },
  });
  const save = useMutation({
    mutationFn: async (orden: OrdenTrabajoPayload) => {
      const { extintores, productos, id, ...cabecera } = orden;
      const payload = { ...cabecera, comercio_id: comercio!.id };
      let ordenId = id;
      if (ordenId) {
        const { error } = await (supabase as any).from(
          "ordenes_trabajo_extintores",
        ).update(payload).eq("id", ordenId).eq("comercio_id", comercio!.id);
        if (error) throw error;
        const { error: deleteExtintoresError } = await (supabase as any).from(
          "ordenes_trabajo_extintores_detalle",
        ).delete().eq("orden_trabajo_id", ordenId).eq(
          "comercio_id",
          comercio!.id,
        );
        if (deleteExtintoresError) throw deleteExtintoresError;
        const { error: deleteProductosError } = await (supabase as any).from(
          "ordenes_trabajo_extintores_productos",
        ).delete().eq("orden_trabajo_id", ordenId).eq(
          "comercio_id",
          comercio!.id,
        );
        if (deleteProductosError) throw deleteProductosError;
      } else {
        const { data, error } = await (supabase as any).from(
          "ordenes_trabajo_extintores",
        ).insert(payload).select("id").single();
        if (error) throw error;
        ordenId = data.id;
      }
      if (extintores.length) {
        const { error } = await (supabase as any).from(
          "ordenes_trabajo_extintores_detalle",
        ).insert(
          extintores.map((item) => ({
            ...item,
            orden_trabajo_id: ordenId,
            comercio_id: comercio!.id,
          })),
        );
        if (error) throw error;
      }
      if (productos.length) {
        const { error } = await (supabase as any).from(
          "ordenes_trabajo_extintores_productos",
        ).insert(
          productos.map((item) => ({
            ...item,
            producto_id: item.producto_id || null,
            descripcion: item.descripcion || null,
            orden_trabajo_id: ordenId,
            comercio_id: comercio!.id,
          })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: "Orden de trabajo guardada" });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(
        "ordenes_trabajo_extintores",
      ).delete().eq("id", id).eq("comercio_id", comercio!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: "Orden de trabajo eliminada" });
    },
  });
  return {
    ordenes: query.data || [],
    isLoading: query.isLoading,
    save: save.mutate,
    remove: remove.mutate,
    saving: save.isPending,
  };
}
