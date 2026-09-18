import { useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampoOrdenEstado, CampoOrdenEstadoFilter, CampoOrdenListItem } from "@/types/campo";

type OrdenesListProps = {
  ordenes: CampoOrdenListItem[];
};

const estados: Array<{ value: CampoOrdenEstadoFilter; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "borrador", label: "Borrador" },
  { value: "planificada", label: "Planificada" },
  { value: "en_progreso", label: "En progreso" },
  { value: "finalizada", label: "Finalizada" },
  { value: "cancelada", label: "Cancelada" },
];

const estadoLabels: Record<CampoOrdenEstado, string> = {
  borrador: "Borrador",
  planificada: "Planificada",
  en_progreso: "En progreso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

const numeroFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

function nombreCliente(orden: CampoOrdenListItem) {
  if (!orden.cliente) return "Cliente no disponible";
  return [orden.cliente.nombre, orden.cliente.apellido].filter(Boolean).join(" ").trim();
}

function formatCivilDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function fechasLabel(orden: CampoOrdenListItem) {
  const inicio = orden.fecha_inicio_planificada
    ? formatCivilDate(orden.fecha_inicio_planificada)
    : null;
  const fin = orden.fecha_fin_planificada ? formatCivilDate(orden.fecha_fin_planificada) : null;

  if (inicio && fin) return `${inicio} – ${fin}`;
  if (inicio) return `Desde ${inicio}`;
  if (fin) return `Hasta ${fin}`;
  return "Sin fechas planificadas";
}

function EstadoBadge({ estado }: { estado: string }) {
  const knownEstado = estado as CampoOrdenEstado;
  const label = estadoLabels[knownEstado] ?? estado;
  const variant =
    knownEstado === "cancelada"
      ? "destructive"
      : knownEstado === "borrador"
        ? "secondary"
        : knownEstado === "finalizada"
          ? "outline"
          : "default";

  return <Badge variant={variant}>{label}</Badge>;
}

export function OrdenesList({ ordenes }: OrdenesListProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [estado, setEstado] = useState<CampoOrdenEstadoFilter>("todas");

  const ordenesFiltradas = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("es");

    return ordenes.filter((orden) => {
      const matchesEstado = estado === "todas" || orden.estado === estado;
      const searchable = [
        String(orden.numero),
        orden.codigo_interno,
        nombreCliente(orden),
        orden.establecimiento?.nombre,
        orden.descripcion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es");

      return matchesEstado && (!term || searchable.includes(term));
    });
  }, [estado, ordenes, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por número, código, cliente o establecimiento"
            aria-label="Buscar órdenes de trabajo"
            className="pl-9"
          />
        </div>
        <Select value={estado} onValueChange={(value) => setEstado(value as CampoOrdenEstadoFilter)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar órdenes por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {estados.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {ordenes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hay órdenes de trabajo registradas.</CardContent></Card>
      ) : ordenesFiltradas.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No se encontraron órdenes con los filtros seleccionados.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 md:hidden">
            {ordenesFiltradas.map((orden) => (
              <Card key={orden.id}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-lg">Orden N.º {numeroFormatter.format(orden.numero)}</CardTitle>
                    <EstadoBadge estado={orden.estado} />
                  </div>
                  <p className="text-sm text-muted-foreground">{orden.codigo_interno || "Sin código"}</p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div><span className="block text-muted-foreground">Cliente</span>{nombreCliente(orden)}</div>
                  <div><span className="block text-muted-foreground">Establecimiento</span>{orden.establecimiento?.nombre ?? "Establecimiento no disponible"}</div>
                  <div className="sm:col-span-2"><span className="block text-muted-foreground">Fechas planificadas</span>{fechasLabel(orden)}</div>
                  <div className="sm:col-span-2"><span className="block text-muted-foreground">Descripción</span><p className="line-clamp-2 whitespace-pre-wrap">{orden.descripcion || "Sin descripción"}</p></div>
                  <div className="flex justify-end sm:col-span-2 pt-2"><Button type="button" variant="outline" size="icon" onClick={() => navigate(`/campo/ordenes/${orden.id}`)} aria-label={`Ver detalle de la orden número ${orden.numero}`} title="Ver detalle"><Eye className="h-4 w-4" /></Button></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Orden</TableHead><TableHead>Código</TableHead><TableHead>Cliente</TableHead><TableHead>Establecimiento</TableHead><TableHead>Estado</TableHead><TableHead>Fechas planificadas</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                <TableBody>
                  {ordenesFiltradas.map((orden) => (
                    <TableRow key={orden.id}>
                      <TableCell className="whitespace-nowrap font-medium">Orden N.º {numeroFormatter.format(orden.numero)}</TableCell>
                      <TableCell>{orden.codigo_interno || "Sin código"}</TableCell>
                      <TableCell>{nombreCliente(orden)}</TableCell>
                      <TableCell>{orden.establecimiento?.nombre ?? "Establecimiento no disponible"}</TableCell>
                      <TableCell><EstadoBadge estado={orden.estado} /></TableCell>
                      <TableCell className="whitespace-nowrap">{fechasLabel(orden)}</TableCell>
                      <TableCell className="max-w-xs"><p className="line-clamp-2 whitespace-pre-wrap">{orden.descripcion || "Sin descripción"}</p></TableCell>
                      <TableCell className="text-right"><Button type="button" variant="outline" size="icon" onClick={() => navigate(`/campo/ordenes/${orden.id}`)} aria-label={`Ver detalle de la orden número ${orden.numero}`} title="Ver detalle"><Eye className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
