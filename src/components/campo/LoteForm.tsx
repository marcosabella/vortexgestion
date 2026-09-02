import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCampoLote, useUpdateCampoLote } from "@/hooks/useCampoLotes";
import type {
  CampoLoteCreateParams,
  CampoLoteEditFormValues,
  CampoLoteFormValues,
  CampoLoteListItem,
  CampoLoteUpdatePayload,
} from "@/types/campo";

type SuperficieParseResult =
  | { valid: true; value: number }
  | { valid: false; value: null };

function parseLoteSuperficie(value: string): SuperficieParseResult {
  const normalized = value.trim();

  if (!/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    return { valid: false, value: null };
  }

  const superficie = Number(normalized.replace(",", "."));
  if (!Number.isFinite(superficie) || superficie <= 0) {
    return { valid: false, value: null };
  }

  return { valid: true, value: superficie };
}

const loteSchema: z.ZodType<CampoLoteFormValues> = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre del lote"),
  codigo_interno: z.string().trim(),
  superficie_ha: z
    .string()
    .trim()
    .min(1, "Ingresá la superficie del lote")
    .refine(
      (value) => parseLoteSuperficie(value).valid,
      "La superficie debe ser un número mayor que cero",
    ),
  observaciones: z.string().trim(),
  activo: z.boolean(),
});

type LoteFormProps = {
  mode: "create" | "edit";
  comercioId: string;
  establecimientoId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  establecimientoAutorizado: boolean;
  establecimientoActivo: boolean;
  lote?: CampoLoteListItem | null;
  onSuccess: () => void;
};

const defaultValues: CampoLoteFormValues = {
  nombre: "",
  codigo_interno: "",
  superficie_ha: "",
  observaciones: "",
  activo: true,
};

function formValues(lote?: CampoLoteListItem | null): CampoLoteEditFormValues {
  if (!lote) return defaultValues;
  return {
    nombre: lote.nombre,
    codigo_interno: lote.codigo_interno ?? "",
    superficie_ha: lote.superficie_ha.toString(),
    observaciones: lote.observaciones ?? "",
    activo: lote.activo,
  };
}

function nullableText(value: string) {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function LoteForm({
  mode,
  comercioId,
  establecimientoId,
  hasAccess,
  isAdmin,
  establecimientoAutorizado,
  establecimientoActivo,
  lote,
  onSuccess,
}: LoteFormProps) {
  const createLote = useCreateCampoLote(
    comercioId,
    establecimientoId,
    hasAccess,
    isAdmin,
    establecimientoAutorizado,
    establecimientoActivo,
  );
  const updateLote = useUpdateCampoLote(
    comercioId,
    establecimientoId,
    hasAccess,
    isAdmin,
    establecimientoAutorizado,
    establecimientoActivo,
  );
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CampoLoteFormValues>({
    resolver: zodResolver(loteSchema),
    defaultValues: formValues(mode === "edit" ? lote : null),
  });

  useEffect(() => {
    reset(formValues(mode === "edit" ? lote : null));
  }, [lote, mode, reset]);

  const isSaving = createLote.isPending || updateLote.isPending;
  const controlsDisabled =
    isSaving ||
    !hasAccess ||
    !isAdmin ||
    !establecimientoAutorizado ||
    !establecimientoActivo;

  const onSubmit = async (values: CampoLoteFormValues) => {
    const superficie = parseLoteSuperficie(values.superficie_ha);
    if (!superficie.valid) return;

    const payload: CampoLoteUpdatePayload = {
      nombre: values.nombre.trim(),
      codigo_interno: nullableText(values.codigo_interno),
      superficie_ha: superficie.value,
      observaciones: nullableText(values.observaciones),
      activo: values.activo,
    };

    try {
      if (mode === "edit") {
        if (!lote) return;
        await updateLote.mutateAsync({ loteId: lote.id, payload });
      } else {
        const createPayload: CampoLoteCreateParams = payload;
        await createLote.mutateAsync(createPayload);
      }
      reset(defaultValues);
      onSuccess();
    } catch {
      // El hook mantiene el diálogo abierto y muestra un toast seguro.
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-lote-nombre">Nombre *</Label>
          <Input
            id="campo-lote-nombre"
            {...register("nombre")}
            disabled={controlsDisabled}
            aria-invalid={Boolean(errors.nombre)}
            aria-describedby={errors.nombre ? "campo-lote-nombre-error" : undefined}
          />
          {errors.nombre && (
            <p id="campo-lote-nombre-error" className="text-sm text-destructive">
              {errors.nombre.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-lote-codigo">Código interno</Label>
          <Input id="campo-lote-codigo" {...register("codigo_interno")} disabled={controlsDisabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-lote-superficie">Superficie (ha) *</Label>
          <Input
            id="campo-lote-superficie"
            type="text"
            inputMode="decimal"
            {...register("superficie_ha")}
            disabled={controlsDisabled}
            aria-invalid={Boolean(errors.superficie_ha)}
            aria-describedby={errors.superficie_ha ? "campo-lote-superficie-error" : undefined}
          />
          {errors.superficie_ha && (
            <p id="campo-lote-superficie-error" className="text-sm text-destructive">
              {errors.superficie_ha.message}
            </p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-lote-observaciones">Observaciones</Label>
          <Textarea
            id="campo-lote-observaciones"
            {...register("observaciones")}
            disabled={controlsDisabled}
            rows={4}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-4 md:col-span-2">
          <Label htmlFor="campo-lote-activo">Lote activo</Label>
          <Controller
            control={control}
            name="activo"
            render={({ field }) => (
              <Switch
                id="campo-lote-activo"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={controlsDisabled}
              />
            )}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="success" disabled={controlsDisabled}>
          {isSaving ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear lote"}
        </Button>
      </div>
    </form>
  );
}
