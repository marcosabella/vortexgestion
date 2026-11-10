import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { useEmisoresFiscales } from '@/hooks/useEmisoresFiscales';
import type { useTransporte } from '@/hooks/useTransporte';
import type { TransporteDatos } from '@/types/transporte';
import { transporteError, transporteImporte } from '@/utils/transporte';

const presentaciones: Record<string, string> = { pendiente_documentacion: 'Pendiente de documentación', pendiente_autorizacion: 'Pendiente de autorización', listo: 'Listo para facturar', observado: 'Observado', rechazado: 'Rechazado' };
export function TransporteLiquidacion({ datos: d, run, pending }: { datos: TransporteDatos; run: ReturnType<typeof useTransporte>['run']; pending: boolean }) {
  const [cliente, setCliente] = useState('');
  const [presentacion, setPresentacion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState(false);
  const [emisor, setEmisor] = useState('');
  const [idempotencia, setIdempotencia] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState('');
  const { data: parametros } = useComercioParametrizacion();
  const multiCuit = parametros.funciones.multiples_cuit;
  const emisores = useEmisoresFiscales(multiCuit);
  const servicios = d.servicios.filter(s => (!cliente || s.cliente_id === cliente) && (!presentacion || (presentacion === 'facturado' ? Boolean(s.venta_id) : !s.venta_id && s.presentacion === presentacion)) && (!desde || (s.programado_at || s.created_at).slice(0, 10) >= desde) && (!hasta || (s.programado_at || s.created_at).slice(0, 10) <= hasta));
  const seleccionados = servicios.filter(s => seleccion.includes(s.id) && !s.venta_id && s.estado === 'finalizado' && s.presentacion === 'listo' && s.total > 0);
  const total = Math.round(seleccionados.reduce((sum, s) => sum + Number(s.total), 0) * 100) / 100;
  const unCliente = new Set(seleccionados.map(s => s.cliente_id)).size === 1;
  const nombreCliente = (id: string) => { const c = d.clientes.find(c => c.id === id); return c ? `${c.nombre} ${c.apellido || ''}` : 'Cliente'; };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Seleccioná servicios finalizados y listos del mismo cliente para registrar una venta en cuenta corriente. Los cobros y la emisión fiscal se gestionan desde Ventas. La operación genera un comprobante interno X.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label htmlFor="tr-cliente">Cliente</Label><select id="tr-cliente" className="h-11 w-full rounded border bg-background px-3" value={cliente} onChange={e => { setCliente(e.target.value); setSeleccion([]); }}><option value="">Todos</option>{d.clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c.id)}</option>)}</select></div>
      <div><Label htmlFor="tr-presentacion">Presentación</Label><select id="tr-presentacion" className="h-11 w-full rounded border bg-background px-3" value={presentacion} onChange={e => { setPresentacion(e.target.value); setSeleccion([]); }}><option value="">Todas</option>{Object.entries(presentaciones).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="facturado">Facturado</option></select></div>
      <div><Label htmlFor="tr-desde">Desde</Label><Input id="tr-desde" type="date" value={desde} onChange={e => { setDesde(e.target.value); setSeleccion([]); }} /></div><div><Label htmlFor="tr-hasta">Hasta</Label><Input id="tr-hasta" type="date" value={hasta} onChange={e => { setHasta(e.target.value); setSeleccion([]); }} /></div>
    </div>
    <div className="space-y-3">{servicios.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><label className="flex min-w-0 flex-1 items-start gap-3"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" disabled={pending || Boolean(s.venta_id) || s.estado !== 'finalizado' || s.presentacion !== 'listo' || s.total <= 0} checked={seleccion.includes(s.id)} onChange={e => setSeleccion(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))} /><span className="min-w-0 text-sm"><strong>#{s.numero} · {s.carga}</strong><span className="block">{nombreCliente(s.cliente_id)} · {transporteImporte(s.total)}</span><span className="block">{s.venta_id ? 'Facturado' : presentaciones[s.presentacion]} · {s.origen} → {s.destino}</span></span></label><div className="flex flex-wrap gap-2">{s.presupuesto_id ? <Button asChild variant="outline" size="sm"><Link to={`/presupuestos/${s.presupuesto_id}/editar`}>Presupuesto</Link></Button> : !s.venta_id && !['cancelado', 'no_realizado'].includes(s.estado) && s.total > 0 && <Button disabled={pending} variant="outline" size="sm" onClick={async () => { setError(''); try { await run({ accion: 'presupuesto', datos: { servicios: [s.id] } }); setResultado(`Presupuesto del servicio #${s.numero} disponible en Gestión.`); } catch (e) { setError(transporteError(e)); } }}>Crear presupuesto</Button>}{s.venta_id && <Button asChild variant="outline" size="sm"><Link to="/ventas">Venta y cobro</Link></Button>}</div></div>)}{!servicios.length && <p className="rounded border border-dashed p-6 text-center">No hay servicios para estos filtros.</p>}</div>
    <div className="flex flex-wrap items-center gap-3"><strong>{seleccionados.length} servicios · {transporteImporte(total)}</strong><Button disabled={pending || !unCliente || !seleccionados.length} onClick={() => { setError(''); setConfirmar(true); }}>Revisar liquidación</Button>{seleccionados.length > 0 && !unCliente && <p className="text-sm text-destructive">Seleccioná servicios de un solo cliente.</p>}</div>
    {resultado && <p role="status" className="text-sm">{resultado}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={confirmar} onOpenChange={open => { if (!pending) setConfirmar(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar liquidación en Gestión</DialogTitle><DialogDescription>Se creará una venta con comprobante X y un saldo pendiente en la cuenta corriente del cliente.</DialogDescription></DialogHeader><p>{nombreCliente(seleccionados[0]?.cliente_id)} · {seleccionados.length} servicios</p><ul className="space-y-1 text-sm">{seleccionados.map(s => <li key={s.id}>#{s.numero} · {s.carga} · {transporteImporte(s.total)}</li>)}</ul><strong>Total IVA incluido: {transporteImporte(total)}</strong>
      {multiCuit && <div><Label htmlFor="tr-emisor">Emisor</Label><select id="tr-emisor" className="h-11 w-full rounded border bg-background px-3" value={emisor} onChange={e => setEmisor(e.target.value)}><option value="">Seleccionar emisor</option>{emisores.data?.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.razon_social} · {e.cuit_emisor}</option>)}</select>{emisores.error && <p role="alert">{transporteError(emisores.error)}</p>}</div>}
      <Button disabled={pending || !unCliente || !seleccionados.length || (multiCuit && (!emisor || emisores.isFetching || Boolean(emisores.error)))} onClick={async () => { setError(''); try { await run({ accion: 'facturar', datos: { servicios: seleccionados.map(s => s.id), tipo_comprobante: 'recibo_x', modalidad: 'cta_cte', pagos: [], idempotency_key: idempotencia, emisor_fiscal_id: multiCuit ? emisor : null } }); setConfirmar(false); setSeleccion([]); setIdempotencia(crypto.randomUUID()); setResultado('Venta registrada. El cobro está disponible en Gestión.'); } catch (e) { setError(transporteError(e)); } }}>{pending ? 'Registrando…' : 'Confirmar venta en cuenta corriente'}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent></Dialog>
  </div>;
}
