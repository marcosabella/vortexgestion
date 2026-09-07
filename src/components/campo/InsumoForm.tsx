import { CostoFields } from "@/components/campo/CostoFields";
import { campoCostoFields, validarParCosto, type CampoCostoCatalogo } from "@/utils/campoCostos";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import {
  campoInsumoUnidades,
  useCreateCampoInsumo,
  useUpdateCampoInsumo,
} from "@/hooks/useCampoInsumos";
import type { CampoInsumo, CampoInsumoFormValues } from "@/types/campo";
const labels = {
  litro: "Litros",
  kilogramo: "Kilogramos",
  tonelada: "Toneladas",
  unidad: "Unidades",
  bolsa: "Bolsas",
  metro: "Metros",
  dosis: "Dosis",
} as const;
const schema = z.object({
  ...campoCostoFields,
  nombre: z.string().trim().min(1, "Ingresá el nombre"),
  codigo_interno: z.string().trim(),
  unidad: z.enum([
    "litro",
    "kilogramo",
    "tonelada",
    "unidad",
    "bolsa",
    "metro",
    "dosis",
  ]),
  observaciones: z.string().trim(),
}).superRefine(validarParCosto);
export function InsumoForm({
  costoInicial,
  mode,
  item,
  comercioId,
  allowed,
  onSuccess,
  onSaving,
}: {
  costoInicial: CampoCostoCatalogo | null;
  mode: "create" | "edit";
  item: CampoInsumo | null;
  comercioId: string;
  allowed: boolean;
  onSuccess: () => void;
  onSaving: (v: boolean) => void;
}) {
  const [changed, setChanged] = useState(false),
    create = useCreateCampoInsumo(comercioId, allowed),
    update = useUpdateCampoInsumo(comercioId, allowed);
  const { control, register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    useForm<CampoInsumoFormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        costo: costoInicial?.costo == null ? "" : String(costoInicial.costo),
        moneda_costo: costoInicial?.moneda ?? "",
        nombre: item?.nombre ?? "",
        codigo_interno: item?.codigo_interno ?? "",
        unidad: (item?.unidad as CampoInsumoFormValues["unidad"]) ?? "litro",
        observaciones: item?.observaciones ?? "",
      },
    });
  const pending = create.isPending || update.isPending;
  useEffect(() => onSaving(pending), [onSaving, pending]);
  const submit = async (v: CampoInsumoFormValues) => {
    try {
      if (mode === "edit" && item) {
        await update.mutateAsync({ id: item.id, values: v });
      } else await create.mutateAsync(v);
      reset();
      onSuccess();
    } catch { /* el hook informa y conserva valores */ }
  };
  return (
    <form className="space-y-4" onSubmit={handleSubmit(submit)}>
      <div>
        <Label htmlFor="ins-nombre">Nombre *</Label>
        <Input id="ins-nombre" {...register("nombre")} disabled={pending} />
        {errors.nombre && (
          <p className="text-sm text-destructive">{errors.nombre.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="ins-codigo">Código interno</Label>
        <Input
          id="ins-codigo"
          {...register("codigo_interno")}
          disabled={pending}
        />
      </div>
      <div>
        <Label>Unidad *</Label>
        <Controller
          control={control}
          name="unidad"
          render={({ field }) => (
            <Select
              value={field.value}
              disabled={pending}
              onValueChange={(v) => {
                field.onChange(v);
                setChanged(mode === "edit" && v !== item?.unidad);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {campoInsumoUnidades.map((u) => (
                  <SelectItem key={u} value={u}>{labels[u]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {changed && (
          <p className="mt-2 text-sm text-amber-700">
            Cambiar la unidad afectará solamente los nuevos registros. Los
            partes confirmados conservarán su unidad histórica.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="ins-obs">Observaciones</Label>
        <Textarea
          id="ins-obs"
          {...register("observaciones")}
          disabled={pending}
        />
      </div>
      {allowed && <CostoFields costo={watch("costo")} moneda={watch("moneda_costo")} onCosto={v => setValue("costo", v, { shouldDirty: true, shouldValidate: true })} onMoneda={v => setValue("moneda_costo", v, { shouldDirty: true, shouldValidate: true })} disabled={pending} label="Costo unitario" error={errors.costo?.message ?? errors.moneda_costo?.message} />}
      <div className="flex justify-end">
        <Button type="submit" variant="success" disabled={pending || !allowed}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
