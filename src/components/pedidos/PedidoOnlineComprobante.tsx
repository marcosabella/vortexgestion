import { mostrarEnMayusculas } from "@/utils/textoPresentacion";
import { lazy, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useComprobantePedidoOnline } from '@/hooks/useComprobantePedidoOnline';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { useEmisoresFiscales } from '@/hooks/useEmisoresFiscales';
import type { PedidoOnline } from '@/hooks/usePedidosOnline';
import type { TipoComprobante } from '@/types/venta';

const DetalleVenta = lazy(() => import('@/components/VentasList').then(m => ({ default: m.VentasList })));
const tipos = [{ id: 'recibo_x', label: 'Recibo X' }, { id: 'factura_a', label: 'Factura A' }, { id: 'factura_b', label: 'Factura B' }, { id: 'factura_c', label: 'Factura C' }];

export function PedidoOnlineComprobante({ pedido, puedeGenerar, trabajando, habilitado }: { pedido: PedidoOnline; puedeGenerar: boolean; trabajando: boolean; habilitado: boolean }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoComprobante>('recibo_x');
  const [emisorId, setEmisorId] = useState('');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const { data: parametros } = useComercioParametrizacion();
  const multi = parametros.funciones.multiples_cuit;
  const emisores = useEmisoresFiscales(multi && open);
  const generar = useComprobantePedidoOnline();
  const disponible = ['confirmado', 'preparando', 'listo', 'entregado'].includes(pedido.estado)
    && pedido.estado_pago === 'aprobado' && !pedido.pedido_online_reembolsos && !pedido.pedido_online_cancelaciones;
  return <>
    {pedido.venta_id ? <Button variant="outline" className="w-full" onClick={() => setDetalleId(pedido.venta_id)}>Ver comprobante de venta</Button>
      : !habilitado ? <p className="text-xs text-muted-foreground">La generación de comprobantes está pendiente de habilitación.</p>
      : disponible ? <Button className="w-full" disabled={!puedeGenerar || trabajando || generar.isPending} onClick={() => setOpen(true)}>Generar comprobante de venta</Button>
      : pedido.estado !== 'cancelado' && <p className="text-xs text-muted-foreground">El comprobante se habilita desde Confirmado, con pago aprobado.</p>}
    {pedido.pedido_online_cancelaciones?.nota_credito_id && <Button variant="outline" className="w-full" onClick={() => setDetalleId(pedido.pedido_online_cancelaciones!.nota_credito_id)}>Ver nota de crédito</Button>}
    <Dialog open={open} onOpenChange={value => { if (!generar.isPending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Comprobante del pedido #{pedido.numero}</DialogTitle>
          <DialogDescription>{mostrarEnMayusculas(pedido.cliente_nombre)} · {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(pedido.total)}. Se usará el detalle y el pago registrado del pedido.</DialogDescription></DialogHeader>
        <div className="space-y-2"><label className="text-sm font-medium">Tipo de comprobante</label>
          <Select value={tipo} onValueChange={value => setTipo(value as TipoComprobante)} disabled={generar.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent></Select></div>
        {multi && <div className="space-y-2"><label className="text-sm font-medium">Emisor fiscal</label><Select value={emisorId} onValueChange={setEmisorId} disabled={generar.isPending || emisores.isLoading}><SelectTrigger><SelectValue placeholder="Seleccionar emisor" /></SelectTrigger><SelectContent>{emisores.data?.filter(e => e.activo).map(e => <SelectItem key={e.id} value={e.id}>{e.razon_social} · {e.cuit_emisor}</SelectItem>)}</SelectContent></Select></div>}
        {emisores.error && multi && <p role="alert" className="text-sm text-destructive">No se pudieron cargar los emisores fiscales.</p>}
        <p className="text-sm text-muted-foreground">No se volverá a cobrar ni a descontar stock. La venta aparecerá en Ventas. {tipo !== 'recibo_x' && 'La autorización de ARCA se solicita desde el detalle del comprobante.'}</p>
        <DialogFooter><Button variant="outline" disabled={generar.isPending} onClick={() => setOpen(false)}>Volver</Button>
          <Button disabled={!habilitado || generar.isPending || trabajando || !puedeGenerar || (multi && (!emisorId || Boolean(emisores.error)))} onClick={() => generar.mutate({ pedidoId: pedido.id, tipo, emisorId: multi ? emisorId : undefined }, {
            onSuccess: result => { setOpen(false); setDetalleId(result.venta_id); },
          })}>{generar.isPending ? 'Generando…' : 'Generar comprobante'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {detalleId && <Suspense fallback={<p>Cargando comprobante…</p>}><DetalleVenta detalleId={detalleId} onCerrarDetalle={() => setDetalleId(null)} /></Suspense>}
  </>;
}
