import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cargarPedidosOnlineCompatibles } from "@/utils/pedidosOnlineQuery";

export type EstadoPedidoOnline = "recibido" | "confirmado" | "preparando" | "listo" | "entregado" | "cancelado";

export interface PedidoOnline {
  id: string; numero: string | number; estado: EstadoPedidoOnline; estado_pago: string | null; created_at: string; total: number; importe_pagado: number; venta_id: string | null;
  cliente_nombre: string; cliente_email: string; cliente_telefono: string; cliente_direccion: string; cliente_id: string | null; observaciones: string | null;
  cliente: { nombre: string; apellido: string } | null;
  pedido_online_items: { id: string; cantidad: number; descripcion: string; subtotal: number }[];
  pedido_online_reembolsos: { estado: string; importe: number; importe_reembolsado: number; error: string | null } | null;
  pedido_online_cancelaciones: { estado: string; nota_credito_id: string | null; error: string | null } | null;
}

export function usePedidosOnline() {
  const { comercio } = useComercio();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["pedidos-online", comercio?.id], enabled: Boolean(comercio?.id), refetchInterval: 15_000,
    queryFn: async () => {
      return cargarPedidosOnlineCompatibles(relaciones => {
        const select = ["*", "pedido_online_items(*)", "cliente:clientes(id,nombre,apellido,email,telefono)"];
        if (relaciones.reembolsos) select.push("pedido_online_reembolsos(estado,importe,importe_reembolsado,error)");
        if (relaciones.cancelaciones) select.push("pedido_online_cancelaciones(estado,nota_credito_id,error)");
        return supabase.from("pedidos_online").select(select.join(",")).eq("comercio_id", comercio!.id)
        .in("estado_pago", ["no_iniciado", "aprobado", "reembolsado", "parcialmente_reembolsado"])
        .order("created_at", { ascending: false });
      });
    },
  });
  const permiso = useQuery({
    queryKey: ["pedidos-online-admin", comercio?.id, user?.id], enabled: Boolean(comercio?.id && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("comercio_usuarios").select("rol")
        .eq("comercio_id", comercio!.id).eq("user_id", user!.id).eq("activo", true).maybeSingle();
      if (error) throw error;
      return data?.rol === "admin";
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, estado, devolver }: { id: string; estado: EstadoPedidoOnline; devolver?: boolean }): Promise<{ estado?: string; detalle?: string }> => {
      if (devolver) {
        if (!comercio?.id || estado !== "cancelado") throw new Error("Cancelación inválida");
        if (!query.data?.reembolsosDisponibles) throw new Error("Las devoluciones todavía no están habilitadas en este servidor");
        const { data, error } = await supabase.functions.invoke("mercadopago-reembolsar-pedido", { body: { pedidoId: id, comercioId: comercio.id } });
        if (error) {
          let detalle = error.message;
          const response = (error as { context?: Response }).context;
          if (response instanceof Response) {
            const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
            detalle = payload?.error || detalle;
          }
          throw new Error(detalle);
        }
        if (data?.error) throw new Error(data.error);
        if (!["completado", "pendiente", "error", "fiscal_pendiente"].includes(data?.estado)) throw new Error("Actualizá el pedido para comprobar el resultado de la devolución");
        return data;
      }
      const { error } = await supabase.rpc("actualizar_estado_pedido_online", { p_pedido_id: id, p_estado: estado });
      if (error) throw error;
      return {};
    },
    onSuccess: (result) => {
      if (result.estado === "fiscal_pendiente") toast({ title: "Cancelación pendiente de ARCA", description: result.detalle || "Falta autorizar la nota de crédito. Todavía no se solicitó la devolución del dinero.", variant: "destructive" });
      else if (result.estado === "error") toast({ title: "Pedido cancelado; devolución sin confirmar", description: result.detalle || "Revisá el estado y reintentá la devolución.", variant: "destructive" });
      else if (result.estado === "pendiente") toast({ title: "Pedido cancelado; devolución pendiente", description: "Mercado Pago todavía no confirmó la devolución. Podés consultar su estado desde el pedido." });
      else toast({ title: result.estado === "completado" ? "Pedido cancelado y dinero devuelto" : "Pedido actualizado" });
    },
    onError: (error: Error) => toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" }),
    onSettled: () => {
      for (const key of ["pedidos-online", "productos", "producto-variantes", "mercado-pago", "ventas", "caja-diaria-ventas", "cajas-diarias"]) queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
  return { pedidos: query.data?.pedidos || [], isLoading: query.isLoading, error: query.error,
    comprobantesDisponibles: query.data?.comprobantesDisponibles === true,
    puedeReembolsar: permiso.data === true && query.data?.reembolsosDisponibles === true,
    actualizarEstado: update.mutate, isUpdating: update.isPending };
}
