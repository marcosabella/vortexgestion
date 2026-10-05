import { useState } from 'react';
import { TallerLineaTiempo } from '@/components/taller/TallerLineaTiempo';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FacturaImpresion } from '@/components/FacturaImpresion';
import { PagosVentaManager } from '@/components/PagosVentaManager';
import { TallerLayout, TallerEstado, TallerEmpty, TallerReadOnlyField, TallerCampo, tallerSelectClass, type TallerData } from '@/components/taller/TallerUI';
import { TallerModal } from '@/components/taller/TallerForms';
import { useTaller, useTallerEventos, useTallerDocumento, tallerJson } from '@/hooks/useTaller';
import { useClientes } from '@/hooks/useClientes';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { ESTADOS_TALLER, TRANSICIONES_TALLER, type EstadoTaller, type TallerItem, type TallerOrden } from '@/types/taller';
import { type PagoVenta, type TipoComprobante, getTotalPagosBase, getVentaTotalFinal } from '@/types/venta';
import { fechaTaller, moneyTaller, numeroOrdenTaller, totalTaller } from '@/utils/taller';
import { OrdenTallerImpresion } from '@/components/taller/OrdenTallerImpresion';

export default function TallerOrdenDetalle() {
  const { ordenId } = useParams();
  const data = useTaller();
  const orden = data.ordenes.find(row => row.id === ordenId);
  return <TallerLayout data={data}>{orden ? <OrdenDetalle key={`${data.comercioId}-${orden.id}`} data={data} orden={orden} /> : <TallerEmpty>La orden no existe o no está disponible en este comercio.</TallerEmpty>}</TallerLayout>;
}
function OrdenDetalle({ data, orden }: { data: TallerData; orden: TallerOrden }) {
  const { data: clientes = [] } = useClientes();
  const { data: parametros } = useComercioParametrizacion();
  const eventos = useTallerEventos(orden.id, data.comercioId);
  const presupuesto = useTallerDocumento(data.comercioId, orden.presupuesto_id, 'presupuesto');
  const venta = useTallerDocumento(data.comercioId, orden.venta_id, 'venta');
  const [confirm, setConfirm] = useState<{ tipo: 'estado' | 'presupuesto' | 'eliminar'; estado?: EstadoTaller; item?: TallerItem } | null>(null);
  const [detalle, setDetalle] = useState('');
  const [facturar, setFacturar] = useState(false);
  const vehiculo = data.vehiculos.find(row => row.id === orden.vehiculo_id);
  const cliente = clientes.find(row => row.id === orden.cliente_id);
  const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : 'Cliente no disponible';
  const tecnico = data.tecnicos.find(row => row.id === orden.tecnico_id);
  const items = data.items.filter(row => row.orden_id === orden.id);
  const total = totalTaller(items);
  const detalleEditable = data.isAdmin && ['recibido','diagnostico'].includes(orden.estado) && !orden.presupuesto_id;
  const cerrado = ['cancelado','entregado'].includes(orden.estado);
  const siguiente = TRANSICIONES_TALLER[orden.estado];
  const abrirConfirmacion = (value: typeof confirm) => { setDetalle(''); setConfirm(value); };
  const confirmar = async () => {
    if (!confirm || data.isPending) return;
    try {
      if (confirm.tipo === 'presupuesto') await data.run({ name: 'taller_generar_presupuesto', args: { p_orden_id: orden.id, p_version: orden.version } });
      else if (confirm.tipo === 'eliminar') await data.run({ name: 'taller_guardar_item', args: { p_orden_id: orden.id, p_version: orden.version, p_id: confirm.item!.id, p_datos: {}, p_eliminar: true } });
      else await data.run({ name: 'taller_cambiar_estado', args: { p_orden_id: orden.id, p_version: orden.version, p_estado: confirm.estado!, p_detalle: detalle } });
      setConfirm(null);
    } catch { /* Error informado por la mutación. */ }
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Button asChild size="sm" variant="ghost"><Link to="/taller/ordenes"><ArrowLeft className="mr-2 h-4 w-4" />Órdenes</Link></Button><h2 className="mt-2 text-2xl font-semibold">{numeroOrdenTaller(orden.numero)} · {vehiculo?.patente}</h2></div><TallerEstado estado={orden.estado} /></div>
    <div className="flex flex-wrap gap-2">
      {data.isAdmin && !cerrado && <Button asChild variant="outline"><Link to={`/taller/ordenes/${orden.id}/editar`}><Pencil className="mr-2 h-4 w-4" />Datos del trabajo</Link></Button>}
      {vehiculo && (parametros.funciones.impresion_comprobantes || parametros.funciones.exportacion_pdf) && <OrdenTallerImpresion orden={orden} vehiculo={vehiculo} items={items} cliente={cliente} comercio={data.comercio} responsable={tecnico?.nombre || ''} showPrint={parametros.funciones.impresion_comprobantes} showPdf={parametros.funciones.exportacion_pdf} />}
      {detalleEditable && <Button disabled={data.isPending || !items.length} onClick={() => abrirConfirmacion({ tipo: 'presupuesto' })}>Generar presupuesto</Button>}
      {data.isAdmin && siguiente && <Button disabled={data.isPending || (siguiente === 'entregado' && !orden.venta_id)} onClick={() => abrirConfirmacion({ tipo: 'estado', estado: siguiente })}>Marcar {ESTADOS_TALLER[siguiente]}</Button>}
      {data.isAdmin && orden.estado === 'listo' && !orden.venta_id && <Button disabled={data.isPending} onClick={() => setFacturar(true)}>Generar venta / cobro</Button>}
      {data.isAdmin && !cerrado && !orden.venta_id && <Button variant="outline" disabled={data.isPending} onClick={() => abrirConfirmacion({ tipo: 'estado', estado: 'cancelado' })}>Cancelar orden</Button>}
    </div>
    <Tabs defaultValue="datos" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-3"><TabsTrigger className="whitespace-normal" value="datos">Datos de la orden</TabsTrigger><TabsTrigger value="historial">Historial</TabsTrigger><TabsTrigger className="whitespace-normal" value="comercial">Gestión comercial</TabsTrigger></TabsList>
      <TabsContent value="datos" className="space-y-5">
    <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><TallerReadOnlyField label="Cliente" value={nombreCliente} /><TallerReadOnlyField label="Vehículo" value={`${vehiculo?.marca || ''} ${vehiculo?.modelo || ''} · ${orden.kilometraje} km`} /><TallerReadOnlyField label="Responsable" value={tecnico?.nombre || 'Sin asignar'} /><TallerReadOnlyField label="Ingreso" value={fechaTaller(orden.fecha_ingreso)} /></CardContent></Card>
      <section aria-label="Trabajo"><Card><CardContent className="grid gap-5 p-5 md:grid-cols-2">{[['Motivo del ingreso',orden.motivo],['Recepción',orden.recepcion],['Diagnóstico',orden.diagnostico],['Trabajo realizado',orden.trabajo_realizado],['Observaciones',orden.observaciones],['Aprobación del cliente',orden.aprobacion_cliente || ''],['Turno',fechaTaller(orden.turno)],['Entrega estimada',fechaTaller(orden.entrega_estimada)],['Próximo servicio',`${fechaTaller(orden.proximo_service)} / ${orden.proximo_service_km ?? '—'} km`],['Entrega efectiva',fechaTaller(orden.entregado_at)]].map(([label,value]) => <TallerReadOnlyField key={label} label={label} value={value} />)}{orden.motivo_cancelacion && <TallerReadOnlyField label="Motivo de cancelación" value={orden.motivo_cancelacion} />}</CardContent></Card></section>
      <section aria-label="Repuestos y servicios" className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><p className="text-sm text-muted-foreground">Precios en pesos con IVA incluido.</p>{detalleEditable && <Button asChild size="sm"><Link to={`/taller/ordenes/${orden.id}/conceptos/nuevo`}><Plus className="mr-2 h-4 w-4" />Agregar concepto</Link></Button>}</div>
        <div className="rounded-lg border"><Table><TableHeader><TableRow><TableHead>Descripción</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Cantidad / horas</TableHead><TableHead className="text-right">Precio unitario</TableHead><TableHead className="text-right">IVA %</TableHead><TableHead className="text-right">Total</TableHead>{detalleEditable && <TableHead className="text-right">Acciones</TableHead>}</TableRow></TableHeader><TableBody>
          {items.map(item => <TableRow key={item.id}><TableCell className="font-medium">{item.descripcion}</TableCell><TableCell className="whitespace-nowrap">{item.tipo === 'mano_obra' ? 'Mano de obra' : item.tipo === 'servicio_externo' ? 'Servicio externo' : 'Repuesto'}</TableCell><TableCell className="text-right">{item.cantidad}</TableCell><TableCell className="whitespace-nowrap text-right">{moneyTaller(item.precio_unitario)}</TableCell><TableCell className="text-right">{item.porcentaje_iva}%</TableCell><TableCell className="whitespace-nowrap text-right font-semibold">{moneyTaller(Number(item.total))}</TableCell>{detalleEditable && <TableCell><div className="flex justify-end gap-2"><Button asChild size="sm" variant="default" title="Editar concepto" aria-label={`Editar ${item.descripcion}`}><Link to={`/taller/ordenes/${orden.id}/conceptos/${item.id}/editar`}><Pencil className="h-4 w-4" /></Link></Button><Button size="sm" variant="destructive" title="Eliminar concepto" aria-label={`Eliminar ${item.descripcion}`} disabled={data.isPending} onClick={() => abrirConfirmacion({ tipo: 'eliminar', item })}><Trash2 className="h-4 w-4" /></Button></div></TableCell>}</TableRow>)}
          {!items.length && <TableRow><TableCell colSpan={detalleEditable ? 7 : 6} className="h-24 text-center text-muted-foreground">Agregá repuestos, mano de obra o servicios externos.</TableCell></TableRow>}
        </TableBody></Table></div>
        <p className="text-right text-xl font-semibold">Total: {moneyTaller(total)}</p>
        {data.isAdmin && <p className="text-right text-sm text-muted-foreground">Costo previsto: {moneyTaller(items.reduce((sum,item) => sum + item.cantidad * item.costo_unitario,0))}. Los costos previstos no generan movimientos financieros.</p>}
        {!detalleEditable && <p className="text-sm text-muted-foreground">El detalle está protegido desde la emisión del presupuesto para conservar lo aprobado.</p>}
      </section>
      </TabsContent>
      <TabsContent value="historial">
      <TallerLineaTiempo eventos={eventos.data ?? []} loading={eventos.isLoading} error={eventos.error} />
      </TabsContent>
      <TabsContent value="comercial">
    {(orden.presupuesto_id || orden.venta_id) && <Card><CardHeader><CardTitle>Gestión comercial</CardTitle></CardHeader><CardContent className="space-y-4">
      <Table><TableHeader><TableRow><TableHead>Comprobante</TableHead><TableHead>Número</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>
        {presupuesto.data && <TableRow><TableCell>Presupuesto</TableCell><TableCell className="whitespace-nowrap font-medium">{presupuesto.data.numero_comprobante}</TableCell><TableCell className="whitespace-nowrap">{fechaTaller(presupuesto.data.fecha_venta)}</TableCell><TableCell className="whitespace-nowrap text-right font-semibold">{moneyTaller(getVentaTotalFinal(presupuesto.data))}</TableCell><TableCell><Badge variant={orden.venta_id ? 'success' : 'secondary'}>{orden.venta_id ? 'Confirmado' : 'Pendiente'}</Badge></TableCell><TableCell><div className="flex justify-end gap-2">{parametros.funciones.impresion_comprobantes && <FacturaImpresion venta={presupuesto.data} documentType="presupuesto" />}</div></TableCell></TableRow>}
        {venta.data && <TableRow><TableCell>Venta</TableCell><TableCell className="whitespace-nowrap font-medium">{venta.data.numero_comprobante}</TableCell><TableCell className="whitespace-nowrap">{fechaTaller(venta.data.fecha_venta)}</TableCell><TableCell className="whitespace-nowrap text-right font-semibold">{moneyTaller(getVentaTotalFinal(venta.data))}</TableCell><TableCell><Badge variant={venta.data.cae ? 'success' : 'secondary'}>{venta.data.cae ? `CAE: ${venta.data.cae}` : 'Sin CAE'}</Badge></TableCell><TableCell><div className="flex justify-end gap-2">{parametros.funciones.impresion_comprobantes && <FacturaImpresion venta={venta.data} />}<Button asChild variant="default" size="sm"><Link to={`/ventas?detalle=${orden.venta_id}`}>Ver venta</Link></Button></div></TableCell></TableRow>}
        {!presupuesto.data && !venta.data && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{presupuesto.isLoading || venta.isLoading ? 'Cargando comprobantes...' : 'No hay comprobantes disponibles.'}</TableCell></TableRow>}
      </TableBody></Table>
      {(presupuesto.error || venta.error) && <p role="alert">No se pudieron cargar los comprobantes vinculados.</p>}
    </CardContent></Card>}
    {!orden.presupuesto_id && !orden.venta_id && <TallerEmpty>No hay comprobantes vinculados a esta orden.</TallerEmpty>}
      </TabsContent>
    </Tabs>
    {confirm && <TallerModal title={confirm.tipo === 'presupuesto' ? 'Generar presupuesto' : confirm.tipo === 'eliminar' ? 'Eliminar concepto' : `Marcar ${ESTADOS_TALLER[confirm.estado!]}`} open pending={data.isPending} onClose={() => setConfirm(null)}><p className="text-sm">{confirm.tipo === 'presupuesto' ? 'Se generará un presupuesto en Vortex Gestión y el detalle quedará protegido. El stock no se modifica.' : confirm.tipo === 'eliminar' ? `Se quitará ${confirm.item?.descripcion} de la orden.` : confirm.estado === 'entregado' ? 'Se registrará la fecha de entrega y se cerrará el trabajo.' : 'Registrá el detalle de este cambio de estado.'}</p>{confirm.tipo === 'estado' && <TallerCampo label={confirm.estado === 'aprobado' ? 'Quién aprobó y por qué medio *' : confirm.estado === 'cancelado' ? 'Motivo de cancelación *' : 'Observaciones'}><Textarea value={detalle} onChange={event => setDetalle(event.target.value)} /></TallerCampo>}<Button disabled={data.isPending || (['aprobado','cancelado'].includes(confirm.estado || '') && !detalle.trim())} onClick={confirmar}>{data.isPending ? 'Guardando...' : 'Confirmar'}</Button></TallerModal>}
    {facturar && <TallerModal title="Generar venta y registrar cobro" open pending={data.isPending} onClose={() => setFacturar(false)}><FacturarOrden data={data} orden={orden} total={total} onClose={() => setFacturar(false)} /></TallerModal>}
  </div>;
}
function FacturarOrden({ data, orden, total, onClose }: { data: TallerData; orden: TallerOrden; total: number; onClose: () => void }) {
  const [tipo, setTipo] = useState<TipoComprobante>('recibo_x');
  const [pagos, setPagos] = useState<PagoVenta[]>([{ tipo_pago: 'cta_cte', monto: total }]);
  return <div className="space-y-4"><TallerCampo label="Comprobante"><select className={tallerSelectClass} value={tipo} onChange={event => setTipo(event.target.value as TipoComprobante)}><option value="recibo_x">Recibo X</option><option value="factura_a">Factura A</option><option value="factura_b">Factura B</option><option value="factura_c">Factura C</option></select></TallerCampo><PagosVentaManager totalVenta={total} clienteId={orden.cliente_id} pagos={pagos} onChange={setPagos} /><p className="text-sm text-muted-foreground">Podés dejar el total en cuenta corriente o reemplazarlo por pagos. El CAE se solicita luego desde Ventas.</p><Button className="w-full" disabled={data.isPending || Math.abs(getTotalPagosBase(pagos)-total)>0.005} onClick={async () => {
    if (Math.abs(getTotalPagosBase(pagos)-total)>0.005) { toast.error('Los pagos no coinciden con el total.'); return; }
    try { await data.run({ name: 'taller_facturar_orden', args: { p_orden_id: orden.id, p_tipo: tipo, p_pagos: tallerJson(pagos) } }); onClose(); } catch { /* Error informado por la mutación. */ }
  }}>{data.isPending ? 'Generando venta...' : `Generar venta por ${moneyTaller(total)}`}</Button></div>;
}
