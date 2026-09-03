import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateCampoMaquinaria,
  useUpdateCampoMaquinaria,
} from "@/hooks/useCampoMaquinarias";
import type { CampoMaquinaria, CampoMaquinariaFormValues } from "@/types/campo";
const schema: z.ZodType<CampoMaquinariaFormValues> = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre"),
  codigo_interno: z.string().trim(),
  tipo: z.string().trim().min(1, "Ingresá el tipo"),
  marca: z.string().trim(),
  modelo: z.string().trim(),
  identificacion: z.string().trim(),
  anio: z.string().trim().refine(
    (v) => v === "" || /^\d{4}$/.test(v),
    "Ingresá cuatro dígitos",
  ).refine(
    (v) => v === "" || (Number(v) >= 1900 && Number(v) <= 2100),
    "El año debe estar entre 1900 y 2100",
  ),
  observaciones: z.string().trim(),
});
export function MaquinariaForm({
  mode,
  item,
  comercioId,
  allowed,
  onSuccess,
  onSaving,
}: {
  mode: "create" | "edit";
  item: CampoMaquinaria | null;
  comercioId: string;
  allowed: boolean;
  onSuccess: () => void;
  onSaving: (v: boolean) => void;
}) {
  const create = useCreateCampoMaquinaria(comercioId, allowed),
    update = useUpdateCampoMaquinaria(comercioId, allowed);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<
    CampoMaquinariaFormValues
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: item?.nombre ?? "",
      codigo_interno: item?.codigo_interno ?? "",
      tipo: item?.tipo ?? "",
      marca: item?.marca ?? "",
      modelo: item?.modelo ?? "",
      identificacion: item?.identificacion ?? "",
      anio: item?.anio ? String(item.anio) : "",
      observaciones: item?.observaciones ?? "",
    },
  });
  const pending = create.isPending || update.isPending;
  useEffect(() => onSaving(pending), [onSaving, pending]);
  const submit = async (v: CampoMaquinariaFormValues) => {
    try {
      if (mode === "edit" && item) {
        await update.mutateAsync({ id: item.id, values: v });
      } else await create.mutateAsync(v);
      reset();
      onSuccess();
    } catch { /* el hook informa y conserva valores */ }
  };
  const fields: [
    [keyof CampoMaquinariaFormValues, string, boolean?],
    ...Array<[keyof CampoMaquinariaFormValues, string, boolean?]>,
  ] = [
    ["nombre", "Nombre", true],
    ["codigo_interno", "Código interno"],
    ["tipo", "Tipo", true],
    ["marca", "Marca"],
    ["modelo", "Modelo"],
    ["identificacion", "Identificación/patente"],
    ["anio", "Año"],
  ];
  return (
    <form className="space-y-4" onSubmit={handleSubmit(submit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([name, label, required]) => (
          <div key={name}>
            <Label htmlFor={`maq-${name}`}>{label}{required ? " *" : ""}</Label>
            <Input
              id={`maq-${name}`}
              inputMode={name === "anio" ? "numeric" : undefined}
              {...register(name)}
              disabled={pending}
            />
            {errors[name] && (
              <p className="text-sm text-destructive">
                {errors[name]?.message}
              </p>
            )}
          </div>
        ))}
      </div>
      <div>
        <Label htmlFor="maq-obs">Observaciones</Label>
        <Textarea
          id="maq-obs"
          {...register("observaciones")}
          disabled={pending}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="success" disabled={pending || !allowed}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
