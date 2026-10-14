export async function fetchMasterRecords<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown; count: number | null }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  let total: number | undefined;
  for (let from = 0; total === undefined || from < total; from += pageSize) {
    const { data, error, count } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    if (count == null || (total !== undefined && count !== total)) throw new Error("Los registros cambiaron durante la consulta. Volvé a cargar el listado.");
    total = count;
    if (!Array.isArray(data) || data.length !== Math.min(pageSize, total - from)) throw new Error("No se pudieron cargar todos los registros.");
    rows.push(...data as T[]);
  }
  return rows;
}
