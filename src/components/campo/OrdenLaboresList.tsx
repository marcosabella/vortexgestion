import { Fragment, useEffect, useState } from "react";
import { Pencil, Power, PowerOff } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrdenLaborLotesList } from "@/components/campo/OrdenLaborLotesList";
import { OrdenLaborForm } from "@/components/campo/OrdenLaborForm";
import { useSetCampoOrdenLaborStatus } from "@/hooks/useCampoOrdenLabores";
import type { CampoOrdenDetail, CampoOrdenLaborListItem, CampoOrdenLaborUnidad } from "@/types/campo";

const unidadLabels: Record<CampoOrdenLaborUnidad, string> = {
  ha: "Hectáreas",
  hora: "Horas",
  km: "Kilómetros",
  tonelada: "Toneladas",
  unidad: "Unidades",
  fijo: "Fijo por lote",
};

function unidadLabel(value: string) {
  return unidadLabels[value as CampoOrdenLaborUnidad] ?? value;
}

type OrdenLaboresListProps = {
  comercioId: string;
  ordenId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  labores: CampoOrdenLaborListItem[];
};

export function OrdenLaboresList({ comercioId, ordenId, hasAccess, isAdmin, orden, labores }: OrdenLaboresListProps) {
  const canWrite = hasAccess && isAdmin && orden.estado === "borrador" && orden.establecimiento?.activo === true;
  const [editLabor, setEditLabor] = useState<CampoOrdenLaborListItem | null>(null);
  const [statusLabor, setStatusLabor] = useState<CampoOrdenLaborListItem | null>(null);
  const [pending, setPending] = useState(false);
  const setStatus = useSetCampoOrdenLaborStatus(comercioId, ordenId, hasAccess, isAdmin, orden, statusLabor);

  useEffect(() => {
    setEditLabor(null);
    setStatusLabor(null);
    setPending(false);
  }, [comercioId, hasAccess, ordenId]);

  const actions = (labor: CampoOrdenLaborListItem) => canWrite ? <div className="flex flex-wrap gap-2">
    <Button type="button" size="sm" variant="outline" onClick={() => setEditLabor(labor)}><Pencil className="h-4 w-4" />Editar</Button>
    <Button type="button" size="sm" variant="outline" onClick={() => setStatusLabor(labor)}>{labor.activo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}{labor.activo ? "Desactivar" : "Reactivar"}</Button>
  </div> : null;

  const confirmStatus = async () => {
    if (!statusLabor) return;
    try {
      await setStatus.mutateAsync({ laborId: statusLabor.id, nuevoEstado: !statusLabor.activo });
      setStatusLabor(null);
    } catch {
      // El hook conserva la confirmación y muestra un mensaje seguro.
    }
  };

  if (labores.length === 0) return <p className="py-8 text-center text-muted-foreground">Esta orden todavía no tiene labores.</p>;

  return (
    <>
      <div className="grid gap-4 md:hidden">
        {labores.map((labor) => (
          <Card key={labor.id}>
            <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{labor.nombre}</CardTitle><Badge variant={labor.activo ? "default" : "secondary"}>{labor.activo ? "Activa" : "Inactiva"}</Badge></div></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="block text-muted-foreground">Código</span>{labor.codigo_interno || "Sin código"}</div>
              <div><span className="block text-muted-foreground">Unidad</span>{unidadLabel(labor.unidad)}</div>
              <div><span className="block text-muted-foreground">Posición</span>{labor.posicion}</div>
              <div className="col-span-2"><span className="block text-muted-foreground">Descripción</span><p className="whitespace-pre-wrap">{labor.descripcion || "Sin descripción"}</p></div>
              {actions(labor) && <div className="col-span-2">{actions(labor)}</div>}
              <div className="col-span-2"><OrdenLaborLotesList comercioId={comercioId} ordenId={ordenId} hasAccess={hasAccess} isAdmin={isAdmin} orden={orden} labor={labor} /></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="hidden md:block">
        <Table>
          <TableHeader><TableRow><TableHead>Posición</TableHead><TableHead>Nombre</TableHead><TableHead>Código</TableHead><TableHead>Unidad</TableHead><TableHead>Descripción</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
          <TableBody>{labores.map((labor) => (
            <Fragment key={labor.id}>
              <TableRow><TableCell>{labor.posicion}</TableCell><TableCell className="font-medium">{labor.nombre}</TableCell><TableCell>{labor.codigo_interno || "Sin código"}</TableCell><TableCell>{unidadLabel(labor.unidad)}</TableCell><TableCell className="max-w-sm whitespace-pre-wrap">{labor.descripcion || "Sin descripción"}</TableCell><TableCell><Badge variant={labor.activo ? "default" : "secondary"}>{labor.activo ? "Activa" : "Inactiva"}</Badge></TableCell><TableCell>{actions(labor)}</TableCell></TableRow>
              <TableRow><TableCell colSpan={7} className="bg-muted/10"><OrdenLaborLotesList comercioId={comercioId} ordenId={ordenId} hasAccess={hasAccess} isAdmin={isAdmin} orden={orden} labor={labor} /></TableCell></TableRow>
            </Fragment>
          ))}</TableBody>
        </Table>
      </div>

      {canWrite && editLabor && <Dialog open onOpenChange={(open) => { if (!open && !pending) setEditLabor(null); }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}><DialogHeader><DialogTitle>Editar labor</DialogTitle></DialogHeader><OrdenLaborForm key={editLabor.id} mode="edit" comercioId={comercioId} ordenId={ordenId} hasAccess={hasAccess} isAdmin={isAdmin} orden={orden} labor={editLabor} onSuccess={() => setEditLabor(null)} onCancel={() => setEditLabor(null)} onSavingChange={setPending} /></DialogContent></Dialog>}

      {canWrite && statusLabor && <AlertDialog open onOpenChange={(open) => { if (!open && !setStatus.isPending) setStatusLabor(null); }}><AlertDialogContent onEscapeKeyDown={(event) => { if (setStatus.isPending) event.preventDefault(); }} onInteractOutside={(event) => { if (setStatus.isPending) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>{statusLabor.activo ? "Desactivar labor" : "Reactivar labor"}</AlertDialogTitle><AlertDialogDescription>{statusLabor.activo ? "¿Desactivar esta labor? Sus asignaciones permanecerán guardadas." : "¿Reactivar esta labor?"}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={setStatus.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={setStatus.isPending} onClick={(event) => { event.preventDefault(); void confirmStatus(); }}>{setStatus.isPending ? "Guardando..." : statusLabor.activo ? "Desactivar" : "Reactivar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    </>
  );
}
