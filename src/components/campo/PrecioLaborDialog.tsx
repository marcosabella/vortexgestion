import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  campoComercialError,
  fechaComercial,
  formatoComercial,
  nivelLabel,
} from "@/utils/campoComercial";
import {
  type PrecioLaborContext,
  precioLaborSchema,
  type PrecioLaborValues,
  useConfigurarCampoPrecio,
  useResolverCampoTarifa,
} from "@/hooks/useCampoPrecioLabor";

export function PrecioLaborDialog(
  { context, onClose }: { context: PrecioLaborContext; onClose: () => void },
) {
  const [saving, setSaving] = useState(false);
  const { register, watch, handleSubmit, formState: { errors } } = useForm<
    PrecioLaborValues
  >({
    resolver: zodResolver(precioLaborSchema),
    defaultValues: {
      modo: !context.labor.facturable
        ? "no_facturable"
        : context.labor.precio_origen === "manual"
        ? "manual"
        : "tarifa",
      precio: context.labor.precio_unitario_snapshot === null
        ? ""
        : String(context.labor.precio_unitario_snapshot),
      iva: context.labor.porcentaje_iva_snapshot === null
        ? ""
        : String(context.labor.porcentaje_iva_snapshot),
    },
  });
  const modo = watch("modo"),
    resolved = useResolverCampoTarifa(context, modo === "tarifa");
  const tarifa = !resolved.error && !resolved.isFetching
    ? resolved.data ?? null
    : null;
  const mutation = useConfigurarCampoPrecio(context, tarifa);
  const pending = saving || mutation.isPending;
  const allowed = context.hasAccess && context.isAdmin &&
    context.orden.estado === "borrador" &&
    context.labor.orden_id === context.orden.id;
  const submit = handleSubmit(async (v) => {
    if (pending || !allowed || (v.modo === "tarifa" && !tarifa)) return;
    setSaving(true);
    try {
      await mutation.mutateAsync(v);
      onClose();
    } catch {
      /* conserva valores */
    } finally {
      setSaving(false);
    }
  });
  return (
    <Dialog
      open={allowed}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className={`max-h-[90vh] max-w-xl overflow-y-auto ${
          pending ? "[&>button]:hidden" : ""
        }`}
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Precio facturable · {context.labor.nombre}</DialogTitle>
          <DialogDescription>
            La configuración guarda el precio de esta labor. Sólo se puede
            cambiar mientras la orden esté en borrador.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset disabled={pending || !allowed} className="space-y-4">
            <div>
              <Label htmlFor="labor-precio-modo">Configuración</Label>
              <select
                id="labor-precio-modo"
                className="h-10 w-full rounded-md border bg-background px-3"
                {...register("modo")}
              >
                <option value="no_facturable">No facturable</option>
                <option value="tarifa">Usar tarifa vigente</option>
                <option value="manual">Precio manual</option>
              </select>
            </div>
            {modo === "manual" && (
              <>
                <div>
                  <Label htmlFor="labor-precio">Precio unitario (ARS)</Label>
                  <Input
                    id="labor-precio"
                    inputMode="decimal"
                    {...register("precio")}
                  />
                  {"precio" in errors && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.precio?.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="labor-iva">IVA (%)</Label>
                  <Input
                    id="labor-iva"
                    inputMode="decimal"
                    {...register("iva")}
                  />
                  {"iva" in errors && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.iva?.message}
                    </p>
                  )}
                </div>
              </>
            )}
            {modo === "tarifa" && (
              <div
                className="space-y-2 rounded-md border p-3"
                aria-live="polite"
              >
                {resolved.isFetching
                  ? <p>Consultando tarifa vigente...</p>
                  : resolved.error
                  ? (
                    <p role="alert" className="text-destructive">
                      {campoComercialError(resolved.error)}
                    </p>
                  )
                  : tarifa
                  ? (
                    <dl className="grid gap-2 text-sm">
                      <div>
                        <dt>Tarifa</dt>
                        <dd className="font-medium">
                          {tarifa.nombre} · {nivelLabel[tarifa.nivel]}
                        </dd>
                      </div>
                      <div>
                        <dt>Precio unitario</dt>
                        <dd>
                          ARS {formatoComercial(tarifa.precio_unitario)} /{" "}
                          {tarifa.unidad}
                        </dd>
                      </div>
                      <div>
                        <dt>IVA</dt>
                        <dd>{formatoComercial(tarifa.porcentaje_iva)} %</dd>
                      </div>
                      <div>
                        <dt>Vigencia</dt>
                        <dd>
                          {fechaComercial(tarifa.vigente_desde)} —{" "}
                          {fechaComercial(tarifa.vigente_hasta)}
                        </dd>
                      </div>
                    </dl>
                  )
                  : (
                    <p>
                      No hay tarifa vigente para esta labor. Elegí precio manual
                      o no facturable.
                    </p>
                  )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || resolved.isFetching}
                  onClick={() => void resolved.refetch()}
                >
                  Actualizar tarifa
                </Button>
                <p className="text-xs text-muted-foreground">
                  Vigencia al día actual del sistema. Prioridad:
                  establecimiento, cliente y general.
                </p>
              </div>
            )}
            {modo === "no_facturable" && (
              <p className="text-sm text-muted-foreground">
                Se quitarán la tarifa y los valores comerciales guardados de
                esta labor.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                variant="success"
                type="submit"
                disabled={pending || (modo === "tarifa" && !tarifa)}
              >
                {pending ? "Guardando..." : "Aplicar configuración"}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
