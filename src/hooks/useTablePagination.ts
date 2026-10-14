import { useEffect, useState } from "react";
import { useComercio } from "@/hooks/useComercio";

export const tablePageSizes = [12, 24, 48, 96];

export function useTablePagination<T>(items: T[], storageKey: string, resetKey: string) {
  const { comercio } = useComercio();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      return tablePageSizes.includes(saved) ? saved : 12;
    } catch { return 12; }
  });
  useEffect(() => { setCurrentPage(1); }, [resetKey, pageSize, comercio?.id]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const firstIndex = (activePage - 1) * pageSize;
  const changePageSize = (value: string) => {
    const size = Number(value);
    if (!tablePageSizes.includes(size)) return;
    setPageSize(size);
    try { localStorage.setItem(storageKey, value); } catch { /* La preferencia no es obligatoria. */ }
  };
  return { items: items.slice(firstIndex, firstIndex + pageSize), total: items.length, pageSize, activePage, totalPages, firstIndex, changePageSize, setCurrentPage };
}
