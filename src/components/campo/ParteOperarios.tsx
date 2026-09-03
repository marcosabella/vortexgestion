import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  type CampoParteOperario,
  useCampoParteOperarios,
  useCreateCampoParteOperario,
  useSetCampoParteOperarioStatus,
  useUpdateCampoParteOperario,
} from "@/hooks/useCampoParteOperarios";
import type {
  CampoOperario,
  CampoOrdenDetail,
  CampoParte,
} from "@/types/campo";
type Values = {
  operario_id: string;
  funcion: string;
  horas: string;
  observaciones: string;
};
const numeric = /^\d+(?:[.,]\d+)?$/;
const schema: z.ZodType<Values> = z.object({
  operario_id: z.string().uuid("Seleccioná un operario"),
  funcion: z.string().trim(),
  horas: z.string().trim().refine(
    (v) =>
      v === "" ||
      (numeric.test(v) && Number.isFinite(Number(v.replace(",", "."))) &&
        Number(v.replace(",", ".")) > 0),
    "Ingresá horas mayores que cero",
  ),
  observaciones: z.string().trim(),
});
function Form({
  item,
  candidates,
  pending,
  onSaving,
  onSubmit,
}: {
  item: CampoParteOperario | null;
  candidates: CampoOperario[];
  pending: boolean;
  onSaving: (v: boolean) => void;
  onSubmit: (v: Values) => Promise<void>;
}) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<
    Values
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      operario_id: item?.operario_id ?? "",
      funcion: item?.funcion ?? "",
      horas: item?.horas_trabajadas === null
        ? ""
        : String(item?.horas_trabajadas ?? ""),
      observaciones: item?.observaciones ?? "",
    },
  });
  useEffect(() => onSaving(pending), [onSaving, pending]);
  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (v) => {
        try {
          await onSubmit(v);
        } catch { /* conserva valores */ }
      })}
    >
      <div>
        <Label>Operario *</Label>
        {item
          ? (
            <p className="rounded border p-2">
              {item.operario?.nombre ?? "Operario no disponible"}
            </p>
          )
          : (
            <Controller
              control={control}
              name="operario_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar operario" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.nombre}
                        {x.codigo_interno ? ` · ${x.codigo_interno}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )} {errors.operario_id && (
          <p className="text-sm text-destructive">
            {errors.operario_id.message}
          </p>
        )}
      </div>
      <div>
        <Label>Función</Label>
        <Input {...register("funcion")} disabled={pending} />
      </div>
      <div>
        <Label>Horas trabajadas</Label>
        <Input inputMode="decimal" {...register("horas")} disabled={pending} />
        {errors.horas && (
          <p className="text-sm text-destructive">{errors.horas.message}</p>
        )}
      </div>
      <div>
        <Label>Observaciones</Label>
        <Textarea {...register("observaciones")} disabled={pending} />
      </div>
      <Button disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
    </form>
  );
}
export function ParteOperarios({
  comercioId,
  ordenId,
  parteId,
  access,
  isAdmin,
  orden,
  parte,
}: {
  comercioId: string;
  ordenId: string;
  parteId: string;
  access: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  parte: CampoParte;
}) {
  const query = useCampoParteOperarios(
      comercioId,
      ordenId,
      parteId,
      access,
      orden,
      parte,
    ),
    [editing, setEditing] = useState<CampoParteOperario | null>(null),
    [creating, setCreating] = useState(false),
    [status, setStatus] = useState<CampoParteOperario | null>(null),
    [saving, setSaving] = useState(false),
    canWrite = access && isAdmin && parte.estado === "borrador" &&
      !["finalizada", "cancelada"].includes(orden.estado),
    create = useCreateCampoParteOperario(
      comercioId,
      ordenId,
      parteId,
      access,
      isAdmin,
      orden,
      parte,
      query.data?.candidates ?? [],
    ),
    update = useUpdateCampoParteOperario(
      comercioId,
      ordenId,
      parteId,
      access,
      isAdmin,
      orden,
      parte,
      editing,
    ),
    setState = useSetCampoParteOperarioStatus(
      comercioId,
      ordenId,
      parteId,
      access,
      isAdmin,
      orden,
      parte,
      status,
    ),
    pending = create.isPending || update.isPending;
  useEffect(() => {
    setCreating(false);
    setEditing(null);
    setStatus(null);
  }, [comercioId, ordenId, parteId, access]);
  const submit = async (v: Values) => {
    const hours = v.horas ? Number(v.horas.replace(",", ".")) : null,
      funcion = v.funcion.trim() || null,
      observaciones = v.observaciones.trim() || null;
    if (editing) {
      await update.mutateAsync({
        id: editing.id,
        operario_id: editing.operario_id,
        funcion,
        horas_trabajadas: hours,
        observaciones,
      });
    } else {await create.mutateAsync({
        operario_id: v.operario_id,
        funcion,
        horas_trabajadas: hours,
        observaciones,
      });}
    setCreating(false);
    setEditing(null);
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Operarios</CardTitle>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>Agregar operario</Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading
          ? <p>Cargando operarios...</p>
          : query.error
          ? (
            <p className="text-destructive">
              No se pudieron cargar los operarios.
            </p>
          )
          : !query.data?.items.length
          ? (
            <p className="text-muted-foreground">
              Todavía no hay operarios asignados.
            </p>
          )
          : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {query.data.items.map((x) => (
                <Card key={x.id}>
                  <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
                    <div>
                      <strong>
                        {x.operario?.nombre ?? "Operario no disponible"}
                      </strong>
                      <p>{x.operario?.codigo_interno ?? "Sin código"}</p>
                    </div>
                    <div>Función: {x.funcion ?? "—"}</div>
                    <div>Horas: {x.horas_trabajadas ?? "—"}</div>
                    <div>{x.observaciones ?? "Sin observaciones"}</div>
                    <Badge variant={x.activo ? "default" : "secondary"}>
                      {x.activo ? "Activo" : "Inactivo"}
                    </Badge>
                    {x.operario?.activo === false && (
                      <p className="text-sm text-amber-700">
                        El operario del catálogo está inactivo.
                      </p>
                    )}
                    {canWrite && (
                      <div className="flex gap-2 sm:col-span-2">
                        <Button size="icon"
                          variant="outline"
                          onClick={() => setEditing(x)}
                          aria-label={`Editar asignación de ${x.operario?.nombre ?? "operario"}`}
                          title="Editar asignación"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Switch checked={x.activo} onCheckedChange={() => setStatus(x)} disabled={setState.isPending} aria-label={`${x.activo ? "Desactivar" : "Reactivar"} asignación de ${x.operario?.nombre ?? "operario"}`} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        <Dialog
          open={creating || Boolean(editing)}
          onOpenChange={(v) => {
            if (!v && !saving) {
              setCreating(false);
              setEditing(null);
            }
          }}
        >
          <DialogContent
            className="max-h-[90vh] overflow-y-auto"
            onEscapeKeyDown={(e) => {
              if (saving) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (saving) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar operario del parte" : "Agregar operario"}
              </DialogTitle>
            </DialogHeader>
            <Form
              item={editing}
              candidates={query.data?.candidates ?? []}
              pending={pending}
              onSaving={setSaving}
              onSubmit={submit}
            />
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={Boolean(status)}
          onOpenChange={(v) => {
            if (!v && !setState.isPending) setStatus(null);
          }}
        >
          <AlertDialogContent
            onEscapeKeyDown={(e) => {
              if (setState.isPending) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (setState.isPending) e.preventDefault();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {status?.activo
                  ? "¿Desactivar este operario del parte? Permanecerá guardado."
                  : "¿Reactivar este operario en el parte?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                La asignación seguirá visible en el historial.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={setState.isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={setState.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (status) {
                    void setState.mutateAsync({
                      id: status.id,
                      operario_id: status.operario_id,
                      nuevoEstado: !status.activo,
                    }).then(() => setStatus(null)).catch(() => undefined);
                  }
                }}
              >
                {setState.isPending ? "Guardando..." : "Confirmar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
