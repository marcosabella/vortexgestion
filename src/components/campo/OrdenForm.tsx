import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCampoClientes } from "@/hooks/useCampoClientes";
import { useCampoEstablecimientos } from "@/hooks/useCampoEstablecimientos";
import { useUpdateCampoOrden } from "@/hooks/useCampoOrdenDetalle";
import { useCreateCampoOrden } from "@/hooks/useCampoOrdenes";
import type { CampoClienteOption, CampoOrdenCreateParams, CampoOrdenDetail, CampoOrdenFormValues, CampoOrdenUpdatePayload } from "@/types/campo";

function isCivilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysByMonth[month - 1];
}

const optionalDate = z.string().refine(
  (value) => value === "" || isCivilDate(value),
  "Ingresá una fecha válida",
);

const ordenSchema: z.ZodType<CampoOrdenFormValues> = z
  .object({
    cliente_id: z.string().uuid("Seleccioná un cliente"),
    establecimiento_id: z.string().uuid("Seleccioná un establecimiento"),
    codigo_interno: z.string().trim(),
    fecha_inicio_planificada: optionalDate,
    fecha_fin_planificada: optionalDate,
    descripcion: z.string().trim(),
    observaciones: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (
      values.fecha_inicio_planificada &&
      values.fecha_fin_planificada &&
      values.fecha_fin_planificada < values.fecha_inicio_planificada
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha_fin_planificada"],
        message: "La fecha de fin no puede ser anterior a la fecha de inicio",
      });
    }
  });

const defaultValues: CampoOrdenFormValues = {
  cliente_id: "",
  establecimiento_id: "",
  codigo_interno: "",
  fecha_inicio_planificada: "",
  fecha_fin_planificada: "",
  descripcion: "",
  observaciones: "",
};

