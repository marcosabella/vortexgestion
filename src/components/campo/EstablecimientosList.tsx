import { useMemo, useState } from "react";
import { Pencil, Plus, Power, PowerOff, Search, Sprout } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoEstablecimientos, useSetCampoEstablecimientoStatus } from "@/hooks/useCampoEstablecimientos";
import type { CampoEstablecimientoListItem, CampoEstadoFilter } from "@/types/campo";
import { EstablecimientoForm } from "@/components/campo/EstablecimientoForm";

type EstablecimientosListProps = {
  comercioId: string | null;
  comercioNombre: string | null;
  isComercioLoading: boolean;
};

const superficieFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 4,
});

function clienteNombre(establecimiento: CampoEstablecimientoListItem) {
  if (!establecimiento.cliente) return "Cliente no disponible";
  return [establecimiento.cliente.nombre, establecimiento.cliente.apellido]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function superficieLabel(superficie: number | null) {
  return superficie === null ? "Sin informar" : `${superficieFormatter.format(superficie)} ha`;
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>;
}

type EstablecimientoActionsProps = {
  establecimiento: CampoEstablecimientoListItem;
  disabled: boolean;
  onEdit: (establecimiento: CampoEstablecimientoListItem) => void;
  onStatus: (establecimiento: CampoEstablecimientoListItem) => void;
};

function EstablecimientoActions({ establecimiento, disabled, onEdit, onStatus }: EstablecimientoActionsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onEdit(establecimiento)}>
        <Pencil className="h-4 w-4" />
        Editar
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onStatus(establecimiento)}>
        {establecimiento.activo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        {establecimiento.activo ? "Desactivar" : "Reactivar"}
      </Button>
    </div>
  );
}

