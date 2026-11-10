import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TransporteCampo } from './transporteCampos';

export function TransporteForm({ campos, valores = {}, guardar, pending, cancelar }: { campos: TransporteCampo[]; valores?: object; guardar: (datos: Record<string, unknown>) => Promise<void>; pending: boolean; cancelar?: () => void }) {
  const row = valores as Record<string, unknown>;
  const shape = Object.fromEntries(campos.map(f => [f.key, z.string().refine(v => !f.required || v.trim().length > 0, 'Campo obligatorio').refine(v => f.type !== 'number' || v === '' || (Number.isFinite(Number(v)) && Number(v) >= (f.min ?? 0)), `Ingresá un valor mayor o igual a ${f.min ?? 0}`)]));
  const defaults = Object.fromEntries(campos.map(f => {
    let value = row[f.key] ?? (f.key.startsWith('detalle_') ? (row.detalles as Record<string, string> | undefined)?.[f.key.slice(8)] : undefined) ?? f.initial ?? '';
    if (f.type === 'datetime-local' && value) { const d = new Date(String(value)); value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    return [f.key, String(value)];
  }));
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<Record<string, string>>({ resolver: zodResolver(z.object(shape)), defaultValues: defaults });
  return <form className="space-y-4" onSubmit={handleSubmit(async raw => {
    const datos: Record<string, unknown> = {};
    const detalles: Record<string, string> = {};
    for (const f of campos) {
      const value = raw[f.key]?.trim() ?? '';
      if (f.key.startsWith('detalle_')) detalles[f.key.slice(8)] = value;
      else datos[f.key] = f.type === 'number' || f.key === 'iva' ? (value === '' ? null : Number(value)) : f.key === 'activo' ? value === 'true' : f.type === 'datetime-local' ? (value ? new Date(value).toISOString() : null) : value || (f.options || f.type === 'date' ? null : '');
    }
    if (Object.keys(detalles).length) datos.detalles = detalles;
    try { await guardar(datos); } catch { setError('root', { message: 'No se guardaron los cambios. Revisá el aviso y los datos e intentá nuevamente.' }); }
  })}>
    <div className="grid gap-4 sm:grid-cols-2">{campos.map(f => <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
      <Label htmlFor={`transporte-${f.key}`}>{f.label}{f.required ? ' *' : ''}</Label>
      {f.options ? <select id={`transporte-${f.key}`} className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-sm" {...register(f.key)}><option value="">Seleccionar…</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.type === 'textarea' ? <Textarea id={`transporte-${f.key}`} {...register(f.key)} /> : <Input className="mt-1 h-11" id={`transporte-${f.key}`} type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? f.min ?? 0 : undefined} {...register(f.key)} />}
      {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}{errors[f.key] && <p className="text-sm text-destructive">{String(errors[f.key]?.message)}</p>}
    </div>)}</div>
    {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
    <div className="flex flex-col gap-3 sm:flex-row"><Button className="h-11 w-full sm:w-auto" disabled={pending || isSubmitting} type="submit">{pending || isSubmitting ? 'Guardando…' : 'Guardar'}</Button>{cancelar && <Button className="h-11 w-full sm:w-auto" variant="outline" disabled={pending || isSubmitting} type="button" onClick={cancelar}>Cancelar</Button>}</div>
  </form>;
}
