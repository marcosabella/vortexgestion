import { MutationCache, QueryCache } from "@tanstack/react-query";
import { capturarContextoIncidente, registrarIncidente } from "@/utils/incidentes";

export function crearCachesIncidentes() {
  type Captura = ReturnType<typeof capturarContextoIncidente>;
  const consultas = new WeakMap<object, Captura>();
  const operaciones = new WeakMap<object, Captura>();
  const queryCache = new QueryCache({
    onError: (error, query) => registrarIncidente(error, "consulta", consultas.get(query) ?? null),
  });
  const mutationCache = new MutationCache({
    onError: (error, _variables, _context, mutation) => registrarIncidente(error, "guardado", operaciones.get(mutation) ?? null),
  });
  queryCache.subscribe((event) => {
    if (event.type === "updated" && event.action.type === "fetch") {
      consultas.set(event.query, capturarContextoIncidente());
    }
  });
  mutationCache.subscribe((event) => {
    if (event.type === "updated" && event.action.type === "pending" && !operaciones.has(event.mutation)) {
      operaciones.set(event.mutation, capturarContextoIncidente());
    }
  });
  return { queryCache, mutationCache };
}
