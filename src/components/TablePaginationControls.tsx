import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tablePageSizes } from "@/hooks/useTablePagination";

type Props = {
  id: string;
  label: string;
  pagination: {
    total: number; pageSize: number; activePage: number; totalPages: number; firstIndex: number;
    changePageSize: (value: string) => void; setCurrentPage: (value: number) => void;
  };
};

export function TablePaginationControls({ id, label, pagination: p }: Props) {
  const shown = Math.min(p.pageSize, p.total - p.firstIndex);
  return <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
    <div className="flex flex-wrap items-center gap-3">
      <Label htmlFor={`${id}-page-size`} className="whitespace-nowrap">Registros por página</Label>
      <Select value={String(p.pageSize)} onValueChange={p.changePageSize}><SelectTrigger id={`${id}-page-size`} className="h-9 w-20"><SelectValue /></SelectTrigger><SelectContent>{tablePageSizes.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{p.total === 0 ? `0 ${label}` : `Mostrando ${p.firstIndex + 1}–${p.firstIndex + shown} de ${p.total} ${label}`}</p>
    </div>
    <nav aria-label={`Paginación de ${label}`} className="flex items-center justify-between gap-3 sm:justify-end">
      <Button type="button" variant="outline" size="sm" disabled={p.activePage === 1} onClick={() => p.setCurrentPage(p.activePage - 1)}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Anterior</Button>
      <span className="whitespace-nowrap text-sm">Página {p.activePage} de {p.totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={p.activePage === p.totalPages} onClick={() => p.setCurrentPage(p.activePage + 1)}>Siguiente<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button>
    </nav>
  </div>;
}
