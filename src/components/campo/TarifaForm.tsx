import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCampoClientes } from "@/hooks/useCampoClientes";
import { useCampoEstablecimientos } from "@/hooks/useCampoEstablecimientos";
import { type CampoTarifa, useSaveCampoTarifa } from "@/hooks/useCampoTarifas";
import {
  nivelLabel,
  type TarifaFormValues,
  tarifaNiveles,
  tarifaSchema,
  tarifaUnidades,
} from "@/utils/campoComercial";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
export function TarifaForm(
  { comercioId, allowed, item, rows, onSuccess, onSaving }: {
    comercioId: string;
    allowed: boolean;
    item: CampoTarifa | null;
    rows: CampoTarifa[];
    onSuccess: () => void;
    onSaving: (v: boolean) => void;
  },
) {
  const clientes = useCampoClientes(comercioId, allowed);
  const establecimientos = useCampoEstablecimientos(comercioId, allowed);
  const save = useSaveCampoTarifa(comercioId, allowed, rows);
  const {
    register,
    watch,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TarifaFormValues>({
    resolver: zodResolver(tarifaSchema),
    defaultValues: {
      nombre: item?.nombre ?? "",
      codigo_interno: item?.codigo_interno ?? "",
      unidad: tarifaUnidades.find((u) => u === item?.unidad) ?? "ha",
      nivel: tarifaNiveles.find((n) => n === item?.nivel) ?? "general",
      cliente_id: item?.cliente_id ?? "",
      establecimiento_id: item?.establecimiento_id ?? "",
      precio_unitario: item ? String(item.precio_unitario) : "",
      porcentaje_iva: item ? String(item.porcentaje_iva) : "21",
      vigente_desde: item?.vigente_desde ?? "",
      vigente_hasta: item?.vigente_hasta ?? "",
      observaciones: item?.observaciones ?? "",
      activo: item?.activo ?? true,
    },
  });
  const nivel = watch("nivel"), clienteId = watch("cliente_id");
  const opciones = (establecimientos.data ?? []).filter((e) =>
    e.cliente_id === clienteId
  );
  const pending = save.isPending || isSubmitting;
  useEffect(() => onSaving(pending), [onSaving, pending]);
  const unavailable = clientes.isLoading || establecimientos.isLoading ||
    Boolean(clientes.error || establecimientos.error);
  const submit = handleSubmit(async (values) => {
    if (pending || !allowed || unavailable) return;
    if (
      values.nivel !== "general" &&
      !clientes.data?.some((c) => c.id === values.cliente_id)
    ) {
      setError("cliente_id", {
        message: "Elegí un cliente autorizado del comercio.",
      });
      return;
    }
    if (
      values.nivel === "establecimiento" &&
      !opciones.some((e) => e.id === values.establecimiento_id)
    ) {
      setError("establecimiento_id", {
        message: "Elegí un establecimiento autorizado del cliente.",
      });
      return;
    }
    try {
      await save.mutateAsync({ id: item?.id, values });
      onSuccess();
    } catch { /* conserva valores; mensaje seguro en el hook */ }
  });
  const error = (name: keyof TarifaFormValues) =>
    errors[name] && (
      <p className="text-sm text-destructive" role="alert">
        {errors[name]?.message}
      </p>
    );
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset
        disabled={pending || !allowed}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Label htmlFor="tarifa-nombre">Nombre *</Label>
          <Input id="tarifa-nombre" {...register("nombre")} />
          {error("nombre")}
        </div>
        <div>
          <Label htmlFor="tarifa-codigo">Código interno</Label>
          <Input id="tarifa-codigo" {...register("codigo_interno")} />
        </div>
        <div>
          <Label htmlFor="tarifa-unidad">Unidad *</Label>
          <select
            id="tarifa-unidad"
            className={selectClass}
            {...register("unidad")}
          >
            {tarifaUnidades.map((u) => (
              <option key={u} value={u}>
                {u === "fijo" ? "Fijo por labor" : u}
              </option>
            ))}
          </select>
          {error("unidad")}
        </div>
        <div>
          <Label htmlFor="tarifa-nivel">Alcance *</Label>
          <select
            id="tarifa-nivel"
            className={selectClass}
            {...register("nivel", {
              onChange: () => {
                setValue("cliente_id", "");
                setValue("establecimiento_id", "");
              },
            })}
          >
            {tarifaNiveles.map((n) => (
              <option key={n} value={n}>{nivelLabel[n]}</option>
            ))}
          </select>
          {error("nivel")}
        </div>
        <div>
          <Label htmlFor="tarifa-moneda">Moneda</Label>
          <Input id="tarifa-moneda" value="ARS" readOnly />
        </div>
        {nivel !== "general" && (
          <div>
            <Label htmlFor="tarifa-cliente">Cliente *</Label>
            <select
              id="tarifa-cliente"
              className={selectClass}
              disabled={pending || unavailable}
              {...register("cliente_id", {
                onChange: () => setValue("establecimiento_id", ""),
              })}
            >
              <option value="">Elegí un cliente</option>
              {(clientes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.nombre, c.apellido].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
            {error("cliente_id")}
          </div>
        )}
        {nivel === "establecimiento" && (
          <div>
            <Label htmlFor="tarifa-establecimiento">Establecimiento *</Label>
            <select
              id="tarifa-establecimiento"
              className={selectClass}
              disabled={pending || unavailable || !clienteId}
              {...register("establecimiento_id")}
            >
              <option value="">Elegí un establecimiento</option>
              {opciones.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
            {error("establecimiento_id")}
            {clienteId && !unavailable && !opciones.length && (
              <p className="text-sm text-muted-foreground">
                El cliente no tiene establecimientos disponibles.
              </p>
            )}
          </div>
        )}
        <div>
          <Label htmlFor="tarifa-precio">Precio unitario *</Label>
          <Input
            id="tarifa-precio"
            inputMode="decimal"
            {...register("precio_unitario")}
          />
          {error("precio_unitario")}
        </div>
        <div>
          <Label htmlFor="tarifa-iva">IVA (%) *</Label>
          <Input
            id="tarifa-iva"
            inputMode="decimal"
            {...register("porcentaje_iva")}
          />
          {error("porcentaje_iva")}
        </div>
        <div>
          <Label htmlFor="tarifa-desde">Vigente desde *</Label>
          <Input id="tarifa-desde" type="date" {...register("vigente_desde")} />
          {error("vigente_desde")}
        </div>
        <div>
          <Label htmlFor="tarifa-hasta">Vigente hasta</Label>
          <Input id="tarifa-hasta" type="date" {...register("vigente_hasta")} />
          {error("vigente_hasta")}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tarifa-observaciones">Observaciones</Label>
          <Textarea id="tarifa-observaciones" {...register("observaciones")} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("activo")} />Tarifa activa
        </label>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={pending || unavailable}
            variant="success"
          >
            {pending ? "Guardando..." : "Guardar tarifa"}
          </Button>
        </div>
      </fieldset>
      {unavailable && (
        <p role="status" className="text-sm text-muted-foreground">
          {clientes.error || establecimientos.error
            ? "No se pudieron cargar las opciones autorizadas. Cerrá y volvé a intentar."
            : "Cargando clientes y establecimientos..."}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Los cambios del catálogo no modifican los precios ya guardados en las
        labores.
      </p>
    </form>
  );
}
