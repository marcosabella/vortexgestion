import type { ReactNode } from "react";

export default function Grilla({ titulo, columnas, filas, vacia = "No hay registros informados." }: { titulo: string; columnas: string[]; filas: ReactNode[][]; vacia?: string }) {
  if (!filas.length) return <p role="status" className="rounded-md border p-4 text-sm">{vacia}</p>;
  return <div className="max-h-[65vh] overflow-auto rounded-md border" tabIndex={0} role="region" aria-label={titulo}>
    <table className="w-full text-sm" style={{ minWidth: columnas.length > 8 ? 1400 : columnas.length > 5 ? 1100 : 640 }}>
      <caption className="sr-only">{titulo}</caption>
      <thead className="sticky top-0 z-10 bg-muted"><tr>{columnas.map(columna => <th key={columna} scope="col" className="whitespace-nowrap border-b px-3 py-3 text-left font-semibold">{columna}</th>)}</tr></thead>
      <tbody>{filas.map((fila, i) => <tr key={i} className="border-b last:border-0 hover:bg-muted/30">{fila.map((celda, j) => <td key={j} className="max-w-xs break-words px-3 py-3 align-top">{celda}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
