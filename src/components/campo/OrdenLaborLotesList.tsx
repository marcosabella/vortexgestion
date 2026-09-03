import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrdenLaborLoteForm } from "@/components/campo/OrdenLaborLoteForm";
import { useCampoLotes } from "@/hooks/useCampoLotes";
import { useCampoOrdenLaborLotes, useSetCampoOrdenLaborLoteStatus } from "@/hooks/useCampoOrdenLaborLotes";
import type { CampoOrdenDetail, CampoOrdenLaborListItem, CampoOrdenLaborLoteListItem, CampoOrdenLaborUnidad } from "@/types/campo";

const unidadCorta: Record<CampoOrdenLaborUnidad, string> = {
  ha: "ha",
  hora: "horas",
  km: "km",
  tonelada: "t",
  unidad: "unidades",
  fijo: "fijo",
};

type OrdenLaborLotesListProps = {
  comercioId: string;
  ordenId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  labor: CampoOrdenLaborListItem;
  onPendingChange?: (pending: boolean) => void;
};

export function OrdenLaborLotesList({ comercioId, ordenId, hasAccess, isAdmin, orden, labor, onPendingChange }: OrdenLaborLotesListProps) {
  const assignmentsQuery = useCampoOrdenLaborLotes(comercioId, ordenId, labor.id, hasAccess, orden, labor);
  const assignments = hasAccess && orden.id === ordenId && labor.orden_id === ordenId ? assignmentsQuery.data : undefined;
  const canCreateBase = hasAccess && isAdmin && orden.estado === "borrador" && orden.establecimiento?.activo === true && labor.activo;
  const canWrite = hasAccess && isAdmin && orden.estado === "borrador" && orden.establecimiento?.activo === true;
  const lotsQuery = useCampoLotes(comercioId, orden.establecimiento_id, canCreateBase, Boolean(orden.establecimiento));
  const authorizedLots = useMemo(() => canCreateBase ? lotsQuery.data ?? [] : [], [canCreateBase, lotsQuery.data]);
  const assignedIds = useMemo(() => new Set((assignments ?? []).map((item) => item.lote_id)), [assignments]);
  const availableLots = useMemo(() => authorizedLots.filter((lote) => lote.activo && !assignedIds.has(lote.id)), [assignedIds, authorizedLots]);
  const canCreate = canCreateBase && !assignmentsQuery.isLoading && !assignmentsQuery.error && !lotsQuery.isLoading && !lotsQuery.error && availableLots.length > 0;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [editAssignment, setEditAssignment] = useState<CampoOrdenLaborLoteListItem | null>(null);
  const [statusAssignment, setStatusAssignment] = useState<CampoOrdenLaborLoteListItem | null>(null);
  const setStatus = useSetCampoOrdenLaborLoteStatus(comercioId, ordenId, hasAccess, isAdmin, orden, labor, statusAssignment);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
    setPending(false);
    setEditAssignment(null);
    setStatusAssignment(null);
  }, [comercioId, ordenId, labor.id, hasAccess]);

  useEffect(() => { onPendingChange?.(pending || setStatus.isPending); }, [onPendingChange, pending, setStatus.isPending]);

  useEffect(() => {
    if (!canCreate) setOpen(false);
  }, [canCreate]);

  const confirmStatus = async () => {
    if (!statusAssignment) return;
    try {
      await setStatus.mutateAsync({ asignacionId: statusAssignment.id, loteId: statusAssignment.lote_id, nuevoEstado: !statusAssignment.activo });
      setStatusAssignment(null);
    } catch {
      // El hook conserva la confirmación y muestra un mensaje seguro.
    }
  };

  return (
    <section className="space-y-3 rounded-md border bg-muted/20 p-3" aria-labelledby={`labor-lotes-${labor.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`labor-lotes-${labor.id}`} className="font-medium">Lotes asignados</h4>
        {canCreate && <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Asignar lote</Button>}
      </div>

      {assignmentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Cargando lotes asignados...</p>
        : assignmentsQuery.error ? <p className="text-sm text-destructive">No se pudieron cargar los lotes asignados.</p>
          : (assignments ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Esta labor todavía no tiene lotes asignados.</p>
            : <><div className="grid gap-3 md:hidden">{(assignments ?? []).map((assignment) => (
              <Card key={assignment.id} className="shadow-none">
                <CardContent className="grid grid-cols-2 gap-2 p-3 text-sm">
                  <div className="col-span-2 flex items-start justify-between gap-2"><span className="font-medium">{assignment.lote?.nombre ?? "Lote no disponible"}</span><Badge variant={assignment.activo ? "default" : "secondary"}>{assignment.activo ? "Activa" : "Inactiva"}</Badge></div>
                  <div><span className="block text-muted-foreground">Código</span>{assignment.lote?.codigo_interno || "Sin código"}</div>
                  <div><span className="block text-muted-foreground">Cantidad</span>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(assignment.cantidad_planificada)} {unidadCorta[labor.unidad as CampoOrdenLaborUnidad] ?? labor.unidad}</div>
                  <div><span className="block text-muted-foreground">Superficie</span>{assignment.lote ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(assignment.lote.superficie_ha)} ha` : "No disponible"}</div>
                  <div className="col-span-2"><span className="block text-muted-foreground">Observaciones</span><p className="whitespace-pre-wrap">{assignment.observaciones || "Sin observaciones"}</p></div>
                  {assignment.lote?.activo === false && <p className="col-span-2 text-xs text-amber-700">El lote actualmente está inactivo.</p>}
                  {canWrite && <div className="col-span-2 flex items-center justify-end gap-3 pt-1">
                    {labor.activo && <Button type="button" size="icon" variant="outline" onClick={() => setEditAssignment(assignment)} aria-label={`Editar asignación del lote ${assignment.lote?.nombre ?? "no disponible"}`} title="Editar asignación"><Pencil className="h-4 w-4" /></Button>}
                    {(assignment.activo || (labor.activo && assignment.lote?.activo === true)) && <Switch checked={assignment.activo} onCheckedChange={() => setStatusAssignment(assignment)} disabled={setStatus.isPending} aria-label={`${assignment.activo ? "Desactivar" : "Reactivar"} asignación del lote ${assignment.lote?.nombre ?? "no disponible"}`} />}
                  </div>}
                </CardContent>
              </Card>
            ))}</div><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Código</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Superficie</TableHead><TableHead>Observaciones</TableHead><TableHead>Estado</TableHead>{canWrite && <TableHead className="text-right">Acciones</TableHead>}</TableRow></TableHeader><TableBody>{(assignments ?? []).map((assignment) => <TableRow key={assignment.id}><TableCell className="font-medium">{assignment.lote?.nombre ?? "Lote no disponible"}{assignment.lote?.activo === false && <p className="text-xs text-amber-700">Lote inactivo</p>}</TableCell><TableCell>{assignment.lote?.codigo_interno || "Sin código"}</TableCell><TableCell className="text-right">{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(assignment.cantidad_planificada)} {unidadCorta[labor.unidad as CampoOrdenLaborUnidad] ?? labor.unidad}</TableCell><TableCell className="text-right">{assignment.lote ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(assignment.lote.superficie_ha)} ha` : "—"}</TableCell><TableCell className="max-w-xs whitespace-pre-wrap">{assignment.observaciones || "—"}</TableCell><TableCell><Badge variant={assignment.activo ? "default" : "secondary"}>{assignment.activo ? "Activa" : "Inactiva"}</Badge></TableCell>{canWrite && <TableCell><div className="flex items-center justify-end gap-3">{labor.activo && <Button type="button" size="icon" variant="outline" onClick={() => setEditAssignment(assignment)} aria-label={`Editar asignación del lote ${assignment.lote?.nombre ?? "no disponible"}`} title="Editar asignación"><Pencil className="h-4 w-4" /></Button>}{(assignment.activo || (labor.activo && assignment.lote?.activo === true)) && <Switch checked={assignment.activo} onCheckedChange={() => setStatusAssignment(assignment)} disabled={setStatus.isPending} aria-label={`${assignment.activo ? "Desactivar" : "Reactivar"} asignación del lote ${assignment.lote?.nombre ?? "no disponible"}`} />}</div></TableCell>}</TableRow>)}</TableBody></Table></div></>}

      {canCreateBase && !lotsQuery.isLoading && !lotsQuery.error && availableLots.length === 0 && <p className="text-sm text-muted-foreground">No hay lotes activos disponibles para asignar.</p>}
      {canCreateBase && lotsQuery.error && <p className="text-sm text-destructive">No se pudieron cargar los lotes disponibles.</p>}

      {canCreate && (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!pending) setOpen(nextOpen); }}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
            <DialogHeader><DialogTitle>Asignar lote a {labor.nombre}</DialogTitle></DialogHeader>
            <OrdenLaborLoteForm
              key={`${labor.id}-${labor.unidad}`}
              mode="create"
              comercioId={comercioId}
              ordenId={ordenId}
              hasAccess={hasAccess}
              isAdmin={isAdmin}
              orden={orden}
              labor={labor}
              lotesAutorizados={authorizedLots}
              lotesDisponibles={availableLots}
              asignaciones={assignments ?? []}
              onSuccess={close}
              onCancel={close}
              onSavingChange={setPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {canWrite && editAssignment && labor.activo && (
        <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen && !pending) setEditAssignment(null); }}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
            <DialogHeader><DialogTitle>Editar asignación</DialogTitle></DialogHeader>
            <OrdenLaborLoteForm mode="edit" comercioId={comercioId} ordenId={ordenId} hasAccess={hasAccess} isAdmin={isAdmin} orden={orden} labor={labor} lotesAutorizados={authorizedLots} lotesDisponibles={availableLots} asignaciones={assignments ?? []} asignacion={editAssignment} onSuccess={() => setEditAssignment(null)} onCancel={() => setEditAssignment(null)} onSavingChange={setPending} />
          </DialogContent>
        </Dialog>
      )}

      {canWrite && statusAssignment && (
        <AlertDialog open onOpenChange={(nextOpen) => { if (!nextOpen && !setStatus.isPending) setStatusAssignment(null); }}>
          <AlertDialogContent onEscapeKeyDown={(event) => { if (setStatus.isPending) event.preventDefault(); }} onInteractOutside={(event) => { if (setStatus.isPending) event.preventDefault(); }}>
            <AlertDialogHeader><AlertDialogTitle>{statusAssignment.activo ? "Desactivar asignación" : "Reactivar asignación"}</AlertDialogTitle><AlertDialogDescription>{statusAssignment.activo ? "¿Desactivar esta asignación? Permanecerá guardada." : "¿Reactivar esta asignación?"}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel disabled={setStatus.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={setStatus.isPending} onClick={(event) => { event.preventDefault(); void confirmStatus(); }}>{setStatus.isPending ? "Guardando..." : "Confirmar"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
