import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCampoOrdenLabor } from "@/hooks/useCampoOrdenLabores";
import type { CampoOrdenDetail, CampoOrdenLaborCreateParams, CampoOrdenLaborFormValues } from "@/types/campo";

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
  comercioId: string;
  ordenId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  orden: CampoOrdenDetail;
  onSuccess: () => void;
  onCancel: () => void;
  onSavingChange: (isSaving: boolean) => void;
};

export function OrdenLaborForm({ comercioId, ordenId, hasAccess, isAdmin, orden, onSuccess, onCancel, onSavingChange }: OrdenLaborFormProps) {
  const createLabor = useCreateCampoOrdenLabor(comercioId, ordenId, hasAccess, isAdmin, orden);
  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<CampoOrdenLaborFormValues>({
    resolver: zodResolver(laborSchema),
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [ordenId, reset]);

  useEffect(() => {
    onSavingChange(createLabor.isPending);
  }, [createLabor.isPending, onSavingChange]);

  const disabled = createLabor.isPending || !hasAccess || !isAdmin || orden.estado !== "borrador" || orden.establecimiento?.activo !== true;

  const onSubmit = async (values: CampoOrdenLaborFormValues) => {
    const position = Number(values.posicion);
    if (!/^\d+$/.test(values.posicion.trim()) || !Number.isSafeInteger(position) || position < 0) return;

    const payload: CampoOrdenLaborCreateParams = {
      nombre: values.nombre.trim(),
      codigo_interno: values.codigo_interno.trim() || null,
      descripcion: values.descripcion.trim() || null,
      unidad: values.unidad,
      posicion: position,
    };

    try {
      await createLabor.mutateAsync(payload);
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
              <SelectTrigger id="campo-labor-unidad"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ha">Hectáreas</SelectItem><SelectItem value="hora">Horas</SelectItem><SelectItem value="km">Kilómetros</SelectItem>
                <SelectItem value="tonelada">Toneladas</SelectItem><SelectItem value="unidad">Unidades</SelectItem><SelectItem value="fijo">Fijo por lote</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-labor-descripcion">Descripción</Label>
          <Textarea id="campo-labor-descripcion" rows={4} {...register("descripcion")} disabled={disabled} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={createLabor.isPending}>Cancelar</Button>
        <Button type="submit" variant="success" disabled={disabled}>{createLabor.isPending ? "Guardando..." : "Crear labor"}</Button>
      </div>
    </form>
  );
}
