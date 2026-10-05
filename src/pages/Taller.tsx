import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, CalendarDays, Car, ClipboardList, Wrench, Eye, Pencil, History, Power, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useTaller, tallerJson } from '@/hooks/useTaller';
import { useClientes } from '@/hooks/useClientes';
import { TallerEstado, TallerLayout, TallerSectionTitle, tallerSelectClass, type TallerData } from '@/components/taller/TallerUI';
import { ESTADOS_TALLER, type TallerTecnico, type TallerVehiculo, type TallerOrden } from '@/types/taller';
import { fechaTaller, hoyTaller, moneyTaller, numeroOrdenTaller, resumenTaller, totalTaller } from '@/utils/taller';

type Seccion = 'resumen' | 'vehiculos' | 'ordenes' | 'agenda' | 'tecnicos';
export default function Taller({ seccion }: { seccion: Seccion }) {
  const data = useTaller();
  return <TallerLayout data={data}><TallerContenido key={`${data.comercioId}-${seccion}`} data={data} seccion={seccion} /></TallerLayout>;
}

function TablaTaller({ columnas, count, empty, children }: { columnas: string[]; count: number; empty: string; children: ReactNode }) {
  return <Card><CardContent className="p-0"><Table>
    <TableHeader><TableRow>{columnas.map(columna => <TableHead key={columna} className={['Acciones', 'Total', 'Kilometraje', 'Trabajos abiertos'].includes(columna) ? 'whitespace-nowrap text-right' : 'whitespace-nowrap'}>{columna}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{count ? children : <TableRow><TableCell colSpan={columnas.length} className="h-24 text-center text-muted-foreground">{empty}</TableCell></TableRow>}</TableBody>
  </Table></CardContent></Card>;
}

function VerOrden({ orden }: { orden: TallerOrden }) {
  return <Button asChild variant="default" size="sm" title="Abrir orden" aria-label={`Abrir ${numeroOrdenTaller(orden.numero)}`}><Link to={`/taller/ordenes/${orden.id}`}><Eye className="h-4 w-4" /></Link></Button>;
}

function TallerContenido({ data, seccion }: { data: TallerData; seccion: Seccion }) {
  const [params, setParams] = useSearchParams();
  const { data: clientes = [] } = useClientes();
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('todos');
  const [inactivos, setInactivos] = useState(false);
  const titular = (id: string) => { const cliente = clientes.find(row => row.id === id); return cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : 'Cliente no disponible'; };
  const vehiculo = (id: string) => data.vehiculos.find(row => row.id === id);
  const match = (text: string) => text.toLocaleLowerCase().includes(buscar.toLocaleLowerCase());
  const ordenes = data.ordenes.filter(orden => (estado === 'todos' || orden.estado === estado) && (!params.get('vehiculo') || orden.vehiculo_id === params.get('vehiculo')) && match(`${orden.numero} ${numeroOrdenTaller(orden.numero)} ${orden.motivo} ${vehiculo(orden.vehiculo_id)?.patente} ${titular(orden.cliente_id)}`));
  const vehiculos = data.vehiculos.filter(row => (inactivos || row.activo) && match(`${row.patente} ${row.marca} ${row.modelo} ${titular(row.cliente_id)}`));
  const tecnicos = data.tecnicos.filter(row => (inactivos || row.activo) && match(`${row.nombre} ${row.especialidad}`));
  const resumen = resumenTaller(data.ordenes, data.items);
  const hoy = hoyTaller();
  const turnos = data.ordenes.filter(orden => orden.turno && !['entregado', 'cancelado'].includes(orden.estado)).sort((a, b) => a.turno!.localeCompare(b.turno!));
  const services = data.ordenes.filter(orden => orden.estado === 'entregado' && orden.proximo_service && !data.ordenes.some(posterior => posterior.vehiculo_id === orden.vehiculo_id && posterior.fecha_ingreso > orden.fecha_ingreso && posterior.estado !== 'cancelado')).sort((a, b) => a.proximo_service!.localeCompare(b.proximo_service!));
  const toggleActivo = async (tipo: 'vehiculo' | 'tecnico', row: TallerVehiculo | TallerTecnico) => {
    try { await data.run({ name: 'taller_guardar_catalogo', args: { p_comercio_id: data.comercioId!, p_tipo: tipo, p_id: row.id, p_datos: tallerJson({ ...row, activo: !row.activo }) } }); } catch { /* Error informado por la mutación. */ }
  };
  const accionesCatalogo = (tipo: 'vehiculo' | 'tecnico', row: TallerVehiculo | TallerTecnico) => <div className="flex justify-end gap-2">
    {tipo === 'vehiculo' && <Button asChild variant="default" size="sm" title="Historial de trabajos" aria-label="Historial de trabajos"><Link to={`/taller/ordenes?vehiculo=${row.id}`}><History className="h-4 w-4" /></Link></Button>}
    {data.isAdmin && <>
      <Button asChild variant="default" size="sm" title="Editar" aria-label="Editar"><Link to={`/taller/${tipo === 'vehiculo' ? 'vehiculos' : 'tecnicos'}/${row.id}/editar`}><Pencil className="h-4 w-4" /></Link></Button>
      <Button size="sm" variant={row.activo ? 'destructive' : 'success'} title={row.activo ? 'Desactivar' : 'Reactivar'} aria-label={row.activo ? 'Desactivar' : 'Reactivar'} disabled={data.isPending} onClick={() => toggleActivo(tipo, row)}>{row.activo ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</Button>
    </>}
  </div>;
  const tablaOrdenes = (lista: TallerOrden[], empty: string) => <TablaTaller columnas={['Orden', 'Ingreso', 'Patente', 'Cliente', 'Kilometraje', 'Motivo', 'Estado', 'Total', 'Acciones']} count={lista.length} empty={empty}>
    {lista.map(orden => <TableRow key={orden.id}>
      <TableCell className="whitespace-nowrap font-medium">{numeroOrdenTaller(orden.numero)}</TableCell>
      <TableCell className="whitespace-nowrap">{fechaTaller(orden.fecha_ingreso)}</TableCell>
      <TableCell className="whitespace-nowrap">{vehiculo(orden.vehiculo_id)?.patente || '—'}</TableCell>
      <TableCell>{titular(orden.cliente_id)}</TableCell>
      <TableCell className="whitespace-nowrap text-right">{orden.kilometraje.toLocaleString('es-AR')} km</TableCell>
      <TableCell className="max-w-64 truncate" title={orden.motivo}>{orden.motivo}</TableCell>
      <TableCell><TallerEstado estado={orden.estado} /></TableCell>
      <TableCell className="whitespace-nowrap text-right font-semibold">{moneyTaller(totalTaller(data.items.filter(item => item.orden_id === orden.id)))}</TableCell>
      <TableCell><div className="flex justify-end gap-2"><VerOrden orden={orden} />{data.isAdmin && !['entregado', 'cancelado'].includes(orden.estado) && <Button asChild variant="default" size="sm" title="Editar datos del trabajo" aria-label={`Editar ${numeroOrdenTaller(orden.numero)}`}><Link to={`/taller/ordenes/${orden.id}/editar`}><Pencil className="h-4 w-4" /></Link></Button>}</div></TableCell>
    </TableRow>)}
  </TablaTaller>;

  return <div className="space-y-5">
    {seccion === 'resumen' && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Órdenes abiertas', String(resumen.abiertas), ClipboardList], ['Listas para entregar', String(resumen.listas), Car],
        ['Pendientes de venta', String(resumen.pendientesFacturar), Wrench], ['Total de ventas vinculadas', moneyTaller(resumen.totalFacturado), CalendarDays],
      ].map(([label, value, Icon]) => <Card key={String(label)}><CardContent className="p-5"><p className="flex items-center gap-2 text-sm text-muted-foreground">{typeof Icon !== 'string' && <Icon className="h-4 w-4" />}{String(label)}</p><p className="mt-2 text-2xl font-semibold">{String(value)}</p></CardContent></Card>)}</div>
      <TallerSectionTitle title="Trabajos recientes">{data.isAdmin && <Button asChild variant="new"><Link to="/taller/ordenes/nueva"><Plus className="mr-2 h-4 w-4" />Nueva orden</Link></Button>}</TallerSectionTitle>
      {tablaOrdenes(data.ordenes.slice(0, 8), 'Registrá un vehículo y su primera orden de trabajo para comenzar.')}
    </>}
    {['vehiculos', 'ordenes', 'tecnicos'].includes(seccion) && <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar en taller" className="pl-9" value={buscar} onChange={event => setBuscar(event.target.value)} placeholder="Buscar por patente, cliente, número o nombre..." /></div>{seccion === 'ordenes' ? <select aria-label="Estado de la orden" className={`${tallerSelectClass} sm:w-52`} value={estado} onChange={event => setEstado(event.target.value)}><option value="todos">Todos los estados</option>{Object.entries(ESTADOS_TALLER).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select> : <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inactivos} onChange={event => setInactivos(event.target.checked)} />Mostrar inactivos</label>}</div>}
    {seccion === 'vehiculos' && <>
      <TallerSectionTitle title="Vehículos">{data.isAdmin && <Button asChild variant="new"><Link to="/taller/vehiculos/nuevo"><Plus className="mr-2 h-4 w-4" />Nuevo vehículo</Link></Button>}</TallerSectionTitle>
      <TablaTaller columnas={['Patente', 'Cliente', 'Marca', 'Modelo', 'Año', 'Kilometraje', 'Estado', 'Acciones']} count={vehiculos.length} empty="No hay vehículos para esta búsqueda.">
        {vehiculos.map(row => <TableRow key={row.id}><TableCell className="font-medium">{row.patente}</TableCell><TableCell>{titular(row.cliente_id)}</TableCell><TableCell>{row.marca}</TableCell><TableCell>{row.modelo}</TableCell><TableCell>{row.anio || '—'}</TableCell><TableCell className="whitespace-nowrap text-right">{row.kilometraje.toLocaleString('es-AR')} km</TableCell><TableCell><Badge variant={row.activo ? 'success' : 'secondary'}>{row.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell><TableCell>{accionesCatalogo('vehiculo', row)}</TableCell></TableRow>)}
      </TablaTaller>
    </>}
    {seccion === 'tecnicos' && <>
      <TallerSectionTitle title="Técnicos">{data.isAdmin && <Button asChild variant="new"><Link to="/taller/tecnicos/nuevo"><Plus className="mr-2 h-4 w-4" />Nuevo técnico</Link></Button>}</TallerSectionTitle>
      <TablaTaller columnas={['Nombre', 'Especialidad', 'Teléfono', 'Trabajos abiertos', 'Estado', 'Acciones']} count={tecnicos.length} empty="No hay técnicos para esta búsqueda.">
        {tecnicos.map(row => <TableRow key={row.id}><TableCell className="font-medium">{row.nombre}</TableCell><TableCell>{row.especialidad || '—'}</TableCell><TableCell>{row.telefono || '—'}</TableCell><TableCell className="text-right">{data.ordenes.filter(orden => orden.tecnico_id === row.id && !['entregado', 'cancelado'].includes(orden.estado)).length}</TableCell><TableCell><Badge variant={row.activo ? 'success' : 'secondary'}>{row.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell><TableCell>{accionesCatalogo('tecnico', row)}</TableCell></TableRow>)}
      </TablaTaller>
    </>}
    {seccion === 'ordenes' && <>
      <TallerSectionTitle title={params.get('vehiculo') ? `Historial · ${vehiculo(params.get('vehiculo')!)?.patente || 'Vehículo'}` : 'Órdenes de trabajo'}><div className="flex gap-2">{params.get('vehiculo') && <Button variant="outline" onClick={() => setParams({})}>Todas las órdenes</Button>}{data.isAdmin && <Button asChild variant="new"><Link to="/taller/ordenes/nueva"><Plus className="mr-2 h-4 w-4" />Nueva orden</Link></Button>}</div></TallerSectionTitle>
      {tablaOrdenes(ordenes, 'No hay órdenes para esta búsqueda.')}
    </>}
    {seccion === 'agenda' && <>
      <TallerSectionTitle title="Agenda de trabajos">{data.isAdmin && <Button asChild variant="new"><Link to="/taller/ordenes/nueva"><Plus className="mr-2 h-4 w-4" />Nuevo ingreso / turno</Link></Button>}</TallerSectionTitle>
      <TablaTaller columnas={['Turno', 'Orden', 'Patente', 'Cliente', 'Técnico', 'Estado', 'Acciones']} count={turnos.length} empty="No hay turnos asignados a trabajos abiertos.">
        {turnos.map(orden => <TableRow key={orden.id}><TableCell className="whitespace-nowrap">{fechaTaller(orden.turno)}</TableCell><TableCell className="whitespace-nowrap font-medium">{numeroOrdenTaller(orden.numero)}</TableCell><TableCell>{vehiculo(orden.vehiculo_id)?.patente || '—'}</TableCell><TableCell>{titular(orden.cliente_id)}</TableCell><TableCell>{data.tecnicos.find(tecnico => tecnico.id === orden.tecnico_id)?.nombre || 'Sin asignar'}</TableCell><TableCell><TallerEstado estado={orden.estado} /></TableCell><TableCell className="text-right"><VerOrden orden={orden} /></TableCell></TableRow>)}
      </TablaTaller>
      <TallerSectionTitle title="Próximos servicios" />
      <TablaTaller columnas={['Fecha', 'Patente', 'Cliente', 'Kilometraje', 'Estado', 'Acciones']} count={services.length} empty="Las órdenes entregadas con fecha de próximo servicio aparecerán aquí.">
        {services.map(orden => <TableRow key={orden.id}><TableCell className="whitespace-nowrap">{fechaTaller(orden.proximo_service)}</TableCell><TableCell className="font-medium">{vehiculo(orden.vehiculo_id)?.patente || '—'}</TableCell><TableCell>{titular(orden.cliente_id)}</TableCell><TableCell className="whitespace-nowrap text-right">{orden.proximo_service_km != null ? `${orden.proximo_service_km.toLocaleString('es-AR')} km` : '—'}</TableCell><TableCell><Badge variant={orden.proximo_service! <= hoy ? 'destructive' : 'secondary'}>{orden.proximo_service! <= hoy ? 'Fecha alcanzada' : 'Programado'}</Badge></TableCell><TableCell className="text-right"><VerOrden orden={orden} /></TableCell></TableRow>)}
      </TablaTaller>
    </>}
  </div>;
}
