import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateCampoOperario,
  useUpdateCampoOperario,
} from "@/hooks/useCampoOperarios";
import type { CampoOperario, CampoOperarioFormValues } from "@/types/campo";
const schema: z.ZodType<CampoOperarioFormValues> = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre"),
  codigo_interno: z.string().trim(),
  documento: z.string().trim(),
  telefono: z.string().trim(),
  observaciones: z.string().trim(),
});
export function OperarioForm({
  mode,
  item,
  comercioId,
  allowed,
  onSuccess,
  onSaving,
}: {
  mode: "create" | "edit";
  item: CampoOperario | null;
  comercioId: string;
  allowed: boolean;
  onSuccess: () => void;
  onSaving: (v: boolean) => void;
}) {
  const create = useCreateCampoOperario(comercioId, allowed),
    update = useUpdateCampoOperario(comercioId, allowed);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<
    CampoOperarioFormValues
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: item?.nombre ?? "",
      codigo_interno: item?.codigo_interno ?? "",
      documento: item?.documento ?? "",
      telefono: item?.telefono ?? "",
      observaciones: item?.observaciones ?? "",
    },
  });
  const pending = create.isPending || update.isPending;
  useEffect(() => onSaving(pending), [onSaving, pending]);
  const submit = async (v: CampoOperarioFormValues) => {
    try {
      if (mode === "edit" && item) {
        await update.mutateAsync({ id: item.id, values: v });
      } else await create.mutateAsync(v);
      reset();
      onSuccess();
    } catch { /* conserva valores */ }
  };
  return (
    <form className="space-y-4" onSubmit={handleSubmit(submit)}>
      <div>
        <Label htmlFor="op-nombre">Nombre *</Label>
        <Input id="op-nombre" {...register("nombre")} disabled={pending} />
        {errors.nombre && (
          <p className="text-sm text-destructive">{errors.nombre.message}</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="op-codigo">Código interno</Label>
          <Input
            id="op-codigo"
            {...register("codigo_interno")}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="op-doc">Documento</Label>
          <Input id="op-doc" {...register("documento")} disabled={pending} />
        </div>
        <div>
          <Label htmlFor="op-tel">Teléfono</Label>
          <Input id="op-tel" {...register("telefono")} disabled={pending} />
        </div>
      </div>
      <div>
        <Label htmlFor="op-obs">Observaciones</Label>
        <Textarea
          id="op-obs"
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
