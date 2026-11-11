import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TransporteForm } from './TransporteForm';
import { TransporteLineaTiempo } from './TransporteLineaTiempo';
import type { TransporteCampo } from './transporteCampos';
import { supabase } from '@/integrations/supabase/client';
import type { useTransporte } from '@/hooks/useTransporte';
import { ESTADOS_TRANSPORTE, type EstadoTransporte, type TransporteDatos, type TransporteServicio } from '@/types/transporte';
import { PRESENTACIONES_TRANSPORTE, transporteError, transporteImporte } from '@/utils/transporte';

const siguientes: Partial<Record<EstadoTransporte, EstadoTransporte>> = { solicitado: 'asignado', asignado: 'en_camino', en_camino: 'en_lugar', en_lugar: 'trasladando', trasladando: 'finalizado' };
const presentaciones = PRESENTACIONES_TRANSPORTE;
export function TransporteServicioDetalle({ servicio: s, datos: d, run, pending }: { servicio: TransporteServicio; datos: TransporteDatos; run: ReturnType<typeof useTransporte>['run']; pending: boolean }) {
  const [transicion, setTransicion] = useState<EstadoTransporte | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [archivo, setArchivo] = useState<{ ruta: string; url: string } | null>(null);
  const u = d.unidades.find(u => u.id === s.unidad_id);
  const final = ['finalizado', 'cancelado', 'no_realizado'].includes(s.estado);
  const puedeOperar = d.permisos?.operar ?? true;
  const puedeEditar = d.permisos?.editar ?? true;
  const numero = (key: string, label: string): TransporteCampo => ({ key, label, type: 'number', required: true, min: 0, initial: 0 });
  const campos: TransporteCampo[] = [
    ...(transicion === 'en_camino' ? [{ ...numero('km_salida', 'Odómetro al salir'), initial: u?.kilometraje || 0 }] : []),
    ...(transicion === 'finalizado' ? [{ ...numero('km_llegada', 'Odómetro al regresar'), initial: u?.kilometraje || s.km_salida || 0 }, numero('km_aproximacion', 'Km de aproximación'), numero('km_traslado', 'Km de traslado'), numero('km_retorno', 'Km de retorno')] : []),
    { key: 'detalle', label: 'Novedad / motivo', type: 'textarea', required: transicion === 'cancelado' || transicion === 'no_realizado' },
  ];
  const abrir = async (ruta: string) => {
    setError('');
    const { data, error } = await supabase.storage.from('transporte').createSignedUrl(ruta, 60);
    if (error) setError(transporteError(error));
    else setArchivo({ ruta, url: data.signedUrl });
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2"><Badge>{ESTADOS_TRANSPORTE[s.estado]}</Badge>{d.admin && <Badge variant="secondary">{s.venta_id ? 'Facturado' : presentaciones[s.presentacion as keyof typeof presentaciones]}</Badge>}</div>
    <div className="grid gap-3 text-sm sm:grid-cols-2"><p><strong>Carga:</strong> {s.carga}</p><p><strong>Solicitante:</strong> {s.solicitante || '—'}</p><p><strong>Contacto:</strong> {s.contacto || '—'} {s.telefono && <a className="underline" href={`tel:${s.telefono}`}>{s.telefono}</a>}</p><p><strong>Expediente:</strong> {s.expediente || '—'}</p><p><strong>Unidad:</strong> {u?.nombre || 'Sin asignar'} · {u?.patente}</p><p><strong>Equipo:</strong> {d.unidades.find(u => u.id === s.equipo_id)?.nombre || 'Sin equipo adicional'}</p><p><strong>Chofer:</strong> {d.choferes.find(c => c.id === s.chofer_id)?.nombre || 'Sin asignar'}</p><p><strong>Programado:</strong> {s.programado_at ? new Date(s.programado_at).toLocaleString('es-AR') : 'Sin fecha'}</p>
      {[['Retiro', s.origen], ['Destino', s.destino]].map(([titulo, direccion]) => <p key={titulo}><strong>{titulo}:</strong> {direccion} <a className="underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`} target="_blank" rel="noreferrer">Abrir mapa</a></p>)}
      <p><strong>Odómetro:</strong> {s.km_salida ?? '—'} → {s.km_llegada ?? '—'}</p><p><strong>Tramos:</strong> {s.km_aproximacion} aproximación · {s.km_traslado} traslado · {s.km_retorno} retorno</p>
      {d.admin && <><p><strong>Importe IVA incluido:</strong> {transporteImporte(s.total)}</p><p>{s.km_facturables} km facturables · {s.horas_espera} h espera</p></>}
    </div>
    <p className="whitespace-pre-wrap text-sm">{s.observaciones}</p>
    <dl className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(s.detalles).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="font-medium capitalize">{k.replace(/_/g, ' ')}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>)}</dl>
    <div className="flex flex-wrap gap-2">
      {d.admin && puedeEditar && !s.presupuesto_id && !s.venta_id && !['cancelado', 'no_realizado'].includes(s.estado) && <Button asChild variant="outline" disabled={pending}><Link to={`/transporte/servicios/${s.id}/editar`}>Editar datos y asignación</Link></Button>}
      {puedeOperar && siguientes[s.estado] && <Button disabled={pending} onClick={() => setTransicion(siguientes[s.estado]!)}>{ESTADOS_TRANSPORTE[siguientes[s.estado]!]}</Button>}
      {d.admin && puedeOperar && !final && <><Button variant="outline" disabled={pending} onClick={() => setTransicion('no_realizado')}>No realizado</Button><Button variant="destructive" disabled={pending} onClick={() => setTransicion('cancelado')}>Cancelar servicio</Button></>}
      {d.admin && s.presupuesto_id && <Button asChild variant="outline"><Link to={`/presupuestos/${s.presupuesto_id}/editar`}>Ver presupuesto</Link></Button>}
      {d.admin && s.venta_id && <Button asChild variant="outline"><Link to="/ventas">Ver ventas y cobros</Link></Button>}
    </div>
    {transicion && <section className="rounded-lg border p-4"><h3 className="mb-3 font-semibold">Registrar: {ESTADOS_TRANSPORTE[transicion]}</h3><TransporteForm key={transicion} campos={campos} pending={pending} guardar={async datos => { await run({ accion: 'estado', id: s.id, version: s.version, datos: { ...datos, estado: transicion } }); setTransicion(null); }} /><Button variant="ghost" disabled={pending} onClick={() => setTransicion(null)}>Volver</Button></section>}
    {d.admin && puedeEditar && !s.venta_id && <section className="rounded-lg border p-4"><h3 className="mb-3 font-semibold">Documentación y revisión (opcionales)</h3><p className="mb-3 text-sm text-muted-foreground">Podés facturar el servicio finalizado sin adjuntar documentos ni crear un presupuesto. Usá esta revisión solo si el cliente lo requiere.</p><TransporteForm key={`${s.id}-${s.version}`} campos={[{ key: 'presentacion', label: 'Estado de presentación', required: true, options: Object.entries(presentaciones).map(([value, label]) => ({ value, label })) }, { key: 'detalle', label: 'Observación de la presentación' }]} valores={s} pending={pending} guardar={async datos => { await run({ accion: 'presentacion', id: s.id, version: s.version, datos }); }} /></section>}
    <section className="space-y-3"><h3 className="font-semibold">Fotos, documentación y constancias</h3><label className="block text-sm">Adjuntar imagen o PDF (opcional, hasta 10 MB)<input className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={!puedeOperar || subiendo || pending} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      setError('');
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Elegí una imagen JPG, PNG, WebP o un PDF de hasta 10 MB.'); return; }
      setSubiendo(true);
      const ruta = `${s.comercio_id}/${s.id}/${crypto.randomUUID()}.${file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]}`;
      try {
        const { error } = await supabase.storage.from('transporte').upload(ruta, file, { contentType: file.type });
        if (error) throw error;
        await run({ accion: 'adjunto', id: s.id, datos: { ruta, nombre: file.name } });
      } catch (error) { setError(transporteError(error)); } finally { setSubiendo(false); }
    }} /></label>{subiendo && <p role="status">Subiendo archivo…</p>}
      {d.adjuntos.filter(a => a.servicio_id === s.id).map(a => <div key={a.id} className="flex flex-wrap items-center gap-3 text-sm"><span>{a.nombre}</span><Button variant="outline" size="sm" onClick={() => void abrir(a.ruta)}>Preparar enlace</Button>{archivo?.ruta === a.ruta && <a className="underline" href={archivo.url} target="_blank" rel="noreferrer">Abrir archivo (enlace por 60 segundos)</a>}</div>)}
    </section>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <TransporteLineaTiempo eventos={d.eventos.filter(e => e.servicio_id === s.id)} />
  </div>;
}