function nullableText(value: string) {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function clienteLabel(cliente: CampoClienteOption) {
  if (cliente.tipo_persona === "juridica") return cliente.nombre;
  return [cliente.nombre, cliente.apellido].filter(Boolean).join(" ").trim();
}

type OrdenFormProps = {
  mode: "create" | "edit";
  comercioId: string;
  hasAccess: boolean;
  isAdmin: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  onSavingChange: (isSaving: boolean) => void;
  orden?: CampoOrdenDetail | null;
};

function formValues(orden?: CampoOrdenDetail | null): CampoOrdenFormValues {
  if (!orden) return defaultValues;
  return {
    cliente_id: orden.cliente_id,
    establecimiento_id: orden.establecimiento_id,
    codigo_interno: orden.codigo_interno ?? "",
    fecha_inicio_planificada: orden.fecha_inicio_planificada ?? "",
    fecha_fin_planificada: orden.fecha_fin_planificada ?? "",
    descripcion: orden.descripcion ?? "",
    observaciones: orden.observaciones ?? "",
  };
}

export function OrdenForm({ mode, comercioId, hasAccess, isAdmin, onSuccess, onCancel, onSavingChange, orden }: OrdenFormProps) {
  const clientesQuery = useCampoClientes(comercioId, hasAccess);
  const establecimientosQuery = useCampoEstablecimientos(comercioId, hasAccess);
  const clientes = clientesQuery.data ?? [];
  const establecimientos = establecimientosQuery.data ?? [];
  const createOrden = useCreateCampoOrden(comercioId, hasAccess, isAdmin, clientes, establecimientos);
  const updateOrden = useUpdateCampoOrden(comercioId, hasAccess, isAdmin, orden, clientes, establecimientos);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CampoOrdenFormValues>({ resolver: zodResolver(ordenSchema), defaultValues: formValues(mode === "edit" ? orden : null) });
  const clienteId = watch("cliente_id");
  const establecimientoId = watch("establecimiento_id");
  const establecimientosDisponibles = useMemo(
    () => (establecimientosQuery.data ?? []).filter(
      (item) => item.activo && item.cliente_id === clienteId,
    ),
    [clienteId, establecimientosQuery.data],
  );

  useEffect(() => {
    reset(formValues(mode === "edit" ? orden : null));
  }, [mode, orden, reset]);

  useEffect(() => {
    if (
      establecimientoId &&
      !establecimientosQuery.isLoading &&
      !establecimientosDisponibles.some((item) => item.id === establecimientoId)
    ) {
      setValue("establecimiento_id", "", { shouldDirty: true, shouldValidate: true });
    }
  }, [establecimientoId, establecimientosDisponibles, establecimientosQuery.isLoading, setValue]);

  useEffect(() => {
    onSavingChange(createOrden.isPending || updateOrden.isPending);
  }, [createOrden.isPending, onSavingChange, updateOrden.isPending]);

  const queriesLoading = clientesQuery.isLoading || establecimientosQuery.isLoading;
  const queriesError = Boolean(clientesQuery.error || establecimientosQuery.error);
  const isSaving = createOrden.isPending || updateOrden.isPending;
  const controlsDisabled = isSaving || !hasAccess || !isAdmin || (mode === "edit" && orden?.estado !== "borrador");
  const noClients = !queriesLoading && !queriesError && clientes.length === 0;
  const noActiveEstablishments = Boolean(clienteId) && !queriesLoading && !queriesError && establecimientosDisponibles.length === 0;

  const onSubmit = async (values: CampoOrdenFormValues) => {
    const payload: CampoOrdenUpdatePayload = {
      cliente_id: values.cliente_id,
      establecimiento_id: values.establecimiento_id,
      codigo_interno: nullableText(values.codigo_interno),
      fecha_inicio_planificada: values.fecha_inicio_planificada || null,
      fecha_fin_planificada: values.fecha_fin_planificada || null,
      descripcion: nullableText(values.descripcion),
      observaciones: nullableText(values.observaciones),
    };

    try {
      if (mode === "edit") {
        if (!orden) return;
        await updateOrden.mutateAsync({ ordenId: orden.id, payload });
      } else {
        const params: CampoOrdenCreateParams = payload;
        await createOrden.mutateAsync(params);
      }
      reset(defaultValues);
      onSuccess();
    } catch {
      // La mutación conserva los valores y muestra un mensaje seguro.
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="campo-orden-cliente">Cliente *</Label>
          <Controller control={control} name="cliente_id" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={controlsDisabled || queriesLoading}>
              <SelectTrigger id="campo-orden-cliente" aria-invalid={Boolean(errors.cliente_id)} aria-describedby={errors.cliente_id ? "campo-orden-cliente-error" : undefined}>
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>{clientes.map((cliente) => <SelectItem key={cliente.id} value={cliente.id}>{clienteLabel(cliente)}</SelectItem>)}</SelectContent>
            </Select>
          )} />
          {errors.cliente_id && <p id="campo-orden-cliente-error" className="text-sm text-destructive">{errors.cliente_id.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="campo-orden-establecimiento">Establecimiento *</Label>
          <Controller control={control} name="establecimiento_id" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={controlsDisabled || queriesLoading || !clienteId || noActiveEstablishments}>
              <SelectTrigger id="campo-orden-establecimiento" aria-invalid={Boolean(errors.establecimiento_id)} aria-describedby={errors.establecimiento_id ? "campo-orden-establecimiento-error" : undefined}>
                <SelectValue placeholder="Seleccionar establecimiento" />
              </SelectTrigger>
              <SelectContent>{establecimientosDisponibles.map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre}</SelectItem>)}</SelectContent>
            </Select>
          )} />
          {errors.establecimiento_id && <p id="campo-orden-establecimiento-error" className="text-sm text-destructive">{errors.establecimiento_id.message}</p>}
          {noActiveEstablishments && <p className="text-sm text-muted-foreground">El cliente no tiene establecimientos activos disponibles.</p>}
        </div>

        {queriesError && <p className="text-sm text-destructive md:col-span-2">No se pudieron cargar los clientes o establecimientos autorizados.</p>}

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-orden-codigo">Código interno</Label>
          <Input id="campo-orden-codigo" {...register("codigo_interno")} disabled={controlsDisabled} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campo-orden-fecha-inicio">Fecha de inicio planificada</Label>
          <Input id="campo-orden-fecha-inicio" type="date" {...register("fecha_inicio_planificada")} disabled={controlsDisabled} aria-invalid={Boolean(errors.fecha_inicio_planificada)} aria-describedby={errors.fecha_inicio_planificada ? "campo-orden-fecha-inicio-error" : undefined} />
          {errors.fecha_inicio_planificada && <p id="campo-orden-fecha-inicio-error" className="text-sm text-destructive">{errors.fecha_inicio_planificada.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="campo-orden-fecha-fin">Fecha de fin planificada</Label>
          <Input id="campo-orden-fecha-fin" type="date" {...register("fecha_fin_planificada")} disabled={controlsDisabled} aria-invalid={Boolean(errors.fecha_fin_planificada)} aria-describedby={errors.fecha_fin_planificada ? "campo-orden-fecha-fin-error" : undefined} />
          {errors.fecha_fin_planificada && <p id="campo-orden-fecha-fin-error" className="text-sm text-destructive">{errors.fecha_fin_planificada.message}</p>}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-orden-descripcion">Descripción</Label>
          <Textarea id="campo-orden-descripcion" {...register("descripcion")} disabled={controlsDisabled} rows={3} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="campo-orden-observaciones">Observaciones</Label>
          <Textarea id="campo-orden-observaciones" {...register("observaciones")} disabled={controlsDisabled} rows={3} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancelar</Button>
        <Button type="submit" variant="success" disabled={controlsDisabled || queriesLoading || queriesError || noClients || noActiveEstablishments}>
          {isSaving ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear orden"}
        </Button>
      </div>
    </form>
  );
}
