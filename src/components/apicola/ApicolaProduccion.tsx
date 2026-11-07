import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useApicolaProduccion, useApicolaProduccionOperar } from '@/hooks/useApicolaProduccion';
import type { ApicolaCatalogos, ApicolaFila, ApicolaFiltro } from '@/types/apicola';
import type { ProduccionApicola, VistaProduccionApicola } from '@/types/apicolaProduccion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { ApicolaTrazabilidadLote } from './ApicolaTrazabilidadLote';

const titulos = { cosechas: 'Cosechas', extracciones: 'Extracciones', lotes: 'Lotes de miel', tambores: 'Tambores' };
const acciones = { cosechas: 'cosecha', extracciones: 'extraccion', tambores: 'tambor' };
const numero = (n: unknown) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 3 });
const selectClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm';
const textoRequerido = z.string().trim().min(1, 'Completá este campo').max(60);
const peso = z.coerce.number().positive('Ingresá un peso mayor a cero').max(99999999).multipleOf(0.001, 'Usá hasta 3 decimales');
const schema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('cosecha'), codigo: textoRequerido, campana_id: z.string().uuid(), apiario_id: z.string().uuid(), fecha: z.string().min(10), alzas: z.coerce.number().int().positive(), responsable: textoRequerido, observaciones: z.string().max(5000) }),
  z.object({ tipo: z.literal('extraccion'), codigo: textoRequerido, campana_id: z.string().uuid(), fecha: z.string().min(10), sala_id: z.string().uuid(), responsable: textoRequerido, kg: peso, lote_codigo: textoRequerido, floracion: z.string().max(500), humedad: z.string().refine(v => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100), 'Humedad entre 0 y 100'), observaciones: z.string().max(5000), origenes: z.array(z.object({ cosecha_id: z.string().uuid(), alzas: z.coerce.number().int().positive() })).min(1, 'Seleccioná una cosecha') }),
  z.object({ tipo: z.literal('tambor'), codigo: textoRequerido, lote_id: z.string().uuid(), fecha: z.string().min(10), bruto: peso, tara: z.coerce.number().min(0).multipleOf(0.001), ubicacion: z.string().trim().min(1).max(200) }),
]).superRefine((d, ctx) => { if (d.tipo === 'tambor' && d.bruto <= d.tara) ctx.addIssue({ code: 'custom', path: ['tara'], message: 'La tara debe ser menor al peso bruto' }); });
type Valores = z.infer<typeof schema>;

