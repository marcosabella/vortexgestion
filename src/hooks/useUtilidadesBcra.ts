import { useQuery } from "@tanstack/react-query";
import { consultarBcra, type ConsultaBcra } from "@/utils/bcra";

export function useUtilidadesBcra(comercioId: string, consulta: ConsultaBcra | null, habilitado: boolean) {
  return useQuery({
    queryKey: ["utilidades-bcra", comercioId, consulta],
    enabled: Boolean(comercioId) && habilitado && consulta !== null,
    queryFn: ({ signal }) => {
      if (!consulta) throw new Error("Consulta requerida.");
      return consultarBcra(consulta, signal);
    },
    retry: false, staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false,
  });
}
