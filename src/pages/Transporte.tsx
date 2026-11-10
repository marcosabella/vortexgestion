import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Plus, RefreshCw, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTransporte } from '@/hooks/useTransporte';
import { transporteSecciones, transporteFormularios, type TransporteFormularioVista } from '@/config/transporteNavigation';
import { ESTADOS_TRANSPORTE, TIPOS_TRANSPORTE, type TransporteDatos, type TransporteServicio } from '@/types/transporte';
import { alertaTransporte, transporteError, transporteImporte } from '@/utils/transporte';
import { TransporteFormulario } from '@/pages/TransporteFormulario';
import { TransporteServicioDetalle } from '@/components/transporte/TransporteServicioDetalle';
import { TransporteLiquidacion } from '@/components/transporte/TransporteLiquidacion';

const fecha = (valor?: string | null) => valor ? new Date(valor.length === 10 ? `${valor}T12:00:00` : valor).toLocaleString('es-AR', valor.length === 10 ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha';

export default function Transporte() {
  const query = useTransporte();
  const { pathname } = useLocation();
  const [vista = 'resumen', registro, operacion, ...resto] = pathname.split('/').slice(2).filter(Boolean);
  if (!pathname.split('/')[2] || !transporteSecciones.some(s => s.vista === vista)) return <Navigate to="/transporte/resumen" replace />;
  if (query.isLoading || !query.comercio) return <p className="p-6">Cargando Transporte…</p>;
  if (query.error) return <div className="space-y-4 p-6" role="alert"><h1 className="text-xl font-semibold">Vortex Transporte</h1><p>{transporteError(query.error)}</p><Button onClick={() => void query.refetch()}>Reintentar</Button></div>;
  if (!query.data) return <p className="p-6">Transporte no está habilitado para el comercio seleccionado.</p>;
  if (registro) {
    const formulario = transporteFormularios[vista as TransporteFormularioVista];
    const nuevo = registro === 'nuevo' && !operacion;
    const editar = registro !== 'nuevo' && operacion === 'editar' && formulario?.editable;
    if (!formulario || resto.length || (!nuevo && !editar)) return <Navigate to={`/transporte/${vista}`} replace />;
    return <TransporteFormulario key={`${query.comercio.id}-${pathname}`} query={query} datos={query.data} vista={vista as TransporteFormularioVista} id={nuevo ? undefined : registro} />;
  }
  return <TransporteContenido key={`${query.comercio.id}-${vista}`} query={query} datos={query.data} vista={vista} />;
}

function TransporteContenido({ query, datos: d, vista }: { query: ReturnType<typeof useTransporte>; datos: TransporteDatos; vista: string }) {
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const detalle = d.servicios.find(s => s.id === detalleId);
  const unidad = (id: string | null) => d.unidades.find(u => u.id === id)?.nombre || 'Sin asignar';
  const cliente = (id: string) => { const c = d.clientes.find(c => c.id === id); return c ? `${c.nombre} ${c.apellido || ''}` : ''; };
  const coincide = (valor: unknown) => JSON.stringify(valor).toLocaleLowerCase('es-AR').includes(buscar.toLocaleLowerCase('es-AR'));
  const servicios = d.servicios.filter(s => (!estado || s.estado === estado) && (!tipo || s.tipo === tipo) && coincide([s.numero, s.carga, s.origen, s.destino, s.expediente, cliente(s.cliente_id), s.solicitante]));
  const ficha = (titulo: string, contenido: ReactNode, accion?: ReactNode) => <Card><CardHeader className="pb-3"><CardTitle className="flex flex-wrap items-start justify-between gap-3 text-base"><span>{titulo}</span>{accion}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{contenido}</CardContent></Card>;
  const vacio = <p className="col-span-full rounded-lg border border-dashed p-8 text-center text-muted-foreground">No hay registros para esta consulta.</p>;
  const editarBoton = (seccion: TransporteFormularioVista, row: { id: string }) => d.admin && (d.permisos?.editar ?? true) && <Button asChild variant="outline" size="sm"><Link to={`/transporte/${seccion}/${row.id}/editar`}>Editar</Link></Button>;
  const tarjetaServicio = (s: TransporteServicio) => <div key={s.id}>{ficha(`#${s.numero} · ${s.carga}`, <><Badge variant="secondary">{ESTADOS_TRANSPORTE[s.estado]}</Badge><p>{TIPOS_TRANSPORTE[s.tipo]}</p><p>{s.origen} → {s.destino}</p><p>{fecha(s.programado_at)} · {unidad(s.unidad_id)}</p>{d.admin && <p>{cliente(s.cliente_id)} · {transporteImporte(s.total)}</p>}</>, <Button size="sm" onClick={() => setDetalleId(s.id)}>Abrir servicio</Button>)}</div>;
  const hoy = new Date();
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const lecturasMes = d.lecturas.filter(l => l.created_at.startsWith(mes));
  const kmMes = d.unidades.reduce((sum, u) => { const lecturas = lecturasMes.filter(l => l.unidad_id === u.id).sort((a, b) => a.created_at.localeCompare(b.created_at)); const anterior = d.lecturas.filter(l => l.unidad_id === u.id && l.created_at.slice(0, 7) < mes).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]; return sum + (lecturas.length ? lecturas[lecturas.length - 1].kilometraje - (anterior?.kilometraje ?? lecturas[0].kilometraje) : 0); }, 0);
  const alertas = d.planes.filter(p => p.activo && alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id)) !== 'vigente');
  return <div className="space-y-6 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Truck /> Vortex Transporte</h1><p className="text-muted-foreground">{query.comercio?.nombre_comercio} · {transporteSecciones.find(s => s.vista === vista)?.title}</p></div><div className="flex gap-2"><Button variant="outline" disabled={query.isFetching} aria-label="Actualizar" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /></Button>{d.admin && (d.permisos?.crear ?? true) && transporteFormularios[vista as TransporteFormularioVista] && <Button asChild><Link to={`/transporte/${vista}/nuevo`}><Plus className="mr-2 h-4 w-4" />Nuevo</Link></Button>}</div></header>
    {!d.admin && !['resumen', 'servicios'].includes(vista) ? <p>Esta sección requiere acceso de administración.</p> : <>
      {vista !== 'resumen' && vista !== 'liquidacion' && <div className="flex flex-wrap gap-3"><Input aria-label="Buscar registros" className="sm:max-w-sm" placeholder="Buscar…" value={buscar} onChange={e => setBuscar(e.target.value)} />{vista === 'servicios' && <><select aria-label="Estado del servicio" className="h-11 rounded border bg-background px-3" value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option>{Object.entries(ESTADOS_TRANSPORTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="Tipo de servicio" className="h-11 rounded border bg-background px-3" value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los tipos</option>{Object.entries(TIPOS_TRANSPORTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></>}</div>}
      {vista === 'resumen' && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Servicios activos', d.servicios.filter(s => ['en_camino', 'en_lugar', 'trasladando'].includes(s.estado)).length],
          ['Pendientes de asignar', d.servicios.filter(s => s.estado === 'solicitado').length],
          ...(d.admin ? [['Kilómetros registrados del mes', kmMes.toLocaleString('es-AR')], ['Gastos del mes', transporteImporte(d.gastos.filter(g => g.gasto?.fecha.startsWith(mes)).reduce((sum, g) => sum + Number(g.gasto?.monto || 0), 0))]] : []),
        ].map(([label, valor]) => <div key={label}>{ficha(String(label), <p className="text-2xl font-semibold">{valor}</p>)}</div>)}</div>
        <h2 className="text-lg font-semibold">Servicios activos y próximos</h2><div className="grid gap-4 lg:grid-cols-2">{d.servicios.filter(s => !['finalizado', 'cancelado', 'no_realizado'].includes(s.estado)).sort((a, b) => (a.programado_at || a.created_at).localeCompare(b.programado_at || b.created_at)).map(tarjetaServicio)}{!d.servicios.some(s => !['finalizado', 'cancelado', 'no_realizado'].includes(s.estado)) && vacio}</div>
        {d.admin && <><h2 className="text-lg font-semibold">Alertas de mantenimiento ({alertas.length})</h2><div className="grid gap-4 lg:grid-cols-2">{alertas.map(p => <div key={p.id}>{ficha(p.nombre, <><Badge variant={alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id)) === 'vencido' ? 'destructive' : 'secondary'}>{alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id))}</Badge><p>{unidad(p.unidad_id)} · {fecha(p.proxima_fecha)}</p><p>Próximo: {p.proximo_km ?? '—'} km / {p.proximas_horas ?? '—'} h</p><p>Última lectura: {fecha(d.lecturas.find(l => l.unidad_id === p.unidad_id)?.created_at)}</p></>)}</div>)}{!alertas.length && <p>Sin alertas próximas o vencidas.</p>}</div><p className="text-xs text-muted-foreground">El kilometraje del mes usa las lecturas disponibles; sin lectura previa al mes se toma la primera del período.</p></>}
      </>}
      {vista === 'servicios' && <div className="grid gap-4 lg:grid-cols-2">{servicios.map(tarjetaServicio)}{!servicios.length && vacio}</div>}
      {vista === 'liquidacion' && <TransporteLiquidacion datos={d} run={query.run} pending={query.isPending} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vista === 'unidades' && (d.unidades.filter(coincide).map(u => <div key={u.id}>{ficha(`${u.patente} · ${u.nombre}`, <><Badge variant="secondary">{u.activo ? u.estado.replace(/_/g, ' ') : 'Inactiva'}</Badge><p>{u.tipo} · {u.marca} {u.modelo}</p><p>{u.kilometraje} km · {u.horas} horas</p><p>{u.observaciones}</p></>, editarBoton('unidades', u))}</div>))}
        {vista === 'choferes' && d.choferes.filter(coincide).map(c => <div key={c.id}>{ficha(c.nombre, <><p>{c.telefono}</p><p>{c.activo ? 'Activo' : 'Inactivo'} · {c.user_id ? 'Con acceso vinculado' : 'Sin usuario vinculado'}</p></>, editarBoton('choferes', c))}</div>)}
        {vista === 'tarifas' && d.tarifas.filter(coincide).map(t => <div key={t.id}>{ficha(t.nombre, <><p>{t.activo ? 'Activa' : 'Inactiva'} · {TIPOS_TRANSPORTE[t.tipo as keyof typeof TIPOS_TRANSPORTE]}</p><p>{t.cliente_id ? cliente(t.cliente_id) : 'Todos los clientes'}</p><p>Base {transporteImporte(t.base)} · {t.km_incluidos} km incluidos</p><p>Adicional {transporteImporte(t.precio_km)}/km · Espera {transporteImporte(t.precio_hora)}/h</p><p>{fecha(t.vigente_desde)} al {t.vigente_hasta ? fecha(t.vigente_hasta) : 'sin vencimiento'} · IVA {t.iva}% incluido</p></>, editarBoton('tarifas', t))}</div>)}
        {vista === 'lecturas' && d.lecturas.filter(l => coincide([l, unidad(l.unidad_id)])).map(l => <div key={l.id}>{ficha(unidad(l.unidad_id), <><p>{l.kilometraje} km · {l.horas} horas</p><p>{fecha(l.created_at)} · {l.motivo}</p><p>Responsable: {l.user_id}</p></>)}</div>)}
        {vista === 'gastos' && d.gastos.filter(g => coincide([g, unidad(g.unidad_id)])).map(g => <div key={g.id}>{ficha(g.gasto?.concepto || 'Gasto', <><p>{unidad(g.unidad_id)} · {fecha(g.gasto?.fecha)}</p><p>{transporteImporte(g.gasto?.monto || 0)} · {g.gasto?.estado}</p><p>{g.gasto?.categoria} · {g.litros ?? '—'} litros · {g.kilometraje ?? '—'} km</p><Button asChild variant="outline"><Link to="/gastos-egresos">Administrar pago en Gestión</Link></Button></>)}</div>)}
        {vista === 'planes' && d.planes.filter(p => coincide([p, unidad(p.unidad_id)])).map(p => <div key={p.id}>{ficha(p.nombre, <><Badge variant={p.activo && alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id)) === 'vencido' ? 'destructive' : 'secondary'}>{p.activo ? alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id)) : 'Inactivo'}</Badge><p>{unidad(p.unidad_id)}</p><p>Próximo: {p.proximo_km ?? '—'} km · {p.proximas_horas ?? '—'} h · {fecha(p.proxima_fecha)}</p><p>Última lectura: {fecha(d.lecturas.find(l => l.unidad_id === p.unidad_id)?.created_at)}</p></>, editarBoton('planes', p))}</div>)}
        {vista === 'mantenimientos' && d.mantenimientos.filter(m => coincide([m, unidad(m.unidad_id)])).map(m => <div key={m.id}>{ficha(m.tareas, <><Badge variant="secondary">{m.estado}</Badge><p>{unidad(m.unidad_id)} · Programado: {fecha(m.programado_para)}</p><p>Intervención: {fecha(m.fecha)} · {m.kilometraje} km / {m.horas} h</p><p>Presupuesto: {transporteImporte(m.presupuesto)}</p><p>Costo registrado: {m.gasto_id ? transporteImporte(d.gastos.find(g => g.gasto_id === m.gasto_id)?.gasto?.monto || 0) : 'Sin gasto vinculado'}</p></>, m.estado !== 'realizado' && editarBoton('mantenimientos', m))}</div>)}
      </div>
      {['unidades', 'choferes', 'tarifas', 'lecturas', 'gastos', 'planes', 'mantenimientos'].includes(vista) && !(d[vista as 'unidades'].filter(coincide).length) && vacio}
    </>}
    <Dialog open={Boolean(detalle)} onOpenChange={open => { if (!open) setDetalleId(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Servicio #{detalle?.numero}</DialogTitle><DialogDescription>Seguimiento, documentación y registro del traslado.</DialogDescription></DialogHeader>{detalle && <TransporteServicioDetalle key={detalle.id} servicio={detalle} datos={d} run={query.run} pending={query.isPending} />}</DialogContent></Dialog>
  </div>;
}
