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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type CampoParteLote,
  useCampoParteLotes,
  useCreateCampoParteLote,
  useSetCampoParteLoteStatus,
  useUpdateCampoParteLote,
} from "@/hooks/useCampoParteLotes";
import type { CampoOrdenDetail, CampoParte } from "@/types/campo";
type Values = {
  orden_labor_lote_id: string;
  cantidad: string;
  observaciones: string;
};
const numberPattern = /^\d+(?:[.,]\d+)?$/;
const schema: z.ZodType<Values> = z.object({
  orden_labor_lote_id: z.string().uuid("Seleccioná un lote"),
  cantidad: z.string().trim().regex(
    numberPattern,
    "Ingresá un número positivo sin exponentes",
  ).refine(
    (v) =>
      Number.isFinite(Number(v.replace(",", "."))) &&
      Number(v.replace(",", ".")) > 0,
    "La cantidad debe ser mayor que cero",
  ),
  observaciones: z.string().trim(),
});
function Form({
  item,
  candidates,
  unit,
  pending,
  onSaving,
  onSubmit,
}: {
  item: CampoParteLote | null;
  candidates: ReturnType<typeof useCampoParteLotes>["data"] extends infer D
    ? NonNullable<D>["candidates"]
    : never;
  unit: string;
  pending: boolean;
  onSaving: (v: boolean) => void;
  onSubmit: (v: Values) => Promise<void>;
}) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<
    Values
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      orden_labor_lote_id: item?.orden_labor_lote_id ?? "",
      cantidad: unit === "fijo"
        ? "1"
        : item
        ? String(item.cantidad_ejecutada)
        : "",
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
        <Label>Asignación planificada *</Label>
        {item
          ? (
            <p className="rounded border p-2">
              {item.asignacion?.lote?.nombre ?? "Lote no disponible"}
            </p>
          )
          : (
            <Controller
              control={control}
              name="orden_labor_lote_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar lote" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.lote?.nombre} ({a.cantidad_planificada} {unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}{" "}
        {errors.orden_labor_lote_id && (
          <p className="text-sm text-destructive">
            {errors.orden_labor_lote_id.message}
          </p>
        )}
      </div>
      <div>
        <Label>Cantidad ejecutada *</Label>
        <Input
          inputMode="decimal"
          {...register("cantidad")}
          disabled={pending || unit === "fijo"}
        />
        {errors.cantidad && (
          <p className="text-sm text-destructive">{errors.cantidad.message}</p>
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
export function ParteLotes({
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
  const query = useCampoParteLotes(
      comercioId,
      ordenId,
      parteId,
      access,
      orden,
      parte,
    ),
    [editing, setEditing] = useState<CampoParteLote | null>(null),
    [creating, setCreating] = useState(false),
    [status, setStatus] = useState<CampoParteLote | null>(null),
    [saving, setSaving] = useState(false),
    canWrite = access && isAdmin && parte.estado === "borrador" &&
      !["finalizada", "cancelada"].includes(orden.estado) &&
    parte.labor?.activo === true,
    create = useCreateCampoParteLote(
      comercioId,
      ordenId,
      parteId,
      access,
      isAdmin,
      orden,
      parte,
      query.data?.candidates ?? [],
    ),
    update = useUpdateCampoParteLote(
      comercioId,
      ordenId,
      parteId,
      access,
      isAdmin,
      orden,
      parte,
      editing,
    ),
    setState = useSetCampoParteLoteStatus(
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
    const amount = Number(v.cantidad.replace(",", "."));
    if (parte.labor?.unidad === "fijo" && amount !== 1) throw new Error("fijo");
    if (editing) {
      await update.mutateAsync({
        id: editing.id,
        orden_labor_lote_id: editing.orden_labor_lote_id,
        cantidad_ejecutada: amount,
        observaciones: v.observaciones.trim() || null,
      });
    } else {await create.mutateAsync({
        orden_labor_lote_id: v.orden_labor_lote_id,
        cantidad_ejecutada: amount,
        observaciones: v.observaciones.trim() || null,
      });}
    setCreating(false);
    setEditing(null);
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Avances por lote</CardTitle>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>Agregar avance</Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading
          ? <p>Cargando avances...</p>
          : query.error
          ? (
            <p className="text-destructive">
              No se pudieron cargar los avances.
            </p>
          )
          : !query.data?.items.length
          ? (
            <p className="text-muted-foreground">
              Todavía no hay avances por lote.
            </p>
          )
          : (
            <>
            <div className="grid gap-3 md:hidden">
              {query.data.items.map((x) => (
                <Card key={x.id}>
                  <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
                    <div>
                      <strong>
                        {x.asignacion?.lote?.nombre ?? "Lote no disponible"}
                      </strong>
                      <p>
                        {x.asignacion?.lote?.codigo_interno ?? "Sin código"}
                      </p>
                    </div>
                    <div>{x.cantidad_ejecutada} {parte.labor?.unidad}</div>
                    <div>{x.observaciones ?? "Sin observaciones"}</div>
                    <Badge variant={x.activo ? "default" : "secondary"}>
                      {x.activo ? "Activo" : "Inactivo"}
                    </Badge>
                    {(!x.asignacion?.activo || !x.asignacion?.lote?.activo) && (
                      <p className="text-sm text-amber-700 sm:col-span-2">
                        La asignación planificada o el lote ya no están activos.
                      </p>
                    )}
                    {canWrite && (
                      <div className="flex gap-2 sm:col-span-2">
                        <Button size="icon" variant="outline" onClick={() => setEditing(x)} aria-label={`Editar avance de ${x.asignacion?.lote?.nombre ?? "lote"}`} title="Editar avance"><Pencil className="h-4 w-4" /></Button>
                        <Switch checked={x.activo} onCheckedChange={() => setStatus(x)} disabled={setState.isPending} aria-label={`${x.activo ? "Desactivar" : "Reactivar"} avance de ${x.asignacion?.lote?.nombre ?? "lote"}`} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-md border md:block">
              <Table>
                <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Código</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Observaciones</TableHead><TableHead>Estado</TableHead>{canWrite && <TableHead className="text-right">Acciones</TableHead>}</TableRow></TableHeader>
                <TableBody>{query.data.items.map((x) => <TableRow key={x.id} className={!x.activo ? "opacity-70" : undefined}>
                  <TableCell className="font-medium">{x.asignacion?.lote?.nombre ?? "Lote no disponible"}{(!x.asignacion?.activo || !x.asignacion?.lote?.activo) && <p className="text-xs text-amber-700">Asignación o lote inactivo</p>}</TableCell>
                  <TableCell>{x.asignacion?.lote?.codigo_interno ?? "Sin código"}</TableCell>
                  <TableCell className="text-right tabular-nums">{x.cantidad_ejecutada} {parte.labor?.unidad}</TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap">{x.observaciones ?? "—"}</TableCell>
                  <TableCell><Badge variant={x.activo ? "default" : "secondary"}>{x.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                  {canWrite && <TableCell><div className="flex items-center justify-end gap-3"><Button size="icon" variant="outline" onClick={() => setEditing(x)} aria-label={`Editar avance de ${x.asignacion?.lote?.nombre ?? "lote"}`} title="Editar avance"><Pencil className="h-4 w-4" /></Button><Switch checked={x.activo} onCheckedChange={() => setStatus(x)} disabled={setState.isPending} aria-label={`${x.activo ? "Desactivar" : "Reactivar"} avance de ${x.asignacion?.lote?.nombre ?? "lote"}`} /></div></TableCell>}
                </TableRow>)}</TableBody>
              </Table>
            </div>
            </>
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
                {editing ? "Editar avance" : "Agregar avance"}
              </DialogTitle>
            </DialogHeader>
            <Form
              item={editing}
              candidates={query.data?.candidates ?? []}
              unit={parte.labor?.unidad ?? ""}
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
                ¿{status?.activo ? "Desactivar" : "Reactivar"} este avance?
              </AlertDialogTitle>
              <AlertDialogDescription>
                El registro permanecerá guardado y visible.
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
                      orden_labor_lote_id: status.orden_labor_lote_id,
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
