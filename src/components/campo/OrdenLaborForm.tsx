import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCampoOrdenLaborLotes } from "@/hooks/useCampoOrdenLaborLotes";
import { useCreateCampoOrdenLabor, useUpdateCampoOrdenLabor } from "@/hooks/useCampoOrdenLabores";
import type { CampoOrdenDetail, CampoOrdenLaborCreateParams, CampoOrdenLaborFormValues, CampoOrdenLaborListItem, CampoOrdenLaborUpdatePayload } from "@/types/campo";

const laborSchema: z.ZodType<CampoOrdenLaborFormValues> = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre de la labor"),
  codigo_interno: z.string().trim(),
  descripcion: z.string().trim(),
  unidad: z.enum(["ha", "hora", "km", "tonelada", "unidad", "fijo"], {
    errorMap: () => ({ message: "Seleccioná una unidad válida" }),
  }),
  posicion: z
    .string()
    .trim()
    .regex(/^\d+$/, "La posición debe ser un entero mayor o igual a cero")
    .refine((value) => Number.isSafeInteger(Number(value)), "La posición es demasiado grande"),
});

const defaultValues: CampoOrdenLaborFormValues = {
  nombre: "",
  codigo_interno: "",
  descripcion: "",
  unidad: "ha",
  posicion: "0",
};

type OrdenLaborFormProps = {
  mode: "create" | "edit";
  comercioId: string;
  ordenId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  labor?: CampoOrdenLaborListItem | null;
  onSuccess: () => void;
  onCancel: () => void;
  onSavingChange: (isSaving: boolean) => void;
};

function formValues(labor?: CampoOrdenLaborListItem | null): CampoOrdenLaborFormValues {
  if (!labor) return defaultValues;
  return { nombre: labor.nombre, codigo_interno: labor.codigo_interno ?? "", descripcion: labor.descripcion ?? "", unidad: labor.unidad as CampoOrdenLaborFormValues["unidad"], posicion: String(labor.posicion) };
}

export function OrdenLaborForm({ mode, comercioId, ordenId, hasAccess, isAdmin, orden, labor, onSuccess, onCancel, onSavingChange }: OrdenLaborFormProps) {
  const createLabor = useCreateCampoOrdenLabor(comercioId, ordenId, hasAccess, isAdmin, orden);
  const assignmentsQuery = useCampoOrdenLaborLotes(comercioId, ordenId, labor?.id, hasAccess && mode === "edit", orden, labor);
  const updateLabor = useUpdateCampoOrdenLabor(comercioId, ordenId, hasAccess, isAdmin, orden, labor, assignmentsQuery.data ?? []);
  const { control, register, handleSubmit, reset, setError, formState: { errors } } = useForm<CampoOrdenLaborFormValues>({
    resolver: zodResolver(laborSchema),
    defaultValues: formValues(mode === "edit" ? labor : null),
  });

  useEffect(() => {
    reset(formValues(mode === "edit" ? labor : null));
  }, [labor, mode, ordenId, reset]);

  useEffect(() => {
    onSavingChange(createLabor.isPending || updateLabor.isPending);
  }, [createLabor.isPending, onSavingChange, updateLabor.isPending]);

  const isSaving = createLabor.isPending || updateLabor.isPending;
  const disabled = isSaving || !hasAccess || !isAdmin || orden.estado !== "borrador" || orden.establecimiento?.activo !== true || (mode === "edit" && (!labor || assignmentsQuery.isLoading || Boolean(assignmentsQuery.error)));

  const onSubmit = async (values: CampoOrdenLaborFormValues) => {
    const position = Number(values.posicion);
    if (!/^\d+$/.test(values.posicion.trim()) || !Number.isSafeInteger(position) || position < 0) return;

    const payload: CampoOrdenLaborUpdatePayload = {
      nombre: values.nombre.trim(),
      codigo_interno: values.codigo_interno.trim() || null,
      descripcion: values.descripcion.trim() || null,
      unidad: values.unidad,
      posicion: position,
    };

    if (mode === "edit" && values.unidad === "fijo" && labor?.unidad !== "fijo" && (assignmentsQuery.data ?? []).some((item) => item.cantidad_planificada !== 1)) {
      setError("unidad", { message: "Para usar Fijo por lote, todas las asignaciones deben tener cantidad 1." });
      return;
    }

    try {
      if (mode === "edit") {
        if (!labor) return;
        await updateLabor.mutateAsync({ laborId: labor.id, payload });
      } else {
        const createPayload: CampoOrdenLaborCreateParams = payload;
        await createLabor.mutateAsync(createPayload);
      }
      reset(defaultValues);
      onSuccess();
    } catch {
      // El hook muestra un mensaje seguro y conserva los valores del formulario.
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-labor-nombre">Nombre *</Label>
          <Input id="campo-labor-nombre" {...register("nombre")} disabled={disabled} aria-invalid={Boolean(errors.nombre)} aria-describedby={errors.nombre ? "campo-labor-nombre-error" : undefined} />
          {errors.nombre && <p id="campo-labor-nombre-error" className="text-sm text-destructive">{errors.nombre.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="campo-labor-codigo">Código interno</Label>
          <Input id="campo-labor-codigo" {...register("codigo_interno")} disabled={disabled} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campo-labor-posicion">Posición *</Label>
          <Input id="campo-labor-posicion" type="text" inputMode="numeric" {...register("posicion")} disabled={disabled} aria-invalid={Boolean(errors.posicion)} aria-describedby={errors.posicion ? "campo-labor-posicion-error" : undefined} />
          {errors.posicion && <p id="campo-labor-posicion-error" className="text-sm text-destructive">{errors.posicion.message}</p>}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-labor-unidad">Unidad *</Label>
          <Controller control={control} name="unidad" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
              <SelectTrigger id="campo-labor-unidad" aria-invalid={Boolean(errors.unidad)} aria-describedby={errors.unidad ? "campo-labor-unidad-error" : undefined}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ha">Hectáreas</SelectItem><SelectItem value="hora">Horas</SelectItem><SelectItem value="km">Kilómetros</SelectItem>
                <SelectItem value="tonelada">Toneladas</SelectItem><SelectItem value="unidad">Unidades</SelectItem><SelectItem value="fijo">Fijo por lote</SelectItem>
              </SelectContent>
            </Select>
          )} />
          {errors.unidad && <p id="campo-labor-unidad-error" className="text-sm text-destructive">{errors.unidad.message}</p>}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-labor-descripcion">Descripción</Label>
          <Textarea id="campo-labor-descripcion" rows={4} {...register("descripcion")} disabled={disabled} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancelar</Button>
        <Button type="submit" variant="success" disabled={disabled}>{isSaving ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear labor"}</Button>
      </div>
    </form>
  );
}
