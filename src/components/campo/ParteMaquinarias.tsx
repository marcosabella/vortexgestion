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
  type CampoParteMaquinaria,
  type CampoParteMaquinariaValues,
  useCampoParteMaquinarias,
  useCreateCampoParteMaquinaria,
  useSetCampoParteMaquinariaStatus,
  useUpdateCampoParteMaquinaria,
} from "@/hooks/useCampoParteMaquinarias";
import type {
  CampoMaquinaria,
  CampoOrdenDetail,
  CampoParte,
} from "@/types/campo";
type Values = {
  maquinaria_id: string;
  horas: string;
  inicial: string;
  final: string;
  unidad: "" | "hora" | "km";
  observaciones: string;
};
const decimal = /^\d+(?:[.,]\d+)?$/,
  optional = (positive: boolean) =>
    z.string().trim().refine(
      (v) =>
        v === "" ||
        (decimal.test(v) && Number.isFinite(Number(v.replace(",", "."))) &&
          (positive
            ? Number(v.replace(",", ".")) > 0
            : Number(v.replace(",", ".")) >= 0)),
      positive ? "Debe ser mayor que cero" : "Debe ser cero o mayor",
    );
const schema: z.ZodType<Values> = z.object({
  maquinaria_id: z.string().uuid("Seleccioná una maquinaria"),
  horas: optional(true),
  inicial: optional(false),
  final: optional(false),
  unidad: z.enum(["", "hora", "km"]),
  observaciones: z.string().trim(),
}).superRefine((v, ctx) => {
  const i = v.inicial === "" ? null : Number(v.inicial.replace(",", ".")),
    f = v.final === "" ? null : Number(v.final.replace(",", ".")),
    has = i !== null || f !== null;
  if (i !== null && f !== null && f < i) {
    ctx.addIssue({
      code: "custom",
      path: ["final"],
      message: "La lectura final no puede ser menor",
    });
  }
  if (has && !v.unidad) {
    ctx.addIssue({
      code: "custom",
      path: ["unidad"],
      message: "Seleccioná hora o km",
    });
  }
  if (!has && v.unidad) {
    ctx.addIssue({
      code: "custom",
      path: ["unidad"],
      message: "Sin lecturas, la unidad debe quedar vacía",
    });
  }
});
const num = (v: string) => v === "" ? null : Number(v.replace(",", "."));
function Form({
  item,
  candidates,
  pending,
  onSaving,
  onSubmit,
}: {
  item: CampoParteMaquinaria | null;
  candidates: CampoMaquinaria[];
  pending: boolean;
  onSaving: (v: boolean) => void;
  onSubmit: (v: Values) => Promise<void>;
}) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<
    Values
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      maquinaria_id: item?.maquinaria_id ?? "",
      horas: item?.horas_uso === null ? "" : String(item?.horas_uso ?? ""),
      inicial: item?.lectura_inicial === null
        ? ""
        : String(item?.lectura_inicial ?? ""),
      final: item?.lectura_final === null
        ? ""
        : String(item?.lectura_final ?? ""),
      unidad: (item?.unidad_lectura as Values["unidad"]) ?? "",
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
        <Label>Maquinaria *</Label>
        {item
          ? (
            <p className="rounded border p-2">
              {item.maquinaria?.nombre ?? "No disponible"}
            </p>
          )
          : (
            <Controller
              control={control}
              name="maquinaria_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar maquinaria" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.nombre} ·{" "}
                        {x.codigo_interno ?? x.identificacion ?? x.tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )} {errors.maquinaria_id && (
          <p className="text-sm text-destructive">
            {errors.maquinaria_id.message}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {([["horas", "Horas de uso"], ["inicial", "Lectura inicial"], [
          "final",
          "Lectura final",
        ]] as const).map(([n, l]) => (
          <div key={n}>
            <Label>{l}</Label>
            <Input inputMode="decimal" {...register(n)} disabled={pending} />
            {errors[n] && (
              <p className="text-sm text-destructive">{errors[n]?.message}</p>
            )}
          </div>
        ))}
        <div>
          <Label>Unidad de lectura</Label>
          <Controller
            control={control}
            name="unidad"
            render={({ field }) => (
              <Select
                value={field.value || "ninguna"}
                onValueChange={(v) => field.onChange(v === "ninguna" ? "" : v)}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">Sin unidad</SelectItem>
                  <SelectItem value="hora">Hora</SelectItem>
                  <SelectItem value="km">Kilómetros</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.unidad && (
            <p className="text-sm text-destructive">{errors.unidad.message}</p>
          )}
        </div>
      </div>
      <div>
        <Label>Observaciones</Label>
        <Textarea {...register("observaciones")} disabled={pending} />
      </div>
      <Button disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
    </form>
  );
}
export function ParteMaquinarias({
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
  const query = useCampoParteMaquinarias(
      comercioId,
      ordenId,
      parteId,
      access,
      orden,
      parte,
    ),
    [editing, setEditing] = useState<CampoParteMaquinaria | null>(null),
    [creating, setCreating] = useState(false),
    [status, setStatus] = useState<CampoParteMaquinaria | null>(null),
    [saving, setSaving] = useState(false),
    canWrite = access && isAdmin && parte.estado === "borrador" &&
      !["finalizada", "cancelada"].includes(orden.estado),
    create = useCreateCampoParteMaquinaria(
      comercioId,
      ordenId,
      parteId,
      access,
      isAdmin,
      orden,
      parte,
      query.data?.candidates ?? [],
    ),
    update = useUpdateCampoParteMaquinaria(
      comercioId,
      ordenId,
      parteId,
      access,
      isAdmin,
      orden,
      parte,
      editing,
    ),
    setState = useSetCampoParteMaquinariaStatus(
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
    const values: CampoParteMaquinariaValues = {
      maquinaria_id: v.maquinaria_id,
      horas_uso: num(v.horas),
      lectura_inicial: num(v.inicial),
      lectura_final: num(v.final),
      unidad_lectura: v.unidad || null,
      observaciones: v.observaciones.trim() || null,
    };
    if (editing) {
      await update.mutateAsync({
        ...values,
        id: editing.id,
        maquinaria_id: editing.maquinaria_id,
      });
    } else await create.mutateAsync(values);
    setCreating(false);
    setEditing(null);
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Maquinarias</CardTitle>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>Agregar maquinaria</Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading
          ? <p>Cargando maquinarias...</p>
          : query.error
          ? (
            <p className="text-destructive">
              No se pudieron cargar las maquinarias.
            </p>
          )
          : !query.data?.items.length
          ? (
            <p className="text-muted-foreground">
              Todavía no hay maquinarias asignadas.
            </p>
          )
          : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {query.data.items.map((x) => (
                <Card key={x.id}>
                  <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
                    <div>
                      <strong>{x.maquinaria?.nombre ?? "No disponible"}</strong>
                      <p>
                        {x.maquinaria?.codigo_interno ??
                          x.maquinaria?.identificacion ?? "Sin identificación"}
                        {" "}
                        · {x.maquinaria?.tipo ?? "—"}
                      </p>
                    </div>
                    <div>Horas: {x.horas_uso ?? "—"}</div>
                    <div>
                      Lecturas: {x.lectura_inicial ?? "—"} /{" "}
                      {x.lectura_final ?? "—"} {x.unidad_lectura ?? ""}
                    </div>
                    <div>{x.observaciones ?? "Sin observaciones"}</div>
                    <Badge variant={x.activo ? "default" : "secondary"}>
                      {x.activo ? "Activo" : "Inactivo"}
                    </Badge>
                    {x.maquinaria?.activo === false && (
                      <p className="text-sm text-amber-700">
                        La maquinaria del catálogo está inactiva.
                      </p>
                    )}
                    {canWrite && (
                      <div className="flex gap-2 sm:col-span-2">
                        <Button size="icon"
                          variant="outline"
                          onClick={() => setEditing(x)}
                          aria-label={`Editar uso de ${x.maquinaria?.nombre ?? "maquinaria"}`}
                          title="Editar uso"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Switch checked={x.activo} onCheckedChange={() => setStatus(x)} disabled={setState.isPending} aria-label={`${x.activo ? "Desactivar" : "Reactivar"} uso de ${x.maquinaria?.nombre ?? "maquinaria"}`} />
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
                {editing ? "Editar maquinaria del parte" : "Agregar maquinaria"}
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
                  ? "¿Desactivar esta maquinaria del parte? Permanecerá guardada."
                  : "¿Reactivar esta maquinaria en el parte?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                La asignación seguirá visible.
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
                      maquinaria_id: status.maquinaria_id,
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
