import { useState } from "react";
import { Pencil } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ParteForm } from "@/components/campo/ParteForm";
import { ParteLotes } from "@/components/campo/ParteLotes";
import { ParteOperarios } from "@/components/campo/ParteOperarios";
import { ParteMaquinarias } from "@/components/campo/ParteMaquinarias";
import { ParteInsumos } from "@/components/campo/ParteInsumos";
import { useComercio } from "@/hooks/useComercio";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoOrdenDetalle } from "@/hooks/useCampoOrdenDetalle";
import {
  useAnnulCampoParte,
  useCampoParte,
  useConfirmCampoParte,
  useUpdateCampoParte,
} from "@/hooks/useCampoPartes";
import { isCampoUuid } from "@/utils/campo";
export default function CampoParteDetalle() {
  const nav = useNavigate(),
    { ordenId, parteId } = useParams(),
    { comercio } = useComercio(),
    c = comercio?.id ?? null,
    access = useCampoAccess(c),
    ok = access.perteneceAlComercio && !access.isLoading && !access.error &&
      isCampoUuid(ordenId) && isCampoUuid(parteId),
    ordenQ = useCampoOrdenDetalle(c, ordenId, ok),
    orden = ok ? ordenQ.data : null,
    parteQ = useCampoParte(c, ordenId, parteId, ok, orden),
    parte = ok ? parteQ.data : null,
    confirm = useConfirmCampoParte(
      c,
      ordenId ?? null,
      parteId ?? null,
      ok && access.isAdmin,
      orden,
      parte,
    ),
    annul = useAnnulCampoParte(
      c,
      ordenId ?? null,
      parteId ?? null,
      ok && access.isAdmin,
      orden,
      parte,
    ),
    update = useUpdateCampoParte(c, ordenId ?? null, parteId ?? null, ok && access.isAdmin, orden, parte),
    [action, setAction] = useState<"confirm" | "annul" | null>(null),
    [motivo, setMotivo] = useState(""),
    [editing, setEditing] = useState(false),
    [editSaving, setEditSaving] = useState(false);
  if (!ok) {
    return (
      <div className="p-8">
        {access.isLoading ? "Verificando acceso..." : "Sin acceso"}
      </div>
    );
  }
  if (ordenQ.isLoading || parteQ.isLoading) {
    return <div className="p-8">Cargando parte...</div>;
  }
  if (!orden || !parte) {
    return <div className="p-8">Parte no encontrado o sin acceso.</div>;
  }
  const pending = confirm.isPending || annul.isPending;
  const orderIsTerminal = ["finalizada", "cancelada"].includes(orden.estado);
  const canEdit = access.isAdmin && parte.estado === "borrador" && !orderIsTerminal;
  const initialValues = {
    orden_labor_id: parte.orden_labor_id,
    fecha_trabajo: parte.fecha_trabajo,
    hora_inicio: parte.hora_inicio ?? "",
    hora_fin: parte.hora_fin ?? "",
    descripcion: parte.descripcion ?? "",
    observaciones: parte.observaciones ?? "",
    condiciones_climaticas: parte.condiciones_climaticas ?? "",
  };
  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <Button
        variant="outline"
        onClick={() => nav(`/campo/ordenes/${ordenId}`)}
      >
        Volver a la orden
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Parte N.º {parte.numero} · {parte.estado}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <p>Labor: {parte.labor?.nombre ?? "—"}</p>
          <p>Fecha: {parte.fecha_trabajo}</p>
          <p>Horario: {parte.hora_inicio ?? "—"} – {parte.hora_fin ?? "—"}</p>
          <p>Clima: {parte.condiciones_climaticas ?? "—"}</p>
          <p className="md:col-span-2">
            Descripción: {parte.descripcion ?? "—"}
          </p>
          <p className="md:col-span-2">
            Observaciones: {parte.observaciones ?? "—"}
          </p>
          {canEdit && <Button size="icon" variant="outline" onClick={() => setEditing(true)} aria-label="Editar cabecera del parte" title="Editar cabecera"><Pencil className="h-4 w-4" /></Button>}
          {canEdit && <Button onClick={() => setAction("confirm")}>Confirmar parte</Button>}
          {access.isAdmin && parte.estado === "confirmado" && !orderIsTerminal && (
            <Button
              variant="destructive"
              onClick={() => setAction("annul")}
            >
              Anular parte
            </Button>
          )}
        </CardContent>
      </Card>
      <ParteLotes
        comercioId={c}
        ordenId={ordenId!}
        parteId={parteId!}
        access={ok}
        isAdmin={access.isAdmin}
        orden={orden}
        parte={parte}
      />
      <ParteOperarios
        comercioId={c}
        ordenId={ordenId!}
        parteId={parteId!}
        access={ok}
        isAdmin={access.isAdmin}
        orden={orden}
        parte={parte}
      />
      <ParteMaquinarias
        comercioId={c}
        ordenId={ordenId!}
        parteId={parteId!}
        access={ok}
        isAdmin={access.isAdmin}
        orden={orden}
        parte={parte}
      />
      <ParteInsumos
        comercioId={c}
        ordenId={ordenId!}
        parteId={parteId!}
        access={ok}
        isAdmin={access.isAdmin}
        orden={orden}
        parte={parte}
      />
      <Dialog open={editing} onOpenChange={(open) => { if (!editSaving) setEditing(open); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" onEscapeKeyDown={(event) => { if (editSaving) event.preventDefault(); }} onInteractOutside={(event) => { if (editSaving) event.preventDefault(); }}>
          <DialogHeader><DialogTitle>Editar cabecera del parte</DialogTitle></DialogHeader>
          <ParteForm labores={[{ id: parte.orden_labor_id, nombre: parte.labor?.nombre ?? "Labor del parte", activo: true }]} initial={initialValues} pending={update.isPending} onSaving={setEditSaving} onSubmit={async (values) => { await update.mutateAsync(values); setEditing(false); }} />
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(action)}
        onOpenChange={(v) => {
          if (!v && !pending) setAction(null);
        }}
      >
        <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === "confirm"
                ? "¿Confirmar este parte?"
                : "¿Anular este parte?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action === "confirm"
                ? "Al confirmarlo quedará congelado. Si es el primer parte confirmado, la orden pasará automáticamente a En progreso."
                : "Conservará todo el historial y dejará de contar para el avance."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {action === "annul" && (
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo obligatorio"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || (action === "annul" && !motivo.trim())}
              onClick={(e) => {
                e.preventDefault();
                if (pending) return;
                void (action === "confirm"
                  ? confirm.mutateAsync()
                  : annul.mutateAsync(motivo)).then(() => setAction(null))
                  .catch(() => undefined);
              }}
            >
              {pending ? "Guardando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
