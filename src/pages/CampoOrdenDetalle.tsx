import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrdenDetalle } from "@/components/campo/OrdenDetalle";
import { OrdenForm } from "@/components/campo/OrdenForm";
import { OrdenLaborForm } from "@/components/campo/OrdenLaborForm";
import { OrdenLaboresList } from "@/components/campo/OrdenLaboresList";
import { PartesList } from "@/components/campo/PartesList";
import { OrdenAvance } from "@/components/campo/OrdenAvance";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoOrdenDetalle, useSetCampoOrdenStatus } from "@/hooks/useCampoOrdenDetalle";
import { useCampoOrdenLabores } from "@/hooks/useCampoOrdenLabores";
import { useComercio } from "@/hooks/useComercio";
import { useCampoPartes } from "@/hooks/useCampoPartes";
import { isCampoUuid } from "@/utils/campo";
import type { CampoOrdenTransitionState } from "@/types/campo";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function PageMessage({ children, destructive = false }: { children: React.ReactNode; destructive?: boolean }) {
  return <Card><CardContent className={`py-12 text-center ${destructive ? "text-destructive" : "text-muted-foreground"}`}>{children}</CardContent></Card>;
}

export default function CampoOrdenDetalle() {
  const navigate = useNavigate();
  const { ordenId } = useParams<{ ordenId: string }>();
  const idValido = isCampoUuid(ordenId);
  const { comercio, isLoading: isComercioLoading } = useComercio();
  const comercioId = comercio?.id ?? null;
  const access = useCampoAccess(comercioId);
  const hasConfirmedAccess = access.perteneceAlComercio && !access.isLoading && !access.error;
  const ordenQuery = useCampoOrdenDetalle(comercioId, ordenId, hasConfirmedAccess && idValido);
  const orden = hasConfirmedAccess && idValido ? ordenQuery.data : null;
  const laboresQuery = useCampoOrdenLabores(comercioId, ordenId, hasConfirmedAccess && idValido, orden);
  const labores = hasConfirmedAccess && orden ? laboresQuery.data : undefined;
  const partesQuery = useCampoPartes(comercioId, ordenId, hasConfirmedAccess && idValido, orden);
  const setOrdenStatus = useSetCampoOrdenStatus(comercioId, ordenId, hasConfirmedAccess, access.isAdmin, orden);
  const actionsAdmin = access.isAdmin && !setOrdenStatus.isPending;
  const canEdit = Boolean(orden && actionsAdmin && orden.estado === "borrador");
  const canCreateLabor = Boolean(canEdit && orden?.establecimiento?.activo === true);
  const canPlan = Boolean(orden && actionsAdmin && orden.estado === "borrador" && orden.establecimiento?.activo === true);
  const canReopen = Boolean(orden && actionsAdmin && orden.estado === "planificada");
  const canFinalize = Boolean(orden && actionsAdmin && orden.estado === "en_progreso");
  const canCancel = Boolean(orden && actionsAdmin && ["planificada", "en_progreso"].includes(orden.estado));
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEditPending, setIsEditPending] = useState(false);
  const [isLaborOpen, setIsLaborOpen] = useState(false);
  const [isLaborPending, setIsLaborPending] = useState(false);
  const [targetStatus, setTargetStatus] = useState<CampoOrdenTransitionState | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [activeTab, setActiveTab] = useState("orden");
  const closeEdit = useCallback(() => setIsEditOpen(false), []);
  const closeLabor = useCallback(() => setIsLaborOpen(false), []);

  useEffect(() => {
    setIsEditOpen(false);
    setIsEditPending(false);
    setIsLaborOpen(false);
    setIsLaborPending(false);
    setTargetStatus(null);
    setActiveTab("orden");
  }, [comercioId, ordenId]);

  useEffect(() => {
    if (!canEdit) setIsEditOpen(false);
  }, [canEdit]);

  useEffect(() => {
    if (!canCreateLabor) setIsLaborOpen(false);
  }, [canCreateLabor]);

  const confirmStatusChange = async () => {
    if (!orden || !targetStatus || setOrdenStatus.isPending) return;
    try {
      await setOrdenStatus.mutateAsync({ estadoActual: orden.estado as "borrador" | "planificada" | "en_progreso", nuevoEstado: targetStatus, motivo: statusReason });
      setTargetStatus(null);
    } catch {
      // El hook conserva la confirmación abierta y muestra un mensaje seguro.
    }
  };

  let content: React.ReactNode;
  if (isComercioLoading) content = <PageMessage>Cargando comercio...</PageMessage>;
  else if (!comercioId) content = <PageMessage>No hay un comercio activo seleccionado.</PageMessage>;
  else if (!idValido) content = <PageMessage>El identificador de la orden no es válido.</PageMessage>;
  else if (access.isLoading) content = <PageMessage>Verificando acceso...</PageMessage>;
  else if (access.error) content = <PageMessage destructive>No se pudo verificar el acceso. Intentá nuevamente.</PageMessage>;
  else if (!access.perteneceAlComercio) content = <PageMessage>Sin acceso</PageMessage>;
  else if (ordenQuery.isLoading) content = <PageMessage>Cargando orden...</PageMessage>;
  else if (ordenQuery.error) content = <PageMessage destructive>No se pudo cargar la orden. Intentá nuevamente.</PageMessage>;
  else if (!orden) content = <PageMessage>Orden no encontrada o sin acceso.</PageMessage>;
  else content = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <div className="overflow-x-auto pb-1"><TabsList className="inline-flex h-auto min-w-max justify-start"><TabsTrigger value="orden">Orden</TabsTrigger><TabsTrigger value="labores">Labores planificadas</TabsTrigger><TabsTrigger value="partes">Partes de trabajo</TabsTrigger><TabsTrigger value="avance">Resumen de avance</TabsTrigger></TabsList></div>
      <TabsContent value="orden" forceMount className="data-[state=inactive]:hidden">
        <OrdenDetalle orden={orden} canEdit={canEdit} onEdit={() => setIsEditOpen(true)} canPlan={canPlan} canReopen={canReopen} onPlan={() => setTargetStatus("planificada")} onReopen={() => setTargetStatus("borrador")} canFinalize={canFinalize} canCancel={canCancel} onFinalize={() => setTargetStatus("finalizada")} onCancel={() => setTargetStatus("cancelada")} />
      </TabsContent>
      <TabsContent value="labores" forceMount className="data-[state=inactive]:hidden"><Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-6">
          <h2 className="text-xl font-semibold">Labores planificadas</h2>
          {canCreateLabor && <Button type="button" variant="success" onClick={() => setIsLaborOpen(true)}><Plus className="h-4 w-4" />Nueva labor</Button>}
        </div>
        <CardContent className="pt-6">
          {orden.establecimiento?.activo === false && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No pueden agregarse labores mientras el establecimiento esté inactivo.</p>}
          {laboresQuery.isLoading ? <p className="py-8 text-center text-muted-foreground">Cargando labores...</p>
            : laboresQuery.error ? <p className="py-8 text-center text-destructive">No se pudieron cargar las labores.</p>
              : <OrdenLaboresList comercioId={comercioId} ordenId={ordenId} hasAccess={hasConfirmedAccess} isAdmin={actionsAdmin} orden={orden} labores={labores ?? []} />}
        </CardContent>
      </Card></TabsContent>
      <TabsContent value="partes" forceMount className="data-[state=inactive]:hidden"><PartesList comercioId={comercioId} orden={orden} labores={labores ?? []} partes={partesQuery.data ?? []} isAdmin={access.isAdmin} access={hasConfirmedAccess} isLoading={partesQuery.isLoading} hasError={Boolean(partesQuery.error)} /></TabsContent>
      <TabsContent value="avance" forceMount className="data-[state=inactive]:hidden"><OrdenAvance comercioId={comercioId} ordenId={ordenId!} access={hasConfirmedAccess} orden={orden} /></TabsContent>
    </Tabs>
  );

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/campo/ordenes")}><ArrowLeft className="h-4 w-4" />Volver a órdenes</Button>
        {hasConfirmedAccess && <Badge variant="outline">{access.isAdmin ? "Administrador" : "Solo lectura"}</Badge>}
      </div>
      {content}

      {canEdit && comercioId && orden && (
        <Dialog open={isEditOpen} onOpenChange={(open) => { if (!isEditPending) setIsEditOpen(open); }}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onEscapeKeyDown={(event) => { if (isEditPending) event.preventDefault(); }} onInteractOutside={(event) => { if (isEditPending) event.preventDefault(); }}>
            <DialogHeader><DialogTitle>Editar cabecera</DialogTitle></DialogHeader>
            <OrdenForm
              key={orden.id}
              mode="edit"
              comercioId={comercioId}
              hasAccess={hasConfirmedAccess}
              isAdmin={access.isAdmin}
              orden={orden}
              onSuccess={closeEdit}
              onCancel={closeEdit}
              onSavingChange={setIsEditPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {canCreateLabor && comercioId && ordenId && orden && (
        <Dialog open={isLaborOpen} onOpenChange={(open) => { if (!isLaborPending) setIsLaborOpen(open); }}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onEscapeKeyDown={(event) => { if (isLaborPending) event.preventDefault(); }} onInteractOutside={(event) => { if (isLaborPending) event.preventDefault(); }}>
            <DialogHeader><DialogTitle>Nueva labor</DialogTitle></DialogHeader>
            <OrdenLaborForm
              key={orden.id}
              mode="create"
              comercioId={comercioId}
              ordenId={ordenId}
              hasAccess={hasConfirmedAccess}
              isAdmin={access.isAdmin}
              orden={orden}
              onSuccess={closeLabor}
              onCancel={closeLabor}
              onSavingChange={setIsLaborPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {orden && targetStatus && (
        <AlertDialog open onOpenChange={(open) => { if (!open && !setOrdenStatus.isPending) { setTargetStatus(null); setStatusReason(""); } }}>
          <AlertDialogContent onEscapeKeyDown={(event) => { if (setOrdenStatus.isPending) event.preventDefault(); }} onInteractOutside={(event) => { if (setOrdenStatus.isPending) event.preventDefault(); }}>
            <AlertDialogHeader>
              <AlertDialogTitle>{targetStatus === "finalizada" ? "¿Finalizar esta orden?" : targetStatus === "cancelada" ? "¿Cancelar esta orden?" : targetStatus === "planificada" ? "¿Planificar esta orden?" : "¿Reabrir esta orden como borrador?"}</AlertDialogTitle>
              <AlertDialogDescription>{targetStatus === "finalizada" ? "No debe haber partes borrador." : targetStatus === "cancelada" ? "No debe haber partes borrador y conservará todo el historial." : "La transición conservará los datos existentes."}</AlertDialogDescription>
            </AlertDialogHeader>
            {targetStatus === "cancelada" && <Input value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="Motivo obligatorio" />}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={setOrdenStatus.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={setOrdenStatus.isPending || (targetStatus === "cancelada" && !statusReason.trim())} onClick={(event) => { event.preventDefault(); void confirmStatusChange(); }}>{setOrdenStatus.isPending ? "Guardando..." : "Confirmar"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