export function EstablecimientosList({ comercioId, comercioNombre, isComercioLoading }: EstablecimientosListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [estado, setEstado] = useState<CampoEstadoFilter>("activos");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEstablecimiento, setEditingEstablecimiento] = useState<CampoEstablecimientoListItem | null>(null);
  const [statusEstablecimiento, setStatusEstablecimiento] = useState<CampoEstablecimientoListItem | null>(null);
  const access = useCampoAccess(comercioId);
  const establecimientosQuery = useCampoEstablecimientos(comercioId, access.perteneceAlComercio);
  const setStatus = useSetCampoEstablecimientoStatus(comercioId, access.perteneceAlComercio && access.isAdmin);

  const closeEditDialog = () => setEditingEstablecimiento(null);
  const confirmStatusChange = async () => {
    if (!statusEstablecimiento) return;
    try {
      await setStatus.mutateAsync({
        establecimientoId: statusEstablecimiento.id,
        nuevoEstado: !statusEstablecimiento.activo,
      });
      setStatusEstablecimiento(null);
    } catch {
      // El hook muestra un mensaje seguro y la confirmación permanece abierta.
    }
  };

  const establecimientos = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("es");

    return (establecimientosQuery.data ?? []).filter((establecimiento) => {
      const matchesEstado =
        estado === "todos" ||
        (estado === "activos" ? establecimiento.activo : !establecimiento.activo);
      const searchable = [
        establecimiento.nombre,
        establecimiento.codigo_interno,
        clienteNombre(establecimiento),
        establecimiento.localidad,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es");

      return matchesEstado && (!term || searchable.includes(term));
    });
  }, [establecimientosQuery.data, estado, searchTerm]);

  const isLoading =
    isComercioLoading ||
    access.isLoading ||
    (access.perteneceAlComercio && establecimientosQuery.isLoading);
  const roleLabel = access.isAdmin ? "Administrador" : access.perteneceAlComercio ? "Solo lectura" : "Sin acceso";

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <Sprout className="h-7 w-7" />
            Establecimientos
          </h1>
          <p className="mt-1 text-muted-foreground">
            {comercioNombre ? `Comercio activo: ${comercioNombre}` : "Establecimientos del comercio activo"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && <Badge variant="outline">{roleLabel}</Badge>}
          {!isLoading && comercioId && access.perteneceAlComercio && access.isAdmin && (
            <Button variant="new" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Nuevo establecimiento
            </Button>
          )}
        </div>
      </div>

      {comercioId && access.perteneceAlComercio && access.isAdmin && (
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuevo establecimiento</DialogTitle>
            </DialogHeader>
            <EstablecimientoForm
              mode="create"
              comercioId={comercioId}
              hasAccess={access.perteneceAlComercio}
              isAdmin={access.isAdmin}
              onSuccess={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {comercioId && access.perteneceAlComercio && access.isAdmin && (
        <Dialog
          open={Boolean(editingEstablecimiento)}
          onOpenChange={(open) => {
            if (!open) closeEditDialog();
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar establecimiento</DialogTitle>
            </DialogHeader>
            {editingEstablecimiento && (
              <EstablecimientoForm
                key={editingEstablecimiento.id}
                mode="edit"
                comercioId={comercioId}
                hasAccess={access.perteneceAlComercio}
                isAdmin={access.isAdmin}
                establecimiento={editingEstablecimiento}
                onSuccess={closeEditDialog}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {comercioId && access.perteneceAlComercio && access.isAdmin && (
        <AlertDialog
          open={Boolean(statusEstablecimiento)}
          onOpenChange={(open) => {
            if (!open && !setStatus.isPending) setStatusEstablecimiento(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {statusEstablecimiento?.activo ? "Desactivar establecimiento" : "Reactivar establecimiento"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {statusEstablecimiento?.activo
                  ? "¿Desactivar este establecimiento? Permanecerá guardado y podrá reactivarse."
                  : "¿Reactivar este establecimiento?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={setStatus.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={setStatus.isPending} onClick={(event) => { event.preventDefault(); void confirmStatusChange(); }}>
                {setStatus.isPending ? "Guardando..." : statusEstablecimiento?.activo ? "Desactivar" : "Reactivar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre, código, cliente o localidad"
            aria-label="Buscar establecimientos"
            className="pl-9"
          />
        </div>
        <Select value={estado} onValueChange={(value) => setEstado(value as CampoEstadoFilter)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Cargando establecimientos...</CardContent></Card>
      ) : access.error ? (
        <Card><CardContent className="py-12 text-center text-destructive">No se pudieron cargar los establecimientos. Verificá tu acceso al comercio e intentá nuevamente.</CardContent></Card>
      ) : !comercioId ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hay un comercio activo seleccionado.</CardContent></Card>
      ) : !access.perteneceAlComercio ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Sin acceso</CardContent></Card>
      ) : establecimientosQuery.error ? (
        <Card><CardContent className="py-12 text-center text-destructive">No se pudieron cargar los establecimientos. Verificá tu acceso al comercio e intentá nuevamente.</CardContent></Card>
      ) : establecimientos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="font-semibold">No se encontraron establecimientos</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {searchTerm || estado !== "todos" ? "Probá con otros filtros de búsqueda." : "Todavía no hay establecimientos disponibles."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:hidden">
            {establecimientos.map((establecimiento) => (
              <Card key={establecimiento.id}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-lg">{establecimiento.nombre}</CardTitle>
                    <EstadoBadge activo={establecimiento.activo} />
                  </div>
                  <p className="text-sm text-muted-foreground">{establecimiento.codigo_interno || "Sin código interno"}</p>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="block text-muted-foreground">Cliente</span>{clienteNombre(establecimiento)}</div>
                  <div><span className="block text-muted-foreground">Localidad</span>{establecimiento.localidad || "Sin informar"}</div>
                  <div className="col-span-2"><span className="block text-muted-foreground">Superficie total</span>{superficieLabel(establecimiento.superficie_total_ha)}</div>
                  {access.isAdmin && (
                    <div className="col-span-2 pt-2">
                      <EstablecimientoActions establecimiento={establecimiento} disabled={setStatus.isPending} onEdit={setEditingEstablecimiento} onStatus={setStatusEstablecimiento} />
                    </div>
                  )}
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
                    <TableHead>Cliente</TableHead>
                    <TableHead>Localidad</TableHead>
                    <TableHead>Superficie total</TableHead>
                    <TableHead>Estado</TableHead>
                    {access.isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {establecimientos.map((establecimiento) => (
                    <TableRow key={establecimiento.id}>
                      <TableCell className="font-medium">{establecimiento.nombre}</TableCell>
                      <TableCell>{establecimiento.codigo_interno || "—"}</TableCell>
                      <TableCell>{clienteNombre(establecimiento)}</TableCell>
                      <TableCell>{establecimiento.localidad || "Sin informar"}</TableCell>
                      <TableCell>{superficieLabel(establecimiento.superficie_total_ha)}</TableCell>
                      <TableCell><EstadoBadge activo={establecimiento.activo} /></TableCell>
                      {access.isAdmin && (
                        <TableCell>
                          <EstablecimientoActions establecimiento={establecimiento} disabled={setStatus.isPending} onEdit={setEditingEstablecimiento} onStatus={setStatusEstablecimiento} />
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
