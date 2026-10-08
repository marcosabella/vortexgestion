import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useComercio } from "@/hooks/useComercio";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { AccionRestaurante, ResumenRestaurante } from "@/types/restaurante";
import { generarUuid } from "@/utils/uuid";

type RestauranteDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & { Functions: Database["public"]["Functions"] & {
    restaurante_resumen: { Args: { p_comercio_id: string }; Returns: Json };
    restaurante_operar: { Args: { p_comercio_id: string; p_accion: string; p_datos: Json; p_clave: string }; Returns: string };
  } };
};
type Pendiente = { clave: string; accion: AccionRestaurante; datos: Json };
function leerPendientes(key: string): Pendiente[] {
  try { const stored = JSON.parse(sessionStorage.getItem(key) || "[]"); return Array.isArray(stored) ? stored : []; }
  catch { return []; }
}
const client = supabase as unknown as SupabaseClient<RestauranteDatabase>;
export function useRestaurante() {
  const { comercio } = useComercio();
  const { user } = useAuth();
  const { toast } = useToast();
  const cache = useQueryClient();
  const comercioId = comercio?.id;
  const storageKey = `restaurante-intentos:${comercioId}:${user?.id}`;
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null);
  const bloqueo = useRef(false);
  useEffect(() => {
    setPendientes(leerPendientes(storageKey));
  }, [storageKey]);
  const query = useQuery({
    queryKey: ["restaurante", comercioId, user?.id], enabled: Boolean(comercioId && user), refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await client.rpc("restaurante_resumen", { p_comercio_id: comercioId! });
      if (error) throw error;
      return data as unknown as ResumenRestaurante;
    },
  });
  useEffect(() => {
    if (!comercioId || !user) return;
    const refresh = () => { void cache.invalidateQueries({ queryKey: ["restaurante", comercioId] }); };
    const channel = supabase.channel(`restaurante:${comercioId}:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "restaurante_eventos", filter: `comercio_id=eq.${comercioId}` }, refresh)
      .subscribe();
    window.addEventListener("online", refresh);
    return () => { void supabase.removeChannel(channel); window.removeEventListener("online", refresh); };
  }, [comercioId, user, cache]);
  function guardar(lista: Pendiente[]) { sessionStorage.setItem(storageKey, JSON.stringify(lista)); setPendientes(lista); }
  const mutation = useMutation({
    mutationFn: async (intento: Pendiente) => {
      if (!comercioId || !user) throw new Error("Seleccioná un comercio e iniciá sesión.");
      const { data, error } = await client.rpc("restaurante_operar", { p_comercio_id: comercioId, p_accion: intento.accion, p_datos: intento.datos, p_clave: intento.clave });
      if (error) throw error;
      return data;
    },
  });
  async function ejecutar(intento: Pendiente) {
    if (bloqueo.current) return null;
    bloqueo.current = true;
    setErrorOperacion(null);
    try {
      const stored = leerPendientes(storageKey);
      if (!stored.some(p => p.clave === intento.clave)) guardar([...stored, intento]);
      const result = await mutation.mutateAsync(intento);
      guardar(leerPendientes(storageKey).filter(p => p.clave !== intento.clave));
      await Promise.all(["restaurante", "ventas", "productos", "cuenta-corriente", "caja-diaria", "caja-diaria-ventas", "caja-diaria-ventas-previas-pendientes", "cajas-diarias"].map(key => cache.invalidateQueries({ queryKey: [key] })));
      toast({ title: "Operación registrada" });
      return result;
    } catch (error) {
      const err = error as { code?: string; message?: string };
      setErrorOperacion(err.message || "Verificá la conexión. Podés reintentar la operación pendiente sin duplicarla.");
      if (err.code && /^(P0001|42501|40001|22|23)/.test(err.code)) guardar(leerPendientes(storageKey).filter(p => p.clave !== intento.clave));
      toast({ title: "No se pudo confirmar", description: err.message || "Verificá la conexión. Podés reintentar la operación pendiente sin duplicarla.", variant: "destructive" });
      return null;
    } finally { bloqueo.current = false; }
  }
  return { ...query, trabajando: mutation.isPending, pendientes, errorOperacion,
    operar: (accion: AccionRestaurante, datos: Json) => {
      const anterior = pendientes.find(p => p.accion === accion && JSON.stringify(p.datos) === JSON.stringify(datos));
      return ejecutar(anterior || { clave: generarUuid(), accion, datos });
    },
    reintentar: (pendiente: Pendiente) => ejecutar(pendiente),
  };
}
