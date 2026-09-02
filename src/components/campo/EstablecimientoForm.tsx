import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCampoClientes } from "@/hooks/useCampoClientes";
import { useCreateCampoEstablecimiento, useUpdateCampoEstablecimiento } from "@/hooks/useCampoEstablecimientos";
import type {
  CampoClienteOption,
  CampoEstablecimientoCreatePayload,
  CampoEstablecimientoListItem,
  CampoEstablecimientoUpdatePayload,
} from "@/types/campo";

const optionalText = z.string().trim();

type SuperficieParseResult =
  | { valid: true; value: number | null }
  | { valid: false; value: null };

function parseSuperficieTotal(value: string): SuperficieParseResult {
  const normalized = value.trim();

  if (normalized === "") {
    return { valid: true, value: null };
  }

  if (!/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    return { valid: false, value: null };
  }

  const superficie = Number(normalized.replace(",", "."));

  if (!Number.isFinite(superficie) || superficie <= 0) {
    return { valid: false, value: null };
  }

  return { valid: true, value: superficie };
}

const establecimientoSchema = z.object({
  cliente_id: z.string().uuid("Seleccioná un cliente"),
  nombre: z.string().trim().min(1, "Ingresá el nombre del establecimiento"),
  codigo_interno: optionalText,
  direccion: optionalText,
  localidad: optionalText,
  provincia: optionalText,
  superficie_total_ha: z
    .string()
    .trim()
    .refine((value) => parseSuperficieTotal(value).valid, "La superficie debe ser un número mayor que cero"),
  contacto_nombre: optionalText,
  contacto_telefono: optionalText,
  observaciones: optionalText,
  activo: z.boolean(),
});

export type EstablecimientoFormValues = z.infer<typeof establecimientoSchema>;

type EstablecimientoFormProps = {
  mode: "create" | "edit";
  comercioId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  establecimiento?: CampoEstablecimientoListItem | null;
  onSuccess: () => void;
};

const emptyValues: EstablecimientoFormValues = {
  cliente_id: "",
  nombre: "",
  codigo_interno: "",
  direccion: "",
  localidad: "",
  provincia: "",
  superficie_total_ha: "",
  contacto_nombre: "",
  contacto_telefono: "",
  observaciones: "",
  activo: true,
};

function formValues(establecimiento?: CampoEstablecimientoListItem | null): EstablecimientoFormValues {
  if (!establecimiento) return emptyValues;
  return {
    cliente_id: establecimiento.cliente_id,
    nombre: establecimiento.nombre,
    codigo_interno: establecimiento.codigo_interno ?? "",
    direccion: establecimiento.direccion ?? "",
    localidad: establecimiento.localidad ?? "",
    provincia: establecimiento.provincia ?? "",
    superficie_total_ha: establecimiento.superficie_total_ha?.toString() ?? "",
    contacto_nombre: establecimiento.contacto_nombre ?? "",
    contacto_telefono: establecimiento.contacto_telefono ?? "",
    observaciones: establecimiento.observaciones ?? "",
    activo: establecimiento.activo,
  };
}

