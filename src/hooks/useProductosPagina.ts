import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComercio } from "@/hooks/useComercio";
import { tablePageSizes } from "@/hooks/useTablePagination";
import { consultaProductosPagina } from "@/utils/consultaProductosPagina";

export function useProductosPagina(search: string, { etiquetas = false, enabled = true } = {}) {
  const { comercio } = useComercio();
  const queryClient = useQueryClient();
  const comercioId = comercio?.id;
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("productos-registros-por-pagina"));
      return tablePageSizes.includes(saved) ? saved : 12;
    } catch { return 12; }
  });
  const size = etiquetas ? 24 : pageSize;
  const scope = JSON.stringify([comercioId, debouncedSearch, size]);
  const [page, setPage] = useState({ scope, number: 1 });
  const currentPage = page.scope === scope ? page.number : 1;
  const queryOptions = useCallback((number: number) => ({
    queryKey: ["productos", comercioId, "pagina", debouncedSearch, size, number],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const totalKey = ["productos", comercioId, "total", debouncedSearch];
      const cachedTotal = queryClient.getQueryState<number>(totalKey);
      const totalConocido = cachedTotal && !cachedTotal.isInvalidated && Date.now() - cachedTotal.dataUpdatedAt < 60_000
        ? cachedTotal.data : undefined;
      const result = await consultaProductosPagina({ comercioId: comercioId!, search: debouncedSearch, page: number, pageSize: size, signal, totalConocido });
      // No extender la vigencia del total al consultar páginas que no lo recalculan.
      if (totalConocido === undefined || result.total !== totalConocido) queryClient.setQueryData(totalKey, result.total);
      return result;
    },
    staleTime: 30_000,
  }), [comercioId, debouncedSearch, size, queryClient]);
  const query = useQuery({
    ...queryOptions(currentPage),
    enabled: Boolean(comercioId) && enabled && search === debouncedSearch,
  });
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  useEffect(() => {
    if (page.scope !== scope) setPage({ scope, number: 1 });
    else if (query.data && currentPage > totalPages) setPage({ scope, number: totalPages });
  }, [query.data, currentPage, totalPages, scope, page.scope]);
  // Solo anticipar una página, después de cargar la visible y su conteo.
  // Las etiquetas no necesitan precarga porque muestran resultados acotados.
  useEffect(() => {
    if (!enabled || etiquetas || search !== debouncedSearch || !query.data || query.isFetching || query.isError || currentPage >= totalPages) return;
    void queryClient.prefetchQuery(queryOptions(currentPage + 1));
  }, [enabled, etiquetas, search, debouncedSearch, query.data, query.isFetching, query.isError, currentPage, totalPages, queryClient, queryOptions]);
  const changePageSize = (value: string) => {
    if (!tablePageSizes.includes(Number(value))) return;
    setPageSize(Number(value));
    try { localStorage.setItem("productos-registros-por-pagina", value); } catch { /* Preferencia opcional. */ }
  };
  return {
    ...query,
    productos: query.data?.productos ?? [],
    isSearching: search !== debouncedSearch,
    pagination: {
      total, pageSize: size, activePage: currentPage, totalPages,
      firstIndex: (currentPage - 1) * size, changePageSize,
      setCurrentPage: (number: number) => setPage({ scope, number: Math.max(1, Math.min(number, totalPages)) }),
    },
  };
}
