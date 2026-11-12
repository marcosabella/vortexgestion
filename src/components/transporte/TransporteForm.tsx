import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TransporteCampo } from './transporteCampos';
import type { TransporteTarifa } from '@/types/transporte';
import { totalTransporte, transporteImporte } from '@/utils/transporte';

export function TransporteForm({ campos, valores = {}, tarifas = [], guardar, pending, cancelar }: { campos: TransporteCampo[]; valores?: object; tarifas?: TransporteTarifa[]; guardar: (datos: Record<string, unknown>) => Promise<void>; pending: boolean; cancelar?: () => void }) {
  const row = valores as Record<string, unknown>;
  const servicio = campos.some(f => f.key === 'modo_precio');
  const visible = (key: string, modo: string) => !servicio || !(
    (key === 'precio_km' && modo !== 'por_km') || (key === 'precio_manual' && modo !== 'fijo')
    || (['tarifa_id', 'horas_espera'].includes(key) && modo !== 'tarifa') || (key === 'iva' && modo === 'tarifa')
  );
  const shape = Object.fromEntries(campos.map(f => [f.key, z.string()]));
  const defaults = Object.fromEntries(campos.map(f => {
    let value = row[f.key] ?? (f.key.startsWith('detalle_') ? (row.detalles as Record<string, string> | undefined)?.[f.key.slice(8)] : undefined) ?? f.initial ?? '';
    if (f.type === 'datetime-local' && value) { const d = new Date(String(value)); value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    if (f.key === 'modo_precio') value = row.precio_km != null ? 'por_km' : row.precio_manual != null ? 'fijo' : row.tarifa_id ? 'tarifa' : 'por_km';
    return [f.key, String(value)];
  }));
  const schema = z.object(shape).superRefine((datos, ctx) => {
    for (const f of campos.filter(f => visible(f.key, datos.modo_precio))) {
      const v = datos[f.key].trim();
      if (f.required && !v) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f.key], message: 'Campo obligatorio' });
      if (f.type === 'number' && v && (!Number.isFinite(Number(v)) || Number(v) < (f.min ?? 0))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f.key], message: `Ingresá un valor mayor o igual a ${f.min ?? 0}` });
      if (f.decimales != null && v && Math.abs(Number(v) * 10 ** f.decimales - Math.round(Number(v) * 10 ** f.decimales)) > 0.0000001) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f.key], message: `Ingresá hasta ${f.decimales} decimales.` });
    }
    if (servicio) {
      if (datos.modo_precio === 'por_km') {
        for (const key of ['precio_km', 'km_facturables']) if (!(Number(datos[key]) > 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Ingresá un valor mayor a cero para calcular por kilómetro.' });
      } else if (datos.modo_precio === 'tarifa' && !datos.tarifa_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tarifa_id'], message: 'Seleccioná una tarifa.' });
      else if (datos.modo_precio === 'fijo' && !datos.precio_manual.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['precio_manual'], message: 'Ingresá el importe total fijo.' });
    }
    if (datos.unidad_id && datos.equipo_id && datos.unidad_id === datos.equipo_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['equipo_id'], message: 'El equipo adicional debe ser distinto de la unidad principal. Si no usás un acoplado, dejalo sin seleccionar.' });
  });
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, watch } = useForm<Record<string, string>>({ resolver: zodResolver(schema), defaultValues: defaults });
  const unidadSeleccionada = watch('unidad_id');
  const modo = watch('modo_precio');
  const km = Number(watch('km_facturables') || 0);
  const precioKm = Number(watch('precio_km') || 0);
  const tarifaId = watch('tarifa_id');
  const tarifa = row.tarifa_id === tarifaId && row.tarifa_snapshot ? row.tarifa_snapshot as TransporteTarifa : tarifas.find(t => t.id === tarifaId) ?? null;
  const total = servicio ? totalTransporte({ precio_km: modo === 'por_km' ? precioKm : null, precio_manual: modo === 'fijo' ? Number(watch('precio_manual') || 0) : null, tarifa_snapshot: modo === 'tarifa' ? tarifa : null, km_facturables: km, horas_espera: modo === 'tarifa' ? Number(watch('horas_espera') || 0) : 0, adicionales: Number(watch('adicionales') || 0) }) : 0;
  return <form className="space-y-4" onSubmit={handleSubmit(async raw => {
    const datos: Record<string, unknown> = {};
    const detalles: Record<string, string> = {};
    for (const f of campos) {
      if (f.key === 'modo_precio') continue;
      if (!visible(f.key, raw.modo_precio)) {
        if (f.key !== 'iva') datos[f.key] = f.key === 'horas_espera' ? 0 : null;
        continue;
      }
      const value = raw[f.key]?.trim() ?? '';
      if (f.key.startsWith('detalle_')) detalles[f.key.slice(8)] = value;
      else datos[f.key] = f.type === 'number' || f.key === 'iva' ? (value === '' ? null : Number(value)) : f.key === 'activo' ? value === 'true' : f.type === 'datetime-local' ? (value ? new Date(value).toISOString() : null) : value || (f.options || f.type === 'date' ? null : '');
    }
    if (Object.keys(detalles).length) datos.detalles = detalles;
    try { await guardar(datos); } catch { setError('root', { message: 'No se guardaron los cambios. Revisá el aviso y los datos e intentá nuevamente.' }); }
  })}>
    <div className="grid gap-4 sm:grid-cols-2">{campos.filter(f => visible(f.key, modo)).map(f => <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
      <Label htmlFor={`transporte-${f.key}`}>{f.label}{f.required ? ' *' : ''}</Label>
      {f.options ? <select id={`transporte-${f.key}`} className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-sm" {...register(f.key)}><option value="">Seleccionar…</option>{f.options.map(o => <option key={o.value} value={o.value} disabled={f.key === 'equipo_id' && o.value === unidadSeleccionada}>{o.label}</option>)}</select>
        : f.type === 'textarea' ? <Textarea id={`transporte-${f.key}`} {...register(f.key)} /> : <Input className="mt-1 h-11" id={`transporte-${f.key}`} type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? f.min ?? 0 : undefined} {...register(f.key)} />}
      {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}{errors[f.key] && <p className="text-sm text-destructive">{String(errors[f.key]?.message)}</p>}
    </div>)}</div>
    {servicio && <div className="rounded-md border p-4 text-sm" role="status" aria-live="polite">
      {modo === 'por_km' && <p>{km.toLocaleString('es-AR')} km facturables × {transporteImporte(precioKm)} por km</p>}
      <p className="font-semibold">Total final, IVA incluido: {transporteImporte(Number.isFinite(total) ? total : 0)}</p>
      <p className="text-muted-foreground">Incluye los adicionales cargados. El recorrido de aproximación, traslado y retorno no modifica automáticamente los kilómetros facturables.</p>
    </div>}
    {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
    <div className="flex flex-col gap-3 sm:flex-row"><Button className="h-11 w-full sm:w-auto" disabled={pending || isSubmitting} type="submit">{pending || isSubmitting ? 'Guardando…' : 'Guardar'}</Button>{cancelar && <Button className="h-11 w-full sm:w-auto" variant="outline" disabled={pending || isSubmitting} type="button" onClick={cancelar}>Cancelar</Button>}</div>
  </form>;
}