function FormularioProduccion({ tipo, datos, catalogos, guardar, pendiente, error }: { tipo: 'cosecha' | 'extraccion' | 'tambor'; datos: ProduccionApicola; catalogos: ApicolaCatalogos; guardar: (d: Valores) => void; pendiente: boolean; error?: string }) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<Valores>({ resolver: zodResolver(schema), defaultValues: { tipo, codigo: '', fecha: format(new Date(), 'yyyy-MM-dd'), campana_id: '', apiario_id: '', alzas: 1, responsable: '', observaciones: '', sala_id: '', lote_codigo: '', floracion: '', humedad: '', origenes: [], lote_id: '', bruto: 0, tara: 0, ubicacion: '' } });
  const valores = watch();
  const campana = 'campana_id' in valores ? valores.campana_id : '';
  const disponibles = datos.cosechas.filter(c => c.estado === 'vigente' && c.campana_id === campana).map(c => ({ ...c, saldo: c.alzas - datos.origenes.filter(o => o.cosecha_id === c.id && datos.extracciones.some(e => e.id === o.extraccion_id && e.estado === 'vigente')).reduce((s, o) => s + o.alzas, 0) })).filter(c => c.saldo > 0);
  const campo = (key: Parameters<typeof register>[0], label: string, type = 'text', extra: Record<string, unknown> = {}) => <div className="space-y-1"><Label htmlFor={`prod-${key}`}>{label}</Label><Input id={`prod-${key}`} type={type} className="h-11" {...register(key)} {...extra} /></div>;
  return <form className="space-y-4" onSubmit={handleSubmit(guardar)}>
    <fieldset disabled={pendiente} className="grid gap-4 sm:grid-cols-2">
      {campo('codigo', 'Código', 'text', { maxLength: 60 })}
      {campo('fecha', 'Fecha', 'date', { max: format(new Date(), 'yyyy-MM-dd') })}
      {tipo !== 'tambor' && <><div className="space-y-1"><Label htmlFor="prod-campana">Campaña abierta</Label><select id="prod-campana" className={selectClass} {...register('campana_id', { onChange: () => setValue('origenes', []) })}><option value="">Seleccionar campaña</option>{catalogos.campanas.filter(c => c.estado === 'abierta').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>{campo('responsable', 'Responsable')}</>}
      {tipo === 'cosecha' && <><div className="space-y-1"><Label htmlFor="prod-apiario">Apiario</Label><select id="prod-apiario" className={selectClass} {...register('apiario_id')}><option value="">Seleccionar apiario</option>{catalogos.apiarios.filter(a => a.activo).map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}</select></div>{campo('alzas', 'Alzas cosechadas', 'number', { min: 1, step: 1 })}<p className="text-xs text-muted-foreground sm:col-span-2">Registra alzas con miel retiradas para extracción. No modifica el inventario de material del apiario.</p></>}
      {tipo === 'extraccion' && <>
        <div className="space-y-1"><Label htmlFor="prod-sala">Sala de extracción</Label><select id="prod-sala" className={selectClass} {...register('sala_id')}><option value="">Seleccionar sala</option>{datos.salas.filter(s => s.activo).map(s => <option key={s.id} value={s.id}>{s.nombre} · {s.tipo}</option>)}</select></div>{campo('kg', 'Miel extraída (kg)', 'number', { min: 0.001, step: 0.001 })}
        {campo('lote_codigo', 'Código del lote de miel')}{campo('floracion', 'Floración informada')}{campo('humedad', 'Humedad informada (%)', 'number', { min: 0, max: 100, step: 0.01 })}
        <div className="space-y-3 sm:col-span-2"><h3 className="font-medium">Cosechas de origen</h3><p className="text-sm text-muted-foreground">Indicá cuántas alzas se procesaron de cada cosecha. Se conserva el origen de las mezclas.</p>{disponibles.length ? disponibles.map(c => <div className="flex items-center gap-3" key={c.id}><Label htmlFor={`origen-${c.id}`} className="flex-1">{c.codigo} · {catalogos.apiarios.find(a => a.id === c.apiario_id)?.nombre} · {c.saldo} disponibles</Label><Input id={`origen-${c.id}`} aria-label={`Alzas de ${c.codigo}`} className="h-11 w-24" type="number" min="0" max={c.saldo} step="1" value={valores.tipo === 'extraccion' ? valores.origenes.find(o => o.cosecha_id === c.id)?.alzas || '' : ''} onChange={event => { const prev = valores.tipo === 'extraccion' ? valores.origenes : []; setValue('origenes', [...prev.filter(o => o.cosecha_id !== c.id), ...(Number(event.target.value) > 0 ? [{ cosecha_id: c.id, alzas: Number(event.target.value) }] : [])], { shouldValidate: true }); }} /></div>) : <p className="text-sm">No hay cosechas con alzas disponibles en esta campaña.</p>}</div>
      </>}
      {tipo === 'tambor' && <><div className="space-y-1 sm:col-span-2"><Label htmlFor="prod-lote">Lote de miel</Label><select id="prod-lote" className={selectClass} {...register('lote_id')}><option value="">Seleccionar lote</option>{datos.lotes.filter(l => datos.extracciones.some(e => e.id === l.extraccion_id && e.estado === 'vigente' && catalogos.campanas.some(c => c.id === e.campana_id && c.estado === 'abierta'))).map(l => { const e = datos.extracciones.find(x => x.id === l.extraccion_id)!; const saldo = datos.stock.lotes.find(s => s.id === l.id)?.sin_envasar_kg || 0; return <option key={l.id} value={l.id}>{l.codigo} · {numero(saldo)} kg disponibles</option>; })}</select></div>{campo('bruto', 'Peso bruto (kg)', 'number', { min: 0.001, step: 0.001 })}{campo('tara', 'Tara (kg)', 'number', { min: 0, step: 0.001 })}{campo('ubicacion', 'Ubicación del tambor')}<p className="self-center text-sm">Peso neto: <strong>{numero(valores.tipo === 'tambor' ? Number(valores.bruto) - Number(valores.tara) : 0)} kg</strong></p></>}
      {tipo !== 'tambor' && <div className="space-y-1 sm:col-span-2"><Label htmlFor="prod-observaciones">Observaciones</Label><Textarea id="prod-observaciones" {...register('observaciones')} maxLength={5000} /></div>}
    </fieldset>
    {Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-destructive">Revisá los campos requeridos, las cantidades y los orígenes. Los pesos admiten hasta 3 decimales.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="min-h-11 w-full" disabled={pendiente}>{pendiente ? 'Guardando...' : 'Guardar registro'}</Button>
  </form>;
}

export function ApicolaProduccion({ comercioId, vista, catalogos, filtro, admin, operar }: { comercioId: string; vista: VistaProduccionApicola; catalogos: ApicolaCatalogos; filtro: ApicolaFiltro; admin: boolean; operar: boolean }) {
  const consulta = useApicolaProduccion(comercioId), mutacion = useApicolaProduccionOperar(comercioId);
  const [editor, setEditor] = useState(false), [detalle, setDetalle] = useState<ApicolaFila | null>(null), [anular, setAnular] = useState<ApicolaFila | null>(null), [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState<{ accion: string; datos: Record<string, unknown>; clave: string } | null>(null);
  const datos = consulta.data;
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('lote'); if (vista === 'lotes' && id && datos) setDetalle(datos.lotes.find(l => l.id === id) || null); }, [vista, datos]);
  const fechaVisible = (fecha: string) => (!filtro.desde || fecha >= filtro.desde) && (!filtro.hasta || fecha <= filtro.hasta);
  const cosechas = datos?.cosechas.filter(c => (!filtro.campana || c.campana_id === filtro.campana) && (!filtro.apiario || c.apiario_id === filtro.apiario)) || [];
  const extracciones = datos?.extracciones.filter(e => (!filtro.campana || e.campana_id === filtro.campana) && (!filtro.apiario || datos.origenes.some(o => o.extraccion_id === e.id && cosechas.some(c => c.id === o.cosecha_id)))) || [];
  const lotes = datos?.lotes.filter(l => extracciones.some(e => e.id === l.extraccion_id)) || [];
  const filas = (vista === 'cosechas' ? cosechas : vista === 'extracciones' ? extracciones : vista === 'lotes' ? lotes : datos?.tambores.filter(t => lotes.some(l => l.id === t.lote_id)) || []).filter(row => fechaVisible(String(row.fecha || datos?.extracciones.find(e => e.id === row.extraccion_id)?.fecha || ''))).sort((a, b) => String(b.fecha || b.created_at).localeCompare(String(a.fecha || a.created_at)));
  const paginado = useTablePagination(filas, 'apicola-produccion', JSON.stringify([vista, filtro]));
  const ejecutar = (accion: string, valores: Record<string, unknown>, done: () => void) => {
    const solicitud = intento?.accion === accion && JSON.stringify(intento.datos) === JSON.stringify(valores) ? intento : { accion, datos: valores, clave: crypto.randomUUID() };
    setIntento(solicitud); mutacion.mutate(solicitud, { onSuccess: () => { setIntento(null); done(); } });
  };
  if (consulta.isPending) return <p role="status">Cargando producción...</p>;
  if (consulta.isError || !datos) return <Card><CardContent className="space-y-3 p-5"><p role="alert">No se pudo cargar producción y trazabilidad.</p><Button variant="outline" onClick={() => void consulta.refetch()}>Reintentar</Button></CardContent></Card>;
  const puedeCrear = operar && vista !== 'lotes' && (admin || vista === 'cosechas');
  const ficha = (row: ApicolaFila) => {
    const lote = vista === 'lotes' ? datos.lotes.find(l => l.id === row.id) : vista === 'tambores' ? datos.lotes.find(l => l.id === row.lote_id) : datos.lotes.find(l => l.extraccion_id === row.id);
    const extraccion = datos.extracciones.find(e => e.id === (vista === 'extracciones' ? row.id : lote?.extraccion_id));
    const origenes = datos.origenes.filter(o => vista === 'cosechas' ? o.cosecha_id === row.id : o.extraccion_id === extraccion?.id);
    const saldos = datos.stock.lotes.find(s => s.id === lote?.id); const envasado = saldos?.tambores_kg || 0;
    return <div className="space-y-4 text-sm">
      <p>Estado: <strong>{String(row.estado || extraccion?.estado || '—')}</strong></p>
      <p>Campaña: {catalogos.campanas.find(c => c.id === (extraccion?.campana_id || row.campana_id))?.nombre || '—'}</p>
      {vista === 'cosechas' && <p>{catalogos.apiarios.find(a => a.id === row.apiario_id)?.nombre} · {String(row.fecha)} · {numero(row.alzas)} alzas · {String(row.responsable)}</p>}
      {extraccion && <p>Extracción {extraccion.codigo} · {extraccion.fecha} · Sala: {extraccion.sala} · Responsable: {extraccion.responsable} · {numero(extraccion.kg)} kg</p>}
      {lote && <><p>Lote {lote.codigo} · Floración: {lote.floracion || 'Sin informar'} · Humedad: {lote.humedad == null ? 'Sin informar' : `${numero(lote.humedad)} %`}</p><p>Envasado vigente: {numero(envasado)} kg · Disponible a granel: {numero(saldos?.sin_envasar_kg || 0)} kg · Fraccionada disponible: {numero(saldos?.fraccionado_kg || 0)} kg</p></>}
      {vista === 'tambores' && <p>Bruto: {numero(row.bruto)} kg · Tara: {numero(row.tara)} kg · Neto: {numero(row.neto)} kg · {String(row.ubicacion)}</p>}
      <div className="space-y-2"><h3 className="font-semibold">{vista === 'cosechas' ? 'Extracciones vinculadas' : 'Orígenes de la miel'}</h3>{origenes.length ? origenes.map(o => { const c = datos.cosechas.find(c => c.id === o.cosecha_id); const e = datos.extracciones.find(e => e.id === o.extraccion_id); return <p key={`${o.cosecha_id}:${o.extraccion_id}`} className="rounded-md border p-3">Cosecha {c?.codigo} · {c?.fecha} · {catalogos.apiarios.find(a => a.id === c?.apiario_id)?.nombre} · {o.alzas} alzas → {e?.codigo} ({e?.estado})</p>; }) : <p>Sin extracciones vinculadas.</p>}</div>
      {vista === 'cosechas' && datos.lotes.filter(l => origenes.some(o => o.extraccion_id === l.extraccion_id)).map(l => <div key={l.id} className="space-y-2 rounded-md border p-3"><h3 className="font-semibold">Lote {l.codigo} · {l.estado_calidad}</h3>{datos.tambores.filter(t => t.lote_id === l.id).map(t => <p key={t.id}>Tambor {t.codigo} · {numero(t.neto)} kg · {t.ubicacion} · {t.estado}</p>)}</div>)}
      {lote && <div className="space-y-2"><p>Calidad del lote: <strong>{lote.estado_calidad}</strong></p><h3 className="font-semibold">Análisis del lote</h3>{datos.analisis.filter(a => a.lote_id === lote.id).map(a => <p className="whitespace-pre-wrap break-words" key={a.id}>{a.fecha} · {a.muestra} · {a.laboratorio} · {a.resultado} · {a.informe}</p>)}<h3 className="font-semibold">Tambores del lote</h3>{datos.tambores.filter(t => t.lote_id === lote.id).map(t => <p key={t.id}>{t.codigo} · {numero(t.neto)} kg · {t.ubicacion} · {t.estado}</p>)}</div>}
      {Boolean(row.observaciones) && <p className="whitespace-pre-wrap break-words">{String(row.observaciones)}</p>}
      {lote && <ApicolaTrazabilidadLote key={lote.id} comercioId={comercioId} loteId={lote.id} />}
      {Boolean(row.motivo_anulacion || extraccion?.motivo_anulacion) && <p>Motivo de anulación: {String(row.motivo_anulacion || extraccion?.motivo_anulacion)}</p>}
    </div>;
  };
  return <Card><CardHeader className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{titulos[vista]}</CardTitle>{puedeCrear && <Button className="min-h-11" onClick={() => { mutacion.reset(); setEditor(true); }}>Registrar {acciones[vista]}</Button>}</div><p className="text-sm text-muted-foreground">{vista === 'lotes' ? 'Cada extracción crea un lote de miel. Consultá sus orígenes, tambores y saldo a granel.' : 'Los registros se conservan. Para corregirlos, administración puede anularlos con motivo y registrar el reemplazo.'}</p>{filtro.apiario && vista !== 'cosechas' && <p className="text-sm text-muted-foreground">Incluye mezclas con origen en el apiario seleccionado. Los kilos corresponden a la extracción completa; no se atribuyen a un único apiario.</p>}</CardHeader><CardContent className="space-y-4">
    <p className="text-sm">{filas.length} registros{vista === 'extracciones' ? ` · ${numero(filas.filter(r => r.estado === 'vigente').reduce((s, r) => s + Number(r.kg), 0))} kg extraídos vigentes` : vista === 'tambores' ? ` · ${numero(filas.filter(r => r.estado === 'vigente').reduce((s, r) => s + Number(r.neto), 0))} kg netos vigentes` : ''}</p>
    <div className="grid gap-3 md:grid-cols-2">{paginado.items.map(row => <article key={row.id} className="min-w-0 space-y-3 rounded-md border p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="break-words font-semibold">{String(row.codigo)}</h3><Badge variant={row.estado === 'anulado' ? 'secondary' : 'outline'}>{String(row.estado || datos.extracciones.find(e => e.id === row.extraccion_id)?.estado || '')}</Badge></div><p className="text-sm text-muted-foreground">{String(row.fecha || datos.extracciones.find(e => e.id === row.extraccion_id)?.fecha || '')}{vista === 'cosechas' ? ` · ${numero(row.alzas)} alzas · ${catalogos.apiarios.find(a => a.id === row.apiario_id)?.nombre || ''}` : vista === 'extracciones' ? ` · ${numero(row.kg)} kg` : vista === 'tambores' ? ` · ${numero(row.neto)} kg netos · ${String(row.ubicacion)}` : ` · ${String(row.floracion || 'Floración sin informar')}`}</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => setDetalle(row)}>Ver trazabilidad</Button>{admin && vista !== 'lotes' && row.estado === 'vigente' && <Button variant="outline" className="min-h-11" onClick={() => { setAnular(row); setMotivo(''); mutacion.reset(); }}>Anular</Button>}</div></article>)}</div>
    {!filas.length && <p className="text-sm text-muted-foreground">Sin registros para los filtros seleccionados.</p>}
    <TablePaginationControls id="apicola-produccion" label="registros" pagination={paginado} />
    <Dialog open={editor} onOpenChange={open => { if (!mutacion.isPending) setEditor(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Registrar {vista !== 'lotes' ? acciones[vista] : ''}</DialogTitle><DialogDescription>Se validarán los orígenes y los saldos al guardar.</DialogDescription></DialogHeader>{editor && vista !== 'lotes' && <FormularioProduccion tipo={acciones[vista] as 'cosecha' | 'extraccion' | 'tambor'} datos={datos} catalogos={catalogos} guardar={d => ejecutar(d.tipo, d, () => setEditor(false))} pendiente={mutacion.isPending} error={mutacion.error?.message} />}</DialogContent></Dialog>
    <Dialog open={Boolean(detalle)} onOpenChange={open => !open && setDetalle(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Trazabilidad · {String(detalle?.codigo || '')}</DialogTitle><DialogDescription>Campaña, apiarios de origen, extracción, lote y envasado.</DialogDescription></DialogHeader>{detalle && ficha(detalle)}</DialogContent></Dialog>
    <Dialog open={Boolean(anular)} onOpenChange={open => { if (!open && !mutacion.isPending) setAnular(null); }}><DialogContent><DialogHeader><DialogTitle>Anular {String(anular?.codigo || '')}</DialogTitle><DialogDescription>Primero deben anularse los registros dependientes. El historial se conserva.</DialogDescription></DialogHeader><Label htmlFor="prod-motivo">Motivo</Label><Textarea id="prod-motivo" value={motivo} maxLength={1000} onChange={e => setMotivo(e.target.value)} disabled={mutacion.isPending} />{mutacion.error && <p role="alert" className="text-sm text-destructive">{mutacion.error.message}</p>}<Button disabled={mutacion.isPending || motivo.trim().length < 5} onClick={() => anular && vista !== 'lotes' && ejecutar(`anular_${acciones[vista]}`, { id: anular.id, version: anular.version, motivo }, () => setAnular(null))}>Confirmar anulación</Button></DialogContent></Dialog>
  </CardContent></Card>;
}
