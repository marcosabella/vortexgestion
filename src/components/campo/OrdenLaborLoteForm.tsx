import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCampoOrdenLaborLote, useUpdateCampoOrdenLaborLote } from "@/hooks/useCampoOrdenLaborLotes";
import type {
  CampoLoteListItem,
  CampoOrdenDetail,
  CampoOrdenLaborListItem,
  CampoOrdenLaborLoteCreateParams,
  CampoOrdenLaborLoteFormValues,
  CampoOrdenLaborLoteListItem,
  CampoOrdenLaborLoteUpdatePayload,
  CampoOrdenLaborUnidad,
} from "@/types/campo";

const quantityPattern = /^\d+(?:[.,]\d+)?$/;

function parseQuantity(value: string) {
  const normalized = value.trim();
  if (!quantityPattern.test(normalized)) return null;
  const quantity = Number(normalized.replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

const assignmentSchema: z.ZodType<CampoOrdenLaborLoteFormValues> = z.object({
  lote_id: z.string().uuid("Seleccioná un lote"),
  cantidad_planificada: z.string().trim().refine(
    (value) => parseQuantity(value) !== null,
    "La cantidad debe ser un número mayor que cero",
  ),
  observaciones: z.string().trim(),
});

const unidadLabels: Record<CampoOrdenLaborUnidad, string> = {
  ha: "Hectáreas",
  hora: "Horas",
  km: "Kilómetros",
  tonelada: "Toneladas",
  unidad: "Unidades",
  fijo: "Fijo por lote",
};

type OrdenLaborLoteFormProps = {
  mode: "create" | "edit";
  comercioId: string;
  ordenId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  labor: CampoOrdenLaborListItem;
  lotesAutorizados: CampoLoteListItem[];
  lotesDisponibles: CampoLoteListItem[];
  asignaciones: CampoOrdenLaborLoteListItem[];
  asignacion?: CampoOrdenLaborLoteListItem | null;
  onSuccess: () => void;
  onCancel: () => void;
  onSavingChange: (isSaving: boolean) => void;
};

function defaults(unidad: string, assignment?: CampoOrdenLaborLoteListItem | null): CampoOrdenLaborLoteFormValues {
  return {
    lote_id: assignment?.lote_id ?? "",
    cantidad_planificada: unidad === "fijo" ? "1" : assignment ? String(assignment.cantidad_planificada) : "",
    observaciones: assignment?.observaciones ?? "",
  };
}

export function OrdenLaborLoteForm({
  mode,
  comercioId,
  ordenId,
  hasAccess,
  isAdmin,
  orden,
  labor,
  lotesAutorizados,
  lotesDisponibles,
  asignaciones,
  asignacion,
  onSuccess,
  onCancel,
  onSavingChange,
}: OrdenLaborLoteFormProps) {
  const createAssignment = useCreateCampoOrdenLaborLote(
    comercioId,
    ordenId,
    hasAccess,
    isAdmin,
    orden,
    labor,
    lotesAutorizados,
    asignaciones,
  );
  const updateAssignment = useUpdateCampoOrdenLaborLote(comercioId, ordenId, hasAccess, isAdmin, orden, labor, asignacion);
  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<CampoOrdenLaborLoteFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: defaults(labor.unidad, mode === "edit" ? asignacion : null),
  });

  useEffect(() => {
    reset(defaults(labor.unidad, mode === "edit" ? asignacion : null));
  }, [asignacion, labor.id, labor.unidad, mode, reset]);

  useEffect(() => {
    onSavingChange(createAssignment.isPending || updateAssignment.isPending);
  }, [createAssignment.isPending, onSavingChange, updateAssignment.isPending]);

  const isSaving = createAssignment.isPending || updateAssignment.isPending;
  const disabled = isSaving || !hasAccess || !isAdmin || orden.estado !== "borrador" || orden.establecimiento?.activo !== true || !labor.activo || (mode === "edit" && !asignacion);

  const close = () => {
    reset(defaults(labor.unidad, mode === "edit" ? asignacion : null));
    onCancel();
  };

  const onSubmit = async (values: CampoOrdenLaborLoteFormValues) => {
    const quantity = labor.unidad === "fijo" ? 1 : parseQuantity(values.cantidad_planificada);
    if (quantity === null || (labor.unidad === "fijo" && quantity !== 1)) return;

    const payload: CampoOrdenLaborLoteUpdatePayload = {
      cantidad_planificada: quantity,
      observaciones: values.observaciones.trim() || null,
    };

    try {
      if (mode === "edit") {
        if (!asignacion) return;
        await updateAssignment.mutateAsync({ asignacionId: asignacion.id, loteId: asignacion.lote_id, payload });
      } else {
        const createPayload: CampoOrdenLaborLoteCreateParams = { ...payload, lote_id: values.lote_id };
        await createAssignment.mutateAsync(createPayload);
      }
      reset(defaults(labor.unidad));
      onSuccess();
    } catch {
      // El hook mantiene el diálogo abierto y muestra un mensaje seguro.
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <p className="text-sm text-muted-foreground">Unidad de la labor: <span className="font-medium text-foreground">{unidadLabels[labor.unidad as CampoOrdenLaborUnidad] ?? labor.unidad}</span></p>
      {mode === "edit" ? (
        <div className="rounded-md border p-3 text-sm"><span className="block text-muted-foreground">Lote</span><span className="font-medium">{asignacion?.lote?.nombre ?? "Lote no disponible"}</span></div>
      ) : <div className="space-y-2">
        <Label htmlFor={`campo-asignacion-lote-${labor.id}`}>Lote *</Label>
        <Controller control={control} name="lote_id" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled || lotesDisponibles.length === 0}>
            <SelectTrigger id={`campo-asignacion-lote-${labor.id}`} aria-invalid={Boolean(errors.lote_id)} aria-describedby={errors.lote_id ? `campo-asignacion-lote-${labor.id}-error` : undefined}><SelectValue placeholder="Seleccionar lote" /></SelectTrigger>
            <SelectContent>{lotesDisponibles.map((lote) => <SelectItem key={lote.id} value={lote.id}>{lote.nombre}{lote.codigo_interno ? ` (${lote.codigo_interno})` : ""}</SelectItem>)}</SelectContent>
          </Select>
        )} />
        {errors.lote_id && <p id={`campo-asignacion-lote-${labor.id}-error`} className="text-sm text-destructive">{errors.lote_id.message}</p>}
      </div>}
      <div className="space-y-2">
        <Label htmlFor={`campo-asignacion-cantidad-${labor.id}`}>Cantidad planificada *</Label>
        <Input id={`campo-asignacion-cantidad-${labor.id}`} type="text" inputMode="decimal" {...register("cantidad_planificada")} disabled={disabled || labor.unidad === "fijo"} aria-invalid={Boolean(errors.cantidad_planificada)} aria-describedby={errors.cantidad_planificada ? `campo-asignacion-cantidad-${labor.id}-error` : undefined} />
        {errors.cantidad_planificada && <p id={`campo-asignacion-cantidad-${labor.id}-error`} className="text-sm text-destructive">{errors.cantidad_planificada.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`campo-asignacion-observaciones-${labor.id}`}>Observaciones</Label>
        <Textarea id={`campo-asignacion-observaciones-${labor.id}`} rows={3} {...register("observaciones")} disabled={disabled} />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={close} disabled={isSaving}>Cancelar</Button>
        <Button type="submit" variant="success" disabled={disabled || (mode === "create" && lotesDisponibles.length === 0)}>{isSaving ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Asignar lote"}</Button>
      </div>
    </form>
  );
}
