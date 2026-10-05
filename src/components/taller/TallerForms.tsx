import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { TallerOrden, TallerTecnico, TallerVehiculo, TallerItem } from '@/types/taller';
import { useClientes } from '@/hooks/useClientes';
import { useProveedores } from '@/hooks/useProveedores';
import { useProductos } from '@/hooks/useProductos';
import { tallerJson, useTallerVariantes, useTallerMarcasModelos } from '@/hooks/useTaller';
import { TallerCatalogoBuscador } from './TallerCatalogoBuscador';
import { TallerRepuestoBuscador } from './TallerRepuestoBuscador';
import { TallerVehiculoBuscador } from './TallerVehiculoBuscador';
import { itemTallerSchema, vehiculoSchema } from '@/utils/taller';
import { TallerCampo, tallerSelectClass, type TallerData } from './TallerUI';

export function TallerModal({ title, open, onClose, pending, children }: { title: string; open: boolean; onClose: () => void; pending: boolean; children: React.ReactNode }) {
  return <Dialog open={open} onOpenChange={value => { if (!value && !pending) onClose(); }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Completá los datos del comercio actual y guardá los cambios.</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
function Submit({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-3"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? 'Guardando...' : 'Guardar'}</Button></div>;
}
export function VehiculoForm({ data, vehiculo, onClose }: { data: TallerData; vehiculo?: TallerVehiculo; onClose: () => void }) {
  const catalogo = useTallerMarcasModelos(data.comercioId);
  const [marcaId, setMarcaId] = useState(vehiculo?.marca_id || '');
  const [modeloId, setModeloId] = useState(vehiculo?.modelo_id || '');
  const { data: clientes = [], isLoading, error } = useClientes();
  const form = useForm<z.input<typeof vehiculoSchema>>({ resolver: zodResolver(vehiculoSchema), defaultValues: { cliente_id: vehiculo?.cliente_id || '', patente: vehiculo?.patente || '', marca: vehiculo?.marca || '', modelo: vehiculo?.modelo || '', kilometraje: vehiculo?.kilometraje || 0 } });
  const [anio, setAnio] = useState(vehiculo?.anio?.toString() || '');
  const [vin, setVin] = useState(vehiculo?.vin || '');
  const [observaciones, setObservaciones] = useState(vehiculo?.observaciones || '');
  return <form className="space-y-4" onSubmit={form.handleSubmit(async values => {
    if (!marcaId || !modeloId) { toast.error('Seleccioná la marca y el modelo desde el catálogo.'); return; }
    try { await data.run({ name: 'taller_guardar_catalogo', args: { p_comercio_id: data.comercioId!, p_tipo: 'vehiculo', p_id: vehiculo?.id || null, p_datos: tallerJson({ ...values, marca_id: marcaId, modelo_id: modeloId, anio, vin, observaciones, activo: vehiculo?.activo ?? true }) } }); onClose(); } catch { /* La mutación muestra el error. */ }
  })}>
    <TallerCampo label="Cliente / titular"><select className={tallerSelectClass} {...form.register('cliente_id')} disabled={isLoading}><option value="">Seleccionar cliente</option>{clientes.map(cliente => <option key={cliente.id} value={cliente.id}>{cliente.nombre} {cliente.apellido} · {cliente.cuit}</option>)}</select></TallerCampo>
    {error && <p role="alert" className="text-sm text-destructive">No se pudieron cargar los clientes.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <TallerCampo label="Patente"><Input {...form.register('patente')} placeholder="AB123CD" /></TallerCampo>
      <TallerCampo label="Kilometraje actual"><Input type="number" min="0" step="1" {...form.register('kilometraje', { valueAsNumber: true })} /></TallerCampo>
      <TallerCampo label="Marca"><TallerCatalogoBuscador tipo="marca" opciones={catalogo.data?.marcas ?? []} value={form.watch('marca')} data={data} loading={catalogo.isLoading} error={catalogo.error} onRetry={() => catalogo.refetch()} onChange={opcion => { setMarcaId(opcion.id); form.setValue('marca', opcion.nombre, { shouldValidate: true }); if (marcaId !== opcion.id) { setModeloId(''); form.setValue('modelo', ''); } }} /></TallerCampo>
      <TallerCampo label="Modelo"><TallerCatalogoBuscador tipo="modelo" opciones={(catalogo.data?.modelos ?? []).filter(row => row.marca_id === marcaId)} marcaId={marcaId} marcaNombre={form.watch('marca')} value={form.watch('modelo')} data={data} loading={catalogo.isLoading} error={catalogo.error} onRetry={() => catalogo.refetch()} onChange={opcion => { setModeloId(opcion.id); form.setValue('modelo', opcion.nombre, { shouldValidate: true }); }} /></TallerCampo>
      <TallerCampo label="Año"><Input type="number" min="1900" max="2200" value={anio} onChange={event => setAnio(event.target.value)} /></TallerCampo>
      <TallerCampo label="Chasis / VIN"><Input value={vin} onChange={event => setVin(event.target.value)} /></TallerCampo>
    </div>
    <TallerCampo label="Observaciones"><Textarea value={observaciones} onChange={event => setObservaciones(event.target.value)} /></TallerCampo>
    {Object.values(form.formState.errors).map((error, index) => <p role="alert" key={index} className="text-sm text-destructive">{error.message}</p>)}
    <Submit pending={data.isPending} onClose={onClose} />
  </form>;
}
export function TecnicoForm({ data, tecnico, onClose }: { data: TallerData; tecnico?: TallerTecnico; onClose: () => void }) {
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget));
    try { await data.run({ name: 'taller_guardar_catalogo', args: { p_comercio_id: data.comercioId!, p_tipo: 'tecnico', p_id: tecnico?.id || null, p_datos: tallerJson({ ...fields, activo: tecnico?.activo ?? true }) } }); onClose(); } catch { /* Error informado por la mutación. */ }
  }}>
    <TallerCampo label="Nombre"><Input name="nombre" required defaultValue={tecnico?.nombre} /></TallerCampo>
    <TallerCampo label="Teléfono"><Input name="telefono" defaultValue={tecnico?.telefono} /></TallerCampo>
    <TallerCampo label="Especialidad"><Input name="especialidad" defaultValue={tecnico?.especialidad} /></TallerCampo>
    <Submit pending={data.isPending} onClose={onClose} />
  </form>;
}
const fechaLocal = (value?: string | null) => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
export function OrdenTallerForm({ data, orden, onClose, onCreated }: { data: TallerData; orden?: TallerOrden; onClose: () => void; onCreated?: (id: string) => void }) {
  const [vehiculoId, setVehiculoId] = useState(orden?.vehiculo_id || '');
  const [km, setKm] = useState(orden?.kilometraje || 0);
  const [versionInicial] = useState(orden?.version || null);
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (!orden && !data.vehiculos.some(vehiculo => vehiculo.id === vehiculoId && vehiculo.activo)) { toast.error('Seleccioná un vehículo para crear la orden.'); return; }
    try {
      const result = await data.run({ name: 'taller_guardar_orden', args: { p_comercio_id: data.comercioId!, p_id: orden?.id || null, p_version: versionInicial, p_datos: tallerJson({ ...fields, vehiculo_id: vehiculoId, kilometraje: km, turno: fields.turno ? new Date(String(fields.turno)).toISOString() : '' }) } });
      if (!orden && typeof result === 'string' && onCreated) onCreated(result);
      else onClose();
    } catch { /* Error informado por la mutación. */ }
  }}>
    {!orden && <div className="grid items-start gap-4 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium">Vehículo *</p><TallerVehiculoBuscador vehiculos={data.vehiculos} vehiculoId={vehiculoId} disabled={data.isPending} onSelect={vehiculo => { setVehiculoId(vehiculo.id); setKm(vehiculo.kilometraje || 0); }} /></div><TallerCampo label="Kilometraje al ingresar"><Input type="number" min="0" step="1" required value={km} onChange={event => setKm(Number(event.target.value))} /></TallerCampo></div>}
    <TallerCampo label="Motivo del ingreso"><Textarea name="motivo" required defaultValue={orden?.motivo} readOnly={Boolean(orden && !['recibido','diagnostico'].includes(orden.estado))} /></TallerCampo>
    <div className="grid gap-4 md:grid-cols-3">
      <TallerCampo label="Técnico responsable"><select name="tecnico_id" className={tallerSelectClass} defaultValue={orden?.tecnico_id || ''}><option value="">Sin asignar</option>{data.tecnicos.filter(tecnico => tecnico.activo || tecnico.id === orden?.tecnico_id).map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}{!tecnico.activo ? ' (inactivo)' : ''}</option>)}</select></TallerCampo>
      <TallerCampo label="Turno"><Input name="turno" type="datetime-local" defaultValue={fechaLocal(orden?.turno)} /></TallerCampo>
      <TallerCampo label="Entrega estimada"><Input name="entrega_estimada" type="date" defaultValue={orden?.entrega_estimada || ''} /></TallerCampo>
    </div>
    {orden && <div className="grid gap-4 sm:grid-cols-2"><TallerCampo label="Próximo servicio (fecha)"><Input name="proximo_service" type="date" min={orden.fecha_ingreso.slice(0,10)} defaultValue={orden.proximo_service || ''} /></TallerCampo><TallerCampo label="Próximo servicio (km)"><Input name="proximo_service_km" type="number" min={orden.kilometraje} defaultValue={orden.proximo_service_km ?? ''} /></TallerCampo></div>}
    <TallerCampo label="Recepción: estado, combustible y accesorios"><Textarea name="recepcion" defaultValue={orden?.recepcion} /></TallerCampo>
    {orden && <><TallerCampo label="Diagnóstico"><Textarea name="diagnostico" defaultValue={orden.diagnostico} /></TallerCampo><TallerCampo label="Trabajo realizado"><Textarea name="trabajo_realizado" defaultValue={orden.trabajo_realizado} /></TallerCampo></>}
    <TallerCampo label="Observaciones"><Textarea name="observaciones" defaultValue={orden?.observaciones} /></TallerCampo>
    <Submit pending={data.isPending} onClose={onClose} />
  </form>;
}
export function ItemTallerForm({ data, orden, item, onClose }: { data: TallerData; orden: TallerOrden; item?: TallerItem; onClose: () => void }) {
  const { productos, isLoading, error } = useProductos();
  const { data: proveedores = [] } = useProveedores();
  const [productoId, setProductoId] = useState(item?.producto_id || '');
  const [varianteId, setVarianteId] = useState(item?.producto_variante_id || '');
  const [proveedorId, setProveedorId] = useState(item?.proveedor_id || '');
  const [versionInicial] = useState(orden.version);
  const variantes = useTallerVariantes(productoId || null);
  const form = useForm<z.input<typeof itemTallerSchema>>({ resolver: zodResolver(itemTallerSchema), defaultValues: { tipo: item?.tipo || 'mano_obra', descripcion: item?.descripcion || '', cantidad: item?.cantidad || 1, precio_unitario: item?.precio_unitario || 0, porcentaje_iva: item?.porcentaje_iva || 0, costo_unitario: item?.costo_unitario || 0 } });
  const tipo = form.watch('tipo');
  return <form className="space-y-4" onSubmit={form.handleSubmit(async values => {
    if (tipo === 'repuesto' && (!productoId || (variantes.data?.length && !varianteId))) { toast.error('Seleccioná el repuesto y su variante si corresponde.'); return; }
    if (tipo === 'servicio_externo' && !proveedorId) { toast.error('Seleccioná el proveedor del servicio.'); return; }
    try { await data.run({ name: 'taller_guardar_item', args: { p_orden_id: orden.id, p_version: versionInicial, p_id: item?.id || null, p_eliminar: false, p_datos: tallerJson({ ...values, producto_id: tipo === 'repuesto' ? productoId : null, producto_variante_id: tipo === 'repuesto' ? varianteId || null : null, proveedor_id: proveedorId || null }) } }); onClose(); } catch { /* Error informado por la mutación. */ }
  })}>
    <TallerCampo label="Tipo de concepto"><select className={tallerSelectClass} {...form.register('tipo')}><option value="mano_obra">Mano de obra</option><option value="repuesto">Repuesto del catálogo</option><option value="servicio_externo">Servicio externo</option></select></TallerCampo>
    {tipo === 'repuesto' && <><TallerCampo label="Repuesto (productos en pesos)"><TallerRepuestoBuscador productos={productos} productoId={productoId} loading={isLoading} error={error} disabled={data.isPending} onSelect={producto => { setProductoId(producto.id); setVarianteId(''); form.setValue('descripcion', producto.descripcion); form.setValue('precio_unitario', producto.precio_venta); form.setValue('porcentaje_iva', producto.porcentaje_iva); form.setValue('costo_unitario', producto.precio_costo); setProveedorId(producto.proveedor_id || ''); }} /></TallerCampo>
      {error && <p role="alert">No se pudieron cargar los productos.</p>}
      {Boolean(variantes.data?.length) && <TallerCampo label="Variante"><select className={tallerSelectClass} value={varianteId} onChange={event => setVarianteId(event.target.value)}><option value="">Seleccionar variante</option>{variantes.data?.map(variante => <option key={variante.id} value={variante.id}>{variante.color?.nombre} {variante.talle?.nombre} · stock {variante.stock}</option>)}</select></TallerCampo>}
    </>}
    <TallerCampo label="Descripción"><Input {...form.register('descripcion')} /></TallerCampo>
    <div className="grid gap-4 sm:grid-cols-2">
      <TallerCampo label="Cantidad / horas"><Input type="number" min="0.0001" step={tipo === 'repuesto' ? '1' : '0.0001'} {...form.register('cantidad', { valueAsNumber: true })} /></TallerCampo>
      <TallerCampo label="Precio unitario con IVA"><Input type="number" min="0" step="0.01" {...form.register('precio_unitario', { valueAsNumber: true })} /></TallerCampo>
      <TallerCampo label="IVA (%)"><Input type="number" min="0" max="100" step="0.01" {...form.register('porcentaje_iva', { valueAsNumber: true })} /></TallerCampo>
      <TallerCampo label="Costo unitario previsto"><Input type="number" min="0" step="0.01" {...form.register('costo_unitario', { valueAsNumber: true })} /></TallerCampo>
    </div>
    <TallerCampo label={tipo === 'servicio_externo' ? 'Proveedor del servicio *' : 'Proveedor (opcional)'}><select className={tallerSelectClass} value={proveedorId} onChange={event => setProveedorId(event.target.value)}><option value="">Sin proveedor</option>{proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.razon_social || `${proveedor.nombre} ${proveedor.apellido || ''}`}</option>)}</select></TallerCampo>
    <p className="text-xs text-muted-foreground">El presupuesto no descuenta ni reserva stock. Los costos previstos no crean deudas con proveedores.</p>
    {Object.values(form.formState.errors).map((error,index) => <p role="alert" key={index} className="text-sm text-destructive">{error.message}</p>)}
    <Submit pending={data.isPending || variantes.isFetching} onClose={onClose} />
  </form>;
}
