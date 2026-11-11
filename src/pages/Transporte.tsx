import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Eye, Pencil, Plus, RefreshCw, Receipt, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useTransporte } from '@/hooks/useTransporte';
import { transporteSecciones, transporteFormularios, type TransporteFormularioVista } from '@/config/transporteNavigation';
import { ESTADOS_TRANSPORTE, TIPOS_TRANSPORTE, type TransporteDatos, type TransporteServicio } from '@/types/transporte';
import { alertaTransporte, transporteError, transporteImporte } from '@/utils/transporte';
import { TransporteFormulario } from '@/pages/TransporteFormulario';
import { TransporteServicioDetalle } from '@/components/transporte/TransporteServicioDetalle';
import { TransporteLiquidacion } from '@/components/transporte/TransporteLiquidacion';
import { TransporteGrilla } from '@/components/transporte/TransporteGrilla';
import { TransporteRegistroDetalle } from '@/components/transporte/TransporteRegistroDetalle';
import { motivoNoEliminarTransporte, transporteResponsable } from '@/utils/transporteAcciones';

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
  const [detalleRegistro, setDetalleRegistro] = useState<{ vista: TransporteFormularioVista; id: string } | null>(null);
  const [eliminar, setEliminar] = useState<{ vista: TransporteFormularioVista; id: string; nombre: string; version?: number } | null>(null);
  const [errorEliminar, setErrorEliminar] = useState('');
  const detalle = d.servicios.find(s => s.id === detalleId);
  const unidad = (id: string | null) => d.unidades.find(u => u.id === id)?.nombre || 'Sin asignar';
  const cliente = (id: string) => { const c = d.clientes.find(c => c.id === id); return c ? `${c.nombre} ${c.apellido || ''}` : ''; };
  const coincide = (valor: unknown) => JSON.stringify(valor).toLocaleLowerCase('es-AR').includes(buscar.toLocaleLowerCase('es-AR'));
  const servicios = d.servicios.filter(s => (!estado || s.estado === estado) && (!tipo || s.tipo === tipo) && coincide([s.numero, s.carga, s.origen, s.destino, s.expediente, cliente(s.cliente_id), s.solicitante]));
  const ficha = (titulo: string, contenido: ReactNode, accion?: ReactNode) => <Card><CardHeader className="pb-3"><CardTitle className="flex flex-wrap items-start justify-between gap-3 text-base"><span>{titulo}</span>{accion}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{contenido}</CardContent></Card>;
  const editarBoton = (seccion: TransporteFormularioVista, row: { id: string }) => d.admin && (d.permisos?.editar ?? true) && <Button asChild variant="outline" size="sm"><Link to={`/transporte/${seccion}/${row.id}/editar`} aria-label={`Editar ${transporteFormularios[seccion].titulo}`} title="Editar"><Pencil className="h-4 w-4" /></Link></Button>;
  const accionesRegistro = (seccion: TransporteFormularioVista, row: { id: string; version?: number }, nombre: string, editable = true) => {
    const motivo = motivoNoEliminarTransporte(seccion, row.id, d);
    return <>
      <Button variant="outline" size="sm" aria-label={`Ver detalle de ${nombre}`} title="Ver detalle" onClick={() => seccion === 'servicios' ? setDetalleId(row.id) : setDetalleRegistro({ vista: seccion, id: row.id })}><Eye className="h-4 w-4" /></Button>
      {editable && editarBoton(seccion, row)}
      {d.admin && (d.permisos?.editar ?? true) && <span tabIndex={motivo ? 0 : undefined} title={motivo || undefined} className="inline-flex"><Button variant="destructive" size="sm" disabled={Boolean(motivo) || query.isPending} title={motivo || 'Eliminar'} aria-label={`Eliminar ${nombre}`} aria-describedby={motivo ? `restriccion-${seccion}-${row.id}` : undefined} onClick={() => { setErrorEliminar(''); setEliminar({ vista: seccion, id: row.id, nombre, version: row.version }); }}><Trash2 className="h-4 w-4" /></Button>{motivo && <span id={`restriccion-${seccion}-${row.id}`} className="sr-only">{motivo}</span>}</span>}
    </>;
  };
  const grillaServicios = (registros: TransporteServicio[]) => <TransporteGrilla titulo="Servicios de transporte" columnas={['Servicio', 'Carga', 'Estado', 'Tipo', 'Origen', 'Destino', 'Programado', 'Unidad', ...(d.admin ? ['Cliente', 'Importe'] : [])]} acciones filas={registros.map(s => ({
    id: s.id,
    celdas: [`#${s.numero}`, s.carga, <Badge variant="secondary">{ESTADOS_TRANSPORTE[s.estado]}</Badge>, TIPOS_TRANSPORTE[s.tipo], s.origen, s.destino, fecha(s.programado_at), unidad(s.unidad_id), ...(d.admin ? [cliente(s.cliente_id), transporteImporte(s.total)] : [])],
    acciones: accionesRegistro('servicios', s, `servicio #${s.numero}`, !s.presupuesto_id && !s.venta_id && !['cancelado', 'no_realizado'].includes(s.estado)),
  }))} />;
  const grillaPlanes = (registros: TransporteDatos['planes'], titulo = 'Planes de mantenimiento') => <TransporteGrilla titulo={titulo} columnas={['Plan', 'Unidad', 'Estado', 'Próximo km', 'Próximas horas', 'Próxima fecha', 'Última lectura']} acciones filas={registros.map(p => ({
    id: p.id,
    celdas: [p.nombre, unidad(p.unidad_id), <Badge variant={p.activo && alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id)) === 'vencido' ? 'destructive' : 'secondary'}>{p.activo ? alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id)) : 'Inactivo'}</Badge>, p.proximo_km, p.proximas_horas, fecha(p.proxima_fecha), fecha(d.lecturas.find(l => l.unidad_id === p.unidad_id)?.created_at)],
    acciones: accionesRegistro('planes', p, p.nombre),
  }))} vacio={titulo === 'Alertas de mantenimiento' ? 'Sin alertas próximas o vencidas.' : 'No hay registros para esta consulta.'} />;
  const hoy = new Date();
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const lecturasMes = d.lecturas.filter(l => l.created_at.startsWith(mes));
  const kmMes = d.unidades.reduce((sum, u) => { const lecturas = lecturasMes.filter(l => l.unidad_id === u.id).sort((a, b) => a.created_at.localeCompare(b.created_at)); const anterior = d.lecturas.filter(l => l.unidad_id === u.id && l.created_at.slice(0, 7) < mes).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]; return sum + (lecturas.length ? lecturas[lecturas.length - 1].kilometraje - (anterior?.kilometraje ?? lecturas[0].kilometraje) : 0); }, 0);
  const alertas = d.planes.filter(p => p.activo && alertaTransporte(p, d.unidades.find(u => u.id === p.unidad_id)) !== 'vigente');
  return <div className="min-w-0 space-y-6 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Truck /> Vortex Transporte</h1><p className="text-muted-foreground">{query.comercio?.nombre_comercio} · {transporteSecciones.find(s => s.vista === vista)?.title}</p></div><div className="flex gap-2"><Button variant="outline" disabled={query.isFetching} aria-label="Actualizar" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /></Button>{d.admin && (d.permisos?.crear ?? true) && transporteFormularios[vista as TransporteFormularioVista] && <Button asChild variant="new"><Link to={`/transporte/${vista}/nuevo`}><Plus className="mr-2 h-4 w-4" />Nuevo</Link></Button>}</div></header>
    {!d.admin && !['resumen', 'servicios'].includes(vista) ? <p>Esta sección requiere acceso de administración.</p> : <>
      {vista !== 'resumen' && vista !== 'liquidacion' && <div className="flex flex-wrap gap-3"><Input aria-label="Buscar registros" className="sm:max-w-sm" placeholder="Buscar…" value={buscar} onChange={e => setBuscar(e.target.value)} />{vista === 'servicios' && <><select aria-label="Estado del servicio" className="h-11 rounded border bg-background px-3" value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option>{Object.entries(ESTADOS_TRANSPORTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="Tipo de servicio" className="h-11 rounded border bg-background px-3" value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los tipos</option>{Object.entries(TIPOS_TRANSPORTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></>}</div>}
      {vista === 'resumen' && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Servicios activos', d.servicios.filter(s => ['en_camino', 'en_lugar', 'trasladando'].includes(s.estado)).length],
          ['Pendientes de asignar', d.servicios.filter(s => s.estado === 'solicitado').length],
          ...(d.admin ? [['Kilómetros registrados del mes', kmMes.toLocaleString('es-AR')], ['Gastos del mes', transporteImporte(d.gastos.filter(g => g.gasto?.fecha.startsWith(mes)).reduce((sum, g) => sum + Number(g.gasto?.monto || 0), 0))]] : []),
        ].map(([label, valor]) => <div key={label}>{ficha(String(label), <p className="text-2xl font-semibold">{valor}</p>)}</div>)}</div>
        <h2 className="text-lg font-semibold">Servicios activos y próximos</h2>{grillaServicios(d.servicios.filter(s => !['finalizado', 'cancelado', 'no_realizado'].includes(s.estado)).sort((a, b) => (a.programado_at || a.created_at).localeCompare(b.programado_at || b.created_at)))}
        {d.admin && <><h2 className="text-lg font-semibold">Alertas de mantenimiento ({alertas.length})</h2>{grillaPlanes(alertas, 'Alertas de mantenimiento')}<p className="text-xs text-muted-foreground">El kilometraje del mes usa las lecturas disponibles; sin lectura previa al mes se toma la primera del período.</p></>}
      </>}
      {vista === 'servicios' && grillaServicios(servicios)}
      {vista === 'liquidacion' && <TransporteLiquidacion datos={d} run={query.run} pending={query.isPending} verDetalle={setDetalleId} />}
      {vista === 'unidades' && <TransporteGrilla titulo="Unidades y equipos" columnas={['Patente', 'Nombre', 'Estado', 'Tipo', 'Marca', 'Modelo', 'Kilometraje (km)', 'Horas', 'Observaciones']} acciones filas={d.unidades.filter(coincide).map(u => ({ id: u.id, celdas: [u.patente, u.nombre, <Badge variant="secondary">{u.activo ? u.estado.replace(/_/g, ' ') : 'Inactiva'}</Badge>, u.tipo, u.marca, u.modelo, u.kilometraje, u.horas, u.observaciones || '—'], acciones: accionesRegistro('unidades', u, u.patente) }))} />}
      {vista === 'choferes' && <TransporteGrilla titulo="Choferes" columnas={['Nombre', 'Teléfono', 'Estado', 'Acceso vinculado']} acciones filas={d.choferes.filter(coincide).map(c => ({ id: c.id, celdas: [c.nombre, c.telefono || '—', <Badge variant="secondary">{c.activo ? 'Activo' : 'Inactivo'}</Badge>, c.user_id ? 'Con acceso vinculado' : 'Sin usuario vinculado'], acciones: accionesRegistro('choferes', c, c.nombre) }))} />}
      {vista === 'tarifas' && <TransporteGrilla titulo="Tarifas" columnas={['Nombre', 'Estado', 'Tipo', 'Cliente', 'Base', 'Km incluidos', 'Adicional / km', 'Espera / h', 'Desde', 'Hasta', 'IVA incluido']} acciones filas={d.tarifas.filter(coincide).map(t => ({ id: t.id, celdas: [t.nombre, t.activo ? 'Activa' : 'Inactiva', TIPOS_TRANSPORTE[t.tipo as keyof typeof TIPOS_TRANSPORTE], t.cliente_id ? cliente(t.cliente_id) : 'Todos los clientes', transporteImporte(t.base), t.km_incluidos, transporteImporte(t.precio_km), transporteImporte(t.precio_hora), fecha(t.vigente_desde), t.vigente_hasta ? fecha(t.vigente_hasta) : 'Sin vencimiento', `${t.iva}%`], acciones: accionesRegistro('tarifas', t, t.nombre) }))} />}
      {vista === 'lecturas' && <TransporteGrilla titulo="Lecturas" acciones columnas={['Unidad', 'Kilometraje (km)', 'Horas', 'Fecha', 'Motivo', 'Responsable']} filas={d.lecturas.filter(l => coincide([l, unidad(l.unidad_id)])).map(l => ({ id: l.id, celdas: [unidad(l.unidad_id), l.kilometraje, l.horas, fecha(l.created_at), l.motivo, transporteResponsable(l.user_id, d)], acciones: accionesRegistro('lecturas', l, 'lectura', false) }))} />}
      {vista === 'gastos' && <TransporteGrilla titulo="Gastos" columnas={['Concepto', 'Unidad', 'Fecha', 'Importe', 'Estado', 'Categoría', 'Litros', 'Kilometraje (km)']} acciones filas={d.gastos.filter(g => coincide([g, unidad(g.unidad_id)])).map(g => ({ id: g.id, celdas: [g.gasto?.concepto || 'Gasto', unidad(g.unidad_id), fecha(g.gasto?.fecha), transporteImporte(g.gasto?.monto || 0), g.gasto?.estado, g.gasto?.categoria, g.litros, g.kilometraje], acciones: <>{accionesRegistro('gastos', g, g.gasto?.concepto || 'gasto', false)}<Button asChild variant="outline" size="sm"><Link to="/gastos-egresos" title="Administrar gasto en Gestión" aria-label="Administrar gasto en Gestión"><Receipt className="h-4 w-4" /></Link></Button></> }))} />}
      {vista === 'planes' && grillaPlanes(d.planes.filter(p => coincide([p, unidad(p.unidad_id)])))}
      {vista === 'mantenimientos' && <TransporteGrilla titulo="Mantenimientos" columnas={['Tareas', 'Estado', 'Unidad', 'Programado', 'Intervención', 'Kilometraje (km)', 'Horas', 'Presupuesto', 'Costo registrado']} acciones filas={d.mantenimientos.filter(m => coincide([m, unidad(m.unidad_id)])).map(m => ({ id: m.id, celdas: [m.tareas, <Badge variant="secondary">{m.estado}</Badge>, unidad(m.unidad_id), fecha(m.programado_para), fecha(m.fecha), m.kilometraje, m.horas, transporteImporte(m.presupuesto), m.gasto_id ? transporteImporte(d.gastos.find(g => g.gasto_id === m.gasto_id)?.gasto?.monto || 0) : 'Sin gasto vinculado'], acciones: accionesRegistro('mantenimientos', m, m.tareas, m.estado !== 'realizado') }))} />}
    </>}
    <Dialog open={Boolean(detalle)} onOpenChange={open => { if (!open) setDetalleId(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Servicio #{detalle?.numero}</DialogTitle><DialogDescription>Seguimiento, documentación y registro del traslado.</DialogDescription></DialogHeader>{detalle && <TransporteServicioDetalle key={detalle.id} servicio={detalle} datos={d} run={query.run} pending={query.isPending} />}</DialogContent></Dialog>
    <Dialog open={Boolean(detalleRegistro)} onOpenChange={open => { if (!open) setDetalleRegistro(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Detalle de {detalleRegistro && transporteFormularios[detalleRegistro.vista].titulo}</DialogTitle><DialogDescription>Información del registro en el comercio activo.</DialogDescription></DialogHeader>{detalleRegistro && <><TransporteRegistroDetalle {...detalleRegistro} datos={d} />{motivoNoEliminarTransporte(detalleRegistro.vista, detalleRegistro.id, d) && <p className="text-sm text-muted-foreground">{motivoNoEliminarTransporte(detalleRegistro.vista, detalleRegistro.id, d)}</p>}</>}<Button variant="outline" onClick={() => setDetalleRegistro(null)}>Cerrar</Button></DialogContent></Dialog>
    <AlertDialog open={Boolean(eliminar)} onOpenChange={open => { if (!open && !query.isPending) setEliminar(null); }}><AlertDialogContent onEscapeKeyDown={e => { if (query.isPending) e.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>¿Eliminar {eliminar?.nombre}?</AlertDialogTitle><AlertDialogDescription>Esta acción es definitiva. Se verificará que el registro no tenga actividad o vínculos que impidan eliminarlo.</AlertDialogDescription></AlertDialogHeader>{errorEliminar && <p role="alert" className="text-sm text-destructive">{errorEliminar}</p>}<AlertDialogFooter><AlertDialogCancel disabled={query.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={query.isPending} onClick={async e => {
      e.preventDefault(); if (!eliminar || query.isPending) return;
      setErrorEliminar('');
      const motivo = motivoNoEliminarTransporte(eliminar.vista, eliminar.id, d);
      if (motivo) { setErrorEliminar(motivo); return; }
      try { await query.run({ accion: 'eliminar', id: eliminar.id, version: eliminar.version, datos: { seccion: eliminar.vista } }); setEliminar(null); }
      catch (error) { setErrorEliminar(transporteError(error)); }
    }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{query.isPending ? 'Eliminando…' : 'Eliminar'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
