import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import type {
  AccionDistribucion,
  ResumenDistribucion,
} from "@/types/distribucion";

// Extensión local del contrato de RPC hasta regenerar los tipos desde la migración.
type DistribucionDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      distribucion_resumen: { Args: { p_comercio_id: string }; Returns: Json };
      distribucion_guardar_ruta: {
        Args: { p_comercio_id: string; p_reparto_id: string; p_version: number; p_datos: Json; p_clave: string };
        Returns: string;
      };
      distribucion_configurar_remitos: {
        Args: { p_comercio_id: string; p_datos: Json };
        Returns: undefined;
      };
      distribucion_modificar_pedido: {
        Args: {
          p_comercio_id: string;
          p_pedido_id: string;
          p_version: number;
          p_eliminar: boolean;
          p_datos: Json;
          p_clave: string;
        };
        Returns: string;
      };
      distribucion_operar: {
        Args: {
          p_comercio_id: string;
          p_accion: string;
          p_datos: Json;
          p_clave: string;
        };
        Returns: string;
      };
    };
  };
};
const client = supabase as unknown as SupabaseClient<DistribucionDatabase>;
export function useDistribucion() {
  const { comercio } = useComercio();
  const { toast } = useToast();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["distribucion", comercio?.id],
    enabled: Boolean(comercio?.id),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await client.rpc("distribucion_resumen", {
        p_comercio_id: comercio!.id,
      });
      if (error) throw error;
      return data as unknown as ResumenDistribucion;
    },
  });
  const confirmar = async () => {
    await Promise.all(
      [
        "distribucion",
        "ventas",
        "productos",
        "productos-report",
        "cuenta-corriente",
        "caja-diaria-ventas",
        "cajas-diarias",
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
    toast({ title: "Operación registrada" });
  };
  const informarError = (error: Error) =>
    toast({
      title: "No se pudo registrar",
      description: error.message,
      variant: "destructive",
    });
  const mutation = useMutation({
    mutationFn: async (
      args: { accion: AccionDistribucion; datos: Json; clave: string },
    ) => {
      if (!comercio?.id) throw new Error("Seleccioná un comercio.");
      const { data, error } = await client.rpc("distribucion_operar", {
        p_comercio_id: comercio.id,
        p_accion: args.accion,
        p_datos: args.datos,
        p_clave: args.clave,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: confirmar,
    onError: informarError,
  });
  const modificar = useMutation({
    mutationFn: async (
      args: {
        pedidoId: string;
        version: number;
        eliminar: boolean;
        datos: Json;
        clave: string;
      },
    ) => {
      if (!comercio?.id) throw new Error("Seleccioná un comercio.");
      const { data, error } = await client.rpc(
        "distribucion_modificar_pedido",
        {
          p_comercio_id: comercio.id,
          p_pedido_id: args.pedidoId,
          p_version: args.version,
          p_eliminar: args.eliminar,
          p_datos: args.datos,
          p_clave: args.clave,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: confirmar,
    onError: informarError,
  });
  return {
    ...query,
    operar: mutation.mutateAsync,
    modificarPedido: modificar.mutateAsync,
    guardarRuta: async (repartoId: string, version: number, datos: Json, clave: string) => {
      if (!comercio?.id) throw new Error("Seleccioná un comercio.");
      const { data, error } = await client.rpc("distribucion_guardar_ruta", {
        p_comercio_id: comercio.id, p_reparto_id: repartoId, p_version: version, p_datos: datos, p_clave: clave,
      });
      if (error) { informarError(error); throw error; }
      await confirmar();
      return data;
    },
    configurarRemitos: async (datos: Json) => {
      if (!comercio?.id) throw new Error("Seleccioná un comercio.");
      const { error } = await client.rpc("distribucion_configurar_remitos", {
        p_comercio_id: comercio.id,
        p_datos: datos,
      });
      if (error) {
        informarError(error);
        throw error;
      }
      await confirmar();
    },
    trabajando: mutation.isPending || modificar.isPending,
  };
}