function nullableText(value: string) {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function clienteLabel(cliente: CampoClienteOption) {
  if (cliente.tipo_persona === "juridica") return cliente.nombre;
  return [cliente.nombre, cliente.apellido].filter(Boolean).join(" ").trim();
}

export function EstablecimientoForm({ mode, comercioId, hasAccess, isAdmin, establecimiento, onSuccess }: EstablecimientoFormProps) {
  const clientesQuery = useCampoClientes(comercioId, hasAccess);
  const createEstablecimiento = useCreateCampoEstablecimiento(comercioId, hasAccess && isAdmin);
  const updateEstablecimiento = useUpdateCampoEstablecimiento(comercioId, hasAccess && isAdmin);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EstablecimientoFormValues>({
    resolver: zodResolver(establecimientoSchema),
    defaultValues: formValues(mode === "edit" ? establecimiento : null),
  });

  useEffect(() => {
    reset(formValues(mode === "edit" ? establecimiento : null));
  }, [establecimiento, mode, reset]);

  const isSaving = createEstablecimiento.isPending || updateEstablecimiento.isPending;
  const controlsDisabled = isSaving || !hasAccess || !isAdmin;

  const onSubmit = async (values: EstablecimientoFormValues) => {
    const superficieTotal = parseSuperficieTotal(values.superficie_total_ha);
    if (!superficieTotal.valid) return;

    const payload: CampoEstablecimientoUpdatePayload = {
      cliente_id: values.cliente_id,
      nombre: values.nombre,
      codigo_interno: nullableText(values.codigo_interno),
      direccion: nullableText(values.direccion),
      localidad: nullableText(values.localidad),
      provincia: nullableText(values.provincia),
      superficie_total_ha: superficieTotal.value,
      contacto_nombre: nullableText(values.contacto_nombre),
      contacto_telefono: nullableText(values.contacto_telefono),
      observaciones: nullableText(values.observaciones),
      activo: values.activo,
    };

    try {
      if (mode === "edit") {
        if (!establecimiento) return;
        await updateEstablecimiento.mutateAsync({ establecimientoId: establecimiento.id, payload });
      } else {
        const createPayload: Omit<CampoEstablecimientoCreatePayload, "comercio_id"> = payload;
        await createEstablecimiento.mutateAsync(createPayload);
      }
      reset(emptyValues);
      onSuccess();
    } catch {
      // El hook conserva el diálogo abierto y presenta un mensaje seguro mediante toast.
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-cliente">Cliente *</Label>
          <Controller
            control={control}
            name="cliente_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={controlsDisabled || clientesQuery.isLoading}>
                <SelectTrigger id="campo-cliente" aria-invalid={Boolean(errors.cliente_id)} aria-describedby={errors.cliente_id ? "campo-cliente-error" : undefined}>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(clientesQuery.data ?? []).map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {clienteLabel(cliente)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.cliente_id && <p id="campo-cliente-error" className="text-sm text-destructive">{errors.cliente_id.message}</p>}
          {clientesQuery.error && <p className="text-sm text-destructive">No se pudieron cargar los clientes del comercio.</p>}
          {!clientesQuery.isLoading && !clientesQuery.error && clientesQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay clientes disponibles en el comercio.</p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-nombre">Nombre *</Label>
          <Input id="campo-nombre" {...register("nombre")} disabled={controlsDisabled} aria-invalid={Boolean(errors.nombre)} aria-describedby={errors.nombre ? "campo-nombre-error" : undefined} />
          {errors.nombre && <p id="campo-nombre-error" className="text-sm text-destructive">{errors.nombre.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-codigo">Código interno</Label>
          <Input id="campo-codigo" {...register("codigo_interno")} disabled={controlsDisabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-superficie">Superficie total (ha)</Label>
          <Input id="campo-superficie" type="text" inputMode="decimal" {...register("superficie_total_ha")} disabled={controlsDisabled} aria-invalid={Boolean(errors.superficie_total_ha)} aria-describedby={errors.superficie_total_ha ? "campo-superficie-error" : undefined} />
          {errors.superficie_total_ha && <p id="campo-superficie-error" className="text-sm text-destructive">{errors.superficie_total_ha.message}</p>}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-direccion">Dirección</Label>
          <Input id="campo-direccion" {...register("direccion")} disabled={controlsDisabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-localidad">Localidad</Label>
          <Input id="campo-localidad" {...register("localidad")} disabled={controlsDisabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-provincia">Provincia</Label>
          <Input id="campo-provincia" {...register("provincia")} disabled={controlsDisabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-contacto">Nombre de contacto</Label>
          <Input id="campo-contacto" {...register("contacto_nombre")} disabled={controlsDisabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-telefono">Teléfono de contacto</Label>
          <Input id="campo-telefono" type="tel" {...register("contacto_telefono")} disabled={controlsDisabled} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-observaciones">Observaciones</Label>
          <Textarea id="campo-observaciones" {...register("observaciones")} disabled={controlsDisabled} rows={4} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-4 md:col-span-2">
          <Label htmlFor="campo-activo">Establecimiento activo</Label>
          <Controller
            control={control}
            name="activo"
            render={({ field }) => (
              <Switch id="campo-activo" checked={field.value} onCheckedChange={field.onChange} disabled={controlsDisabled} />
            )}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="success" disabled={controlsDisabled || clientesQuery.isLoading || Boolean(clientesQuery.error) || !clientesQuery.data?.length}>
          {isSaving ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear establecimiento"}
        </Button>
      </div>
    </form>
  );
}
