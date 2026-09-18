import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampoParteFormValues } from "@/types/campo";

type LaborOption = { id: string; nombre: string; activo: boolean };
const schema: z.ZodType<CampoParteFormValues> = z.object({ orden_labor_id: z.string().uuid(), fecha_trabajo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hora_inicio: z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/), hora_fin: z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/), descripcion: z.string().trim(), observaciones: z.string().trim(), condiciones_climaticas: z.string().trim() }).refine((value) => !value.hora_inicio || !value.hora_fin || value.hora_fin > value.hora_inicio, { path: ["hora_fin"], message: "La hora fin debe ser posterior" });
function localDate() {
  const date = new Date(), year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, "0"), day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function ParteForm({ labores, initial, onSubmit, pending, onSaving }: { labores: LaborOption[]; initial?: CampoParteFormValues; onSubmit: (values: CampoParteFormValues) => Promise<void>; pending: boolean; onSaving: (value: boolean) => void }) {
  const { register, setValue, watch, handleSubmit, formState: { errors } } = useForm<CampoParteFormValues>({ resolver: zodResolver(schema), defaultValues: initial ?? { orden_labor_id: "", fecha_trabajo: localDate(), hora_inicio: "", hora_fin: "", descripcion: "", observaciones: "", condiciones_climaticas: "" } });
  useEffect(() => onSaving(pending), [onSaving, pending]);
  return <form className="space-y-4" onSubmit={handleSubmit(async (values) => { try { await onSubmit(values); } catch { /* mantiene el formulario abierto */ } })}>
    <div><Label htmlFor="parte-labor">Labor *</Label><Select value={watch("orden_labor_id")} onValueChange={(value) => setValue("orden_labor_id", value, { shouldValidate: true })} disabled={pending || Boolean(initial)}><SelectTrigger id="parte-labor"><SelectValue placeholder="Seleccionar labor" /></SelectTrigger><SelectContent>{labores.filter((labor) => labor.activo).map((labor) => <SelectItem key={labor.id} value={labor.id}>{labor.nombre}</SelectItem>)}</SelectContent></Select>{errors.orden_labor_id && <p className="text-sm text-destructive">Seleccioná una labor</p>}</div>
    <div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="parte-fecha">Fecha *</Label><Input id="parte-fecha" type="date" {...register("fecha_trabajo")} disabled={pending} />{errors.fecha_trabajo && <p className="text-sm text-destructive">Ingresá una fecha válida</p>}</div><div><Label htmlFor="parte-hora-inicio">Hora inicio</Label><Input id="parte-hora-inicio" type="time" {...register("hora_inicio")} disabled={pending} /></div><div><Label htmlFor="parte-hora-fin">Hora fin</Label><Input id="parte-hora-fin" type="time" {...register("hora_fin")} disabled={pending} />{errors.hora_fin && <p className="text-sm text-destructive">{errors.hora_fin.message}</p>}</div></div>
    <div><Label htmlFor="parte-descripcion">Descripción</Label><Textarea id="parte-descripcion" {...register("descripcion")} disabled={pending} /></div>
    <div><Label htmlFor="parte-observaciones">Observaciones</Label><Textarea id="parte-observaciones" {...register("observaciones")} disabled={pending} /></div>
    <div><Label htmlFor="parte-clima">Condiciones climáticas</Label><Textarea id="parte-clima" {...register("condiciones_climaticas")} disabled={pending} /></div>
    <Button type="submit" disabled={pending}>{pending ? "Guardando..." : "Guardar parte"}</Button>
  </form>;
}
