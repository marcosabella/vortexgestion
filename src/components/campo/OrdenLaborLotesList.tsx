import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrdenLaborLoteForm } from "@/components/campo/OrdenLaborLoteForm";
import { useCampoLotes } from "@/hooks/useCampoLotes";
import { useCampoOrdenLaborLotes } from "@/hooks/useCampoOrdenLaborLotes";
import type { CampoOrdenDetail, CampoOrdenLaborListItem, CampoOrdenLaborUnidad } from "@/types/campo";

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
};

export function OrdenLaborLotesList({ comercioId, ordenId, hasAccess, isAdmin, orden, labor }: OrdenLaborLotesListProps) {
  const assignmentsQuery = useCampoOrdenLaborLotes(comercioId, ordenId, labor.id, hasAccess, orden, labor);
  const assignments = hasAccess && orden.id === ordenId && labor.orden_id === ordenId ? assignmentsQuery.data : undefined;
  const canCreateBase = hasAccess && isAdmin && orden.estado === "borrador" && orden.establecimiento?.activo === true && labor.activo;
  const lotsQuery = useCampoLotes(comercioId, orden.establecimiento_id, canCreateBase, Boolean(orden.establecimiento));
  const authorizedLots = useMemo(() => canCreateBase ? lotsQuery.data ?? [] : [], [canCreateBase, lotsQuery.data]);
  const assignedIds = useMemo(() => new Set((assignments ?? []).map((item) => item.lote_id)), [assignments]);
  const availableLots = useMemo(() => authorizedLots.filter((lote) => lote.activo && !assignedIds.has(lote.id)), [assignedIds, authorizedLots]);
  const canCreate = canCreateBase && !assignmentsQuery.isLoading && !assignmentsQuery.error && !lotsQuery.isLoading && !lotsQuery.error && availableLots.length > 0;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
    setPending(false);
  }, [comercioId, ordenId, labor.id, hasAccess]);

  useEffect(() => {
    if (!canCreate) setOpen(false);
  }, [canCreate]);

  return (
    <section className="space-y-3 rounded-md border bg-muted/20 p-3" aria-labelledby={`labor-lotes-${labor.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`labor-lotes-${labor.id}`} className="font-medium">Lotes asignados</h4>
        {canCreate && <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Asignar lote</Button>}
      </div>

      {assignmentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Cargando lotes asignados...</p>
        : assignmentsQuery.error ? <p className="text-sm text-destructive">No se pudieron cargar los lotes asignados.</p>
          : (assignments ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Esta labor todavía no tiene lotes asignados.</p>
            : <div className="grid gap-3 lg:grid-cols-2">{(assignments ?? []).map((assignment) => (
              <Card key={assignment.id} className="shadow-none">
                <CardContent className="grid grid-cols-2 gap-2 p-3 text-sm">
                  <div className="col-span-2 flex items-start justify-between gap-2"><span className="font-medium">{assignment.lote?.nombre ?? "Lote no disponible"}</span><Badge variant={assignment.activo ? "default" : "secondary"}>{assignment.activo ? "Activa" : "Inactiva"}</Badge></div>
                  <div><span className="block text-muted-foreground">Código</span>{assignment.lote?.codigo_interno || "Sin código"}</div>
                  <div><span className="block text-muted-foreground">Cantidad</span>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(assignment.cantidad_planificada)} {unidadCorta[labor.unidad as CampoOrdenLaborUnidad] ?? labor.unidad}</div>
                  <div><span className="block text-muted-foreground">Superficie</span>{assignment.lote ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(assignment.lote.superficie_ha)} ha` : "No disponible"}</div>
                  <div className="col-span-2"><span className="block text-muted-foreground">Observaciones</span><p className="whitespace-pre-wrap">{assignment.observaciones || "Sin observaciones"}</p></div>
                  {assignment.lote?.activo === false && <p className="col-span-2 text-xs text-amber-700">El lote actualmente está inactivo.</p>}
                </CardContent>
              </Card>
            ))}</div>}

      {canCreateBase && !lotsQuery.isLoading && !lotsQuery.error && availableLots.length === 0 && <p className="text-sm text-muted-foreground">No hay lotes activos disponibles para asignar.</p>}
      {canCreateBase && lotsQuery.error && <p className="text-sm text-destructive">No se pudieron cargar los lotes disponibles.</p>}

      {canCreate && (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!pending) setOpen(nextOpen); }}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
            <DialogHeader><DialogTitle>Asignar lote a {labor.nombre}</DialogTitle></DialogHeader>
            <OrdenLaborLoteForm
              key={`${labor.id}-${labor.unidad}`}
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
    </section>
  );
}
