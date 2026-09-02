import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrdenDetalle } from "@/components/campo/OrdenDetalle";
import { OrdenForm } from "@/components/campo/OrdenForm";
import { OrdenLaborForm } from "@/components/campo/OrdenLaborForm";
import { OrdenLaboresList } from "@/components/campo/OrdenLaboresList";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoOrdenDetalle } from "@/hooks/useCampoOrdenDetalle";
import { useCampoOrdenLabores } from "@/hooks/useCampoOrdenLabores";
import { useComercio } from "@/hooks/useComercio";
import { isCampoUuid } from "@/utils/campo";

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
  const canEdit = Boolean(orden && access.isAdmin && orden.estado === "borrador");
  const canCreateLabor = Boolean(canEdit && orden?.establecimiento?.activo === true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEditPending, setIsEditPending] = useState(false);
  const [isLaborOpen, setIsLaborOpen] = useState(false);
  const [isLaborPending, setIsLaborPending] = useState(false);
  const closeEdit = useCallback(() => setIsEditOpen(false), []);
  const closeLabor = useCallback(() => setIsLaborOpen(false), []);

  useEffect(() => {
    setIsEditOpen(false);
    setIsEditPending(false);
    setIsLaborOpen(false);
    setIsLaborPending(false);
  }, [comercioId, ordenId]);

  useEffect(() => {
    if (!canEdit) setIsEditOpen(false);
  }, [canEdit]);

  useEffect(() => {
    if (!canCreateLabor) setIsLaborOpen(false);
  }, [canCreateLabor]);

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
    <>
      <OrdenDetalle orden={orden} canEdit={canEdit} onEdit={() => setIsEditOpen(true)} />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-6">
          <h2 className="text-xl font-semibold">Labores planificadas</h2>
          {canCreateLabor && <Button type="button" variant="success" onClick={() => setIsLaborOpen(true)}><Plus className="h-4 w-4" />Nueva labor</Button>}
        </div>
        <CardContent className="pt-6">
          {orden.establecimiento?.activo === false && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No pueden agregarse labores mientras el establecimiento esté inactivo.</p>}
          {laboresQuery.isLoading ? <p className="py-8 text-center text-muted-foreground">Cargando labores...</p>
            : laboresQuery.error ? <p className="py-8 text-center text-destructive">No se pudieron cargar las labores.</p>
              : <OrdenLaboresList comercioId={comercioId} ordenId={ordenId} hasAccess={hasConfirmedAccess} isAdmin={access.isAdmin} orden={orden} labores={labores ?? []} />}
        </CardContent>
      </Card>
    </>
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
    </div>
  );
}
