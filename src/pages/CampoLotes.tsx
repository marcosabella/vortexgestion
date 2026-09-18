import { useEffect, useState } from "react";
import { ArrowLeft, Info, Plus, Rows3 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoteForm } from "@/components/campo/LoteForm";
import { LotesList } from "@/components/campo/LotesList";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoEstablecimiento } from "@/hooks/useCampoEstablecimientos";
import { useCampoLotes, useSetCampoLoteStatus } from "@/hooks/useCampoLotes";
import { useComercio } from "@/hooks/useComercio";
import type { CampoEstablecimientoDetail, CampoLoteListItem } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

function clienteNombre(establecimiento: CampoEstablecimientoDetail) {
  if (!establecimiento.cliente) return "Cliente no disponible";
  return [establecimiento.cliente.nombre, establecimiento.cliente.apellido]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function PageMessage({ children, destructive = false }: { children: React.ReactNode; destructive?: boolean }) {
  return (
    <Card>
      <CardContent className={`py-12 text-center ${destructive ? "text-destructive" : "text-muted-foreground"}`}>
        {children}
      </CardContent>
    </Card>
  );
}

export default function CampoLotes() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingLote, setEditingLote] = useState<CampoLoteListItem | null>(null);
  const [statusLote, setStatusLote] = useState<CampoLoteListItem | null>(null);
  const navigate = useNavigate();
  const { establecimientoId } = useParams<{ establecimientoId: string }>();
  const idValido = isCampoUuid(establecimientoId);
  const { comercio, isLoading: isComercioLoading } = useComercio();
  const comercioId = comercio?.id ?? null;
  const access = useCampoAccess(comercioId);
  const establecimientoQuery = useCampoEstablecimiento(
    comercioId,
    establecimientoId,
    access.perteneceAlComercio && idValido,
  );
  const establecimientoAutorizado = Boolean(establecimientoQuery.data);
  const establecimientoActivo = Boolean(establecimientoQuery.data?.activo);
  const lotesQuery = useCampoLotes(
    comercioId,
    establecimientoId,
    access.perteneceAlComercio,
    establecimientoAutorizado,
  );
  const canManage =
    idValido &&
    access.perteneceAlComercio &&
    access.isAdmin &&
    establecimientoAutorizado &&
    establecimientoActivo;
  const setLoteStatus = useSetCampoLoteStatus(
    comercioId,
    establecimientoId,
    access.perteneceAlComercio,
    access.isAdmin,
    establecimientoAutorizado,
    establecimientoActivo,
  );

  useEffect(() => {
    setIsCreateDialogOpen(false);
    setEditingLote(null);
    setStatusLote(null);
  }, [comercioId, establecimientoId]);

  useEffect(() => {
    if (!canManage) {
      setIsCreateDialogOpen(false);
      setEditingLote(null);
      setStatusLote(null);
    }
  }, [canManage]);

  const confirmStatusChange = async () => {
    if (!statusLote) return;
    try {
      await setLoteStatus.mutateAsync({ loteId: statusLote.id, nuevoEstado: !statusLote.activo });
      setStatusLote(null);
    } catch {
      // El hook mantiene la confirmación abierta y muestra un toast seguro.
    }
  };

  let content: React.ReactNode;

  if (isComercioLoading) {
    content = <PageMessage>Cargando comercio...</PageMessage>;
  } else if (!comercioId) {
    content = <PageMessage>No hay un comercio activo seleccionado.</PageMessage>;
  } else if (!idValido) {
    content = <PageMessage>El identificador del establecimiento no es válido.</PageMessage>;
  } else if (access.isLoading) {
    content = <PageMessage>Verificando acceso...</PageMessage>;
  } else if (access.error) {
    content = <PageMessage destructive>No se pudo verificar el acceso. Intentá nuevamente.</PageMessage>;
  } else if (!access.perteneceAlComercio) {
    content = <PageMessage>Sin acceso</PageMessage>;
  } else if (establecimientoQuery.isLoading) {
    content = <PageMessage>Cargando establecimiento...</PageMessage>;
  } else if (establecimientoQuery.error) {
    content = <PageMessage destructive>No se pudo cargar el establecimiento. Intentá nuevamente.</PageMessage>;
  } else if (!establecimientoQuery.data) {
    content = <PageMessage>Establecimiento no encontrado o sin acceso.</PageMessage>;
  } else if (lotesQuery.isLoading) {
    content = <PageMessage>Cargando lotes...</PageMessage>;
  } else if (lotesQuery.error) {
    content = <PageMessage destructive>No se pudieron cargar los lotes. Intentá nuevamente.</PageMessage>;
  } else {
    const establecimiento = establecimientoQuery.data;
    content = (
      <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
              <Rows3 className="h-7 w-7 shrink-0" />
              Lotes
            </h1>
            <h2 className="mt-2 break-words text-xl font-semibold">{establecimiento.nombre}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {establecimiento.codigo_interno && <span>Código: {establecimiento.codigo_interno}</span>}
              <span>Cliente: {clienteNombre(establecimiento)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {establecimiento.activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
            <Badge variant="outline">{access.isAdmin ? "Administrador" : "Solo lectura"}</Badge>
            {canManage && (
              <Button type="button" variant="new" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Nuevo lote
              </Button>
            )}
          </div>
        </div>

        {canManage && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo lote</DialogTitle>
              </DialogHeader>
              <LoteForm
                mode="create"
                comercioId={comercioId}
                establecimientoId={establecimiento.id}
                hasAccess={access.perteneceAlComercio}
                isAdmin={access.isAdmin}
                establecimientoAutorizado={establecimientoAutorizado}
                establecimientoActivo={establecimiento.activo}
                onSuccess={() => setIsCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}

        {canManage && (
          <Dialog
            open={Boolean(editingLote)}
            onOpenChange={(open) => {
              if (!open) setEditingLote(null);
            }}
          >
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar lote</DialogTitle>
              </DialogHeader>
              {editingLote && (
                <LoteForm
                  key={editingLote.id}
                  mode="edit"
                  comercioId={comercioId}
                  establecimientoId={establecimiento.id}
                  hasAccess={access.perteneceAlComercio}
                  isAdmin={access.isAdmin}
                  establecimientoAutorizado={establecimientoAutorizado}
                  establecimientoActivo={establecimiento.activo}
                  lote={editingLote}
                  onSuccess={() => setEditingLote(null)}
                />
              )}
            </DialogContent>
          </Dialog>
        )}

        {canManage && (
          <AlertDialog
            open={Boolean(statusLote)}
            onOpenChange={(open) => {
              if (!open && !setLoteStatus.isPending) setStatusLote(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {statusLote?.activo ? "Desactivar lote" : "Reactivar lote"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {statusLote?.activo
                    ? "¿Desactivar este lote? Permanecerá guardado y podrá reactivarse."
                    : "¿Reactivar este lote?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={setLoteStatus.isPending}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={setLoteStatus.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    void confirmStatusChange();
                  }}
                >
                  {setLoteStatus.isPending ? "Guardando..." : "Confirmar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {!establecimiento.activo && (
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/50 p-4 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Este establecimiento está inactivo. Sus lotes existentes continúan disponibles en modo lectura.</p>
          </div>
        )}

        <LotesList
          lotes={lotesQuery.data ?? []}
          canManage={canManage}
          actionsDisabled={setLoteStatus.isPending}
          onEdit={setEditingLote}
          onStatus={setStatusLote}
        />
      </>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <Button type="button" variant="outline" onClick={() => navigate("/campo/establecimientos")}>
        <ArrowLeft className="h-4 w-4" />
        Volver a establecimientos
      </Button>
      {content}
    </div>
  );
}
