import { useMemo, useState } from "react";
import { Pencil, Power, PowerOff, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampoEstadoFilter, CampoLoteListItem } from "@/types/campo";

type LotesListProps = {
  lotes: CampoLoteListItem[];
  canManage: boolean;
  actionsDisabled: boolean;
  onEdit: (lote: CampoLoteListItem) => void;
  onStatus: (lote: CampoLoteListItem) => void;
};

const superficieFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 4,
});

function superficieLabel(superficie: number) {
  return `${superficieFormatter.format(superficie)} ha`;
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>;
}

function LoteActions({
  lote,
  disabled,
  onEdit,
  onStatus,
}: {
  lote: CampoLoteListItem;
  disabled: boolean;
  onEdit: (lote: CampoLoteListItem) => void;
  onStatus: (lote: CampoLoteListItem) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onEdit(lote)}>
        <Pencil className="h-4 w-4" />
        Editar
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onStatus(lote)}>
        {lote.activo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        {lote.activo ? "Desactivar" : "Reactivar"}
      </Button>
    </div>
  );
}

export function LotesList({ lotes, canManage, actionsDisabled, onEdit, onStatus }: LotesListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [estado, setEstado] = useState<CampoEstadoFilter>("activos");

  const lotesFiltrados = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("es");

    return lotes.filter((lote) => {
      const matchesEstado =
        estado === "todos" || (estado === "activos" ? lote.activo : !lote.activo);
      const searchable = [lote.nombre, lote.codigo_interno, lote.observaciones]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es");

      return matchesEstado && (!term || searchable.includes(term));
    });
  }, [estado, lotes, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre, código u observaciones"
            aria-label="Buscar lotes"
            className="pl-9"
          />
        </div>
        <Select value={estado} onValueChange={(value) => setEstado(value as CampoEstadoFilter)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar lotes por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {lotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="font-semibold">No hay lotes registrados</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Este establecimiento todavía no tiene lotes disponibles.
            </p>
          </CardContent>
        </Card>
      ) : lotesFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="font-semibold">No se encontraron lotes</h2>
            <p className="mt-2 text-sm text-muted-foreground">Probá con otros filtros de búsqueda.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:hidden">
            {lotesFiltrados.map((lote) => (
              <Card key={lote.id}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-lg">{lote.nombre}</CardTitle>
                    <EstadoBadge activo={lote.activo} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {lote.codigo_interno || "Sin código interno"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <span className="block text-muted-foreground">Superficie</span>
                    {superficieLabel(lote.superficie_ha)}
                  </div>
                  {canManage && (
                    <div className="pt-2">
                      <LoteActions lote={lote} disabled={actionsDisabled} onEdit={onEdit} onStatus={onStatus} />
                    </div>
                  )}
                  <div>
                    <span className="block text-muted-foreground">Observaciones</span>
                    <span className="whitespace-pre-wrap">{lote.observaciones || "Sin informar"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Superficie</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead>Estado</TableHead>
                    {canManage && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotesFiltrados.map((lote) => (
                    <TableRow key={lote.id}>
                      <TableCell className="font-medium">{lote.nombre}</TableCell>
                      <TableCell>{lote.codigo_interno || "—"}</TableCell>
                      <TableCell>{superficieLabel(lote.superficie_ha)}</TableCell>
                      <TableCell className="max-w-sm whitespace-pre-wrap">{lote.observaciones || "Sin informar"}</TableCell>
                      <TableCell><EstadoBadge activo={lote.activo} /></TableCell>
                      {canManage && (
                        <TableCell>
                          <LoteActions lote={lote} disabled={actionsDisabled} onEdit={onEdit} onStatus={onStatus} />
                        </TableCell>
                      )}
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
