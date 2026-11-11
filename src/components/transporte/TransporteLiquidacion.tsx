import { useRef, useState } from 'react';
import { Eye, FileText, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { useEmisoresFiscales } from '@/hooks/useEmisoresFiscales';
import type { useTransporte } from '@/hooks/useTransporte';
import { ESTADOS_TRANSPORTE, type TransporteDatos } from '@/types/transporte';
import { PRESENTACIONES_TRANSPORTE, transporteError, transporteImporte, transporteMotivoNoFacturar } from '@/utils/transporte';
import { TransporteGrilla } from './TransporteGrilla';
import { PagosVentaManager } from '@/components/PagosVentaManager';
import { TIPOS_COMPROBANTE, type PagoVenta } from '@/types/venta';
import { COMPROBANTES_LIQUIDACION, prepararPagosLiquidacion, totalLiquidacion, type ComprobanteLiquidacion, type CondicionLiquidacion } from '@/utils/transporteLiquidacion';

const presentaciones = PRESENTACIONES_TRANSPORTE;
export function TransporteLiquidacion({ datos: d, run, pending, verDetalle }: { datos: TransporteDatos; run: ReturnType<typeof useTransporte>['run']; pending: boolean; verDetalle?: (id: string) => void }) {
  const [cliente, setCliente] = useState('');
  const [presentacion, setPresentacion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState(false);
  const [emisor, setEmisor] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState<ComprobanteLiquidacion>('recibo_x');
  const [condicion, setCondicion] = useState<CondicionLiquidacion>('cta_cte');
  const [pagos, setPagos] = useState<PagoVenta[]>([]);
  const intento = useRef<{ firma: string; id: string } | null>(null);
  const enviando = useRef(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState('');
  const { data: parametros } = useComercioParametrizacion();
  const multiCuit = parametros.funciones.multiples_cuit;
  const emisores = useEmisoresFiscales(multiCuit);
  const servicios = d.servicios.filter(s => (!cliente || s.cliente_id === cliente) && (!presentacion || (presentacion === 'facturado' ? Boolean(s.venta_id) : !s.venta_id && s.presentacion === presentacion)) && (!desde || (s.programado_at || s.created_at).slice(0, 10) >= desde) && (!hasta || (s.programado_at || s.created_at).slice(0, 10) <= hasta));
  const puedeFacturar = d.admin && (d.permisos?.facturar ?? true);
  const seleccionados = servicios.filter(s => seleccion.includes(s.id) && !transporteMotivoNoFacturar(s));
  const total = Math.round(seleccionados.reduce((sum, s) => sum + Number(s.total), 0) * 100) / 100;
  const totalFinal = totalLiquidacion(condicion, pagos, total);
  const abrirConfirmacion = () => { setError(''); setTipoComprobante('recibo_x'); setCondicion('cta_cte'); setPagos([]); setConfirmar(true); };
  const unCliente = new Set(seleccionados.map(s => s.cliente_id)).size === 1;
  const nombreCliente = (id: string) => { const c = d.clientes.find(c => c.id === id); return c ? `${c.nombre} ${c.apellido || ''}` : 'Cliente'; };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Podés facturar directamente un servicio finalizado, sin presupuesto previo ni documentación obligatoria. Para agrupar varios, seleccioná servicios del mismo cliente. Al confirmar podés elegir comprobante, condición de venta y forma de pago. La emisión fiscal se gestiona desde Ventas.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label htmlFor="tr-cliente">Cliente</Label><select id="tr-cliente" className="h-11 w-full rounded border bg-background px-3" value={cliente} onChange={e => { setCliente(e.target.value); setSeleccion([]); }}><option value="">Todos</option>{d.clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c.id)}</option>)}</select></div>
      <div><Label htmlFor="tr-presentacion">Presentación</Label><select id="tr-presentacion" className="h-11 w-full rounded border bg-background px-3" value={presentacion} onChange={e => { setPresentacion(e.target.value); setSeleccion([]); }}><option value="">Todas</option>{Object.entries(presentaciones).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="facturado">Registrado en Ventas</option></select></div>
      <div><Label htmlFor="tr-desde">Desde</Label><Input id="tr-desde" type="date" value={desde} onChange={e => { setDesde(e.target.value); setSeleccion([]); }} /></div><div><Label htmlFor="tr-hasta">Hasta</Label><Input id="tr-hasta" type="date" value={hasta} onChange={e => { setHasta(e.target.value); setSeleccion([]); }} /></div>
    </div>
    <TransporteGrilla titulo="Servicios para liquidar" columnas={['Seleccionar', 'Servicio', 'Carga', 'Cliente', 'Importe', 'Estado del servicio', 'Facturación', 'Documentación / revisión', 'Origen', 'Destino']} acciones vacio="No hay servicios para estos filtros." filas={servicios.map(s => ({
      id: s.id,
      celdas: [<input aria-label={`Seleccionar servicio #${s.numero}`} className="h-5 w-5" type="checkbox" title={!puedeFacturar ? "No tenés permiso para facturar" : transporteMotivoNoFacturar(s) || "Seleccionar para facturar"} disabled={pending || !puedeFacturar || Boolean(transporteMotivoNoFacturar(s))} checked={seleccion.includes(s.id)} onChange={e => setSeleccion(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))} />, `#${s.numero}`, s.carga, nombreCliente(s.cliente_id), transporteImporte(s.total), ESTADOS_TRANSPORTE[s.estado], transporteMotivoNoFacturar(s) || 'Listo para facturar', presentaciones[s.presentacion], s.origen, s.destino],
      acciones: <>{!s.venta_id && <span title={!puedeFacturar ? "No tenés permiso para facturar" : transporteMotivoNoFacturar(s) || "Facturar servicio"} tabIndex={transporteMotivoNoFacturar(s) || !puedeFacturar ? 0 : undefined}><Button variant="outline" size="sm" title="Facturar servicio" aria-label={`Facturar servicio #${s.numero}`} disabled={pending || !puedeFacturar || Boolean(transporteMotivoNoFacturar(s))} onClick={() => { setSeleccion([s.id]); abrirConfirmacion(); }}><Receipt className="h-4 w-4" /></Button></span>}{verDetalle && <Button variant="outline" size="sm" title="Ver detalle" aria-label={`Ver detalle del servicio #${s.numero}`} onClick={() => verDetalle(s.id)}><Eye className="h-4 w-4" /></Button>}{s.presupuesto_id ? <Button asChild variant="outline" size="sm"><Link to={`/presupuestos/${s.presupuesto_id}/editar`} title="Ver presupuesto" aria-label={`Ver presupuesto del servicio #${s.numero}`}><FileText className="h-4 w-4" /></Link></Button> : !s.venta_id && !['cancelado', 'no_realizado'].includes(s.estado) && s.total > 0 && <Button disabled={pending} variant="outline" size="sm" title="Crear presupuesto (opcional)" aria-label={`Crear presupuesto del servicio #${s.numero}`} onClick={async () => { setError(''); try { await run({ accion: 'presupuesto', datos: { servicios: [s.id] } }); setResultado(`Presupuesto del servicio #${s.numero} disponible en Gestión.`); } catch (e) { setError(transporteError(e)); } }}><FileText className="h-4 w-4" /></Button>}{s.venta_id && <Button asChild variant="outline" size="sm"><Link to="/ventas" title="Venta y cobro" aria-label={`Ver venta y cobro del servicio #${s.numero}`}><Receipt className="h-4 w-4" /></Link></Button>}</>,
    }))} />
    <div className="flex flex-wrap items-center gap-3"><strong>{seleccionados.length} servicios · {transporteImporte(total)}</strong><Button disabled={pending || !puedeFacturar || !unCliente || !seleccionados.length} onClick={abrirConfirmacion}>Facturar seleccionados</Button>{seleccionados.length > 0 && !unCliente && <p className="text-sm text-destructive">Seleccioná servicios de un solo cliente.</p>}</div>
    {resultado && <p role="status" className="text-sm">{resultado}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={confirmar} onOpenChange={open => { if (!pending) setConfirmar(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Registrar liquidación en Gestión</DialogTitle><DialogDescription>Elegí el comprobante y la condición de venta. Podés registrar el cobro ahora o dejar el saldo en cuenta corriente.</DialogDescription></DialogHeader><p>{nombreCliente(seleccionados[0]?.cliente_id)} · {seleccionados.length} servicios</p><ul className="space-y-1 text-sm">{seleccionados.map(s => <li key={s.id}>#{s.numero} · {s.carga} · {transporteImporte(s.total)}</li>)}</ul><strong>Servicios IVA incluido: {transporteImporte(total)}</strong>
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="tr-comprobante">Tipo de comprobante</Label><select id="tr-comprobante" className="h-11 w-full rounded border bg-background px-3" value={tipoComprobante} onChange={e => { setTipoComprobante(e.target.value as ComprobanteLiquidacion); setError(''); }}>{TIPOS_COMPROBANTE.filter(t => COMPROBANTES_LIQUIDACION.includes(t.value as ComprobanteLiquidacion)).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div><Label htmlFor="tr-condicion">Condición de venta</Label><select id="tr-condicion" className="h-11 w-full rounded border bg-background px-3" value={condicion} onChange={e => { setCondicion(e.target.value as CondicionLiquidacion); setPagos([]); setError(''); }}><option value="cta_cte">Cuenta corriente</option><option value="contado">Contado</option></select></div>
        </div>
        {condicion === 'contado' ? <PagosVentaManager totalVenta={total} clienteId={seleccionados[0]?.cliente_id} pagos={pagos} onChange={setPagos} permitirCuentaCorriente={false} /> : <p className="text-sm text-muted-foreground">Se registrará el total como saldo pendiente en la cuenta corriente del cliente. Podés cobrarlo luego desde Gestión.</p>}
      </fieldset>
      <strong>Total a registrar: {transporteImporte(totalFinal)}</strong>
      {tipoComprobante !== 'recibo_x' && <p className="text-sm text-muted-foreground">El comprobante se registrará con el tipo elegido. La autorización fiscal y el CAE se gestionan desde Ventas.</p>}
      {multiCuit && <div><Label htmlFor="tr-emisor">Emisor</Label><select id="tr-emisor" className="h-11 w-full rounded border bg-background px-3" value={emisor} onChange={e => setEmisor(e.target.value)}><option value="">Seleccionar emisor</option>{emisores.data?.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.razon_social} · {e.cuit_emisor}</option>)}</select>{emisores.error && <p role="alert">{transporteError(emisores.error)}</p>}</div>}
      <Button variant="success" disabled={pending || !puedeFacturar || !unCliente || !seleccionados.length || (multiCuit && (!emisor || emisores.isFetching || Boolean(emisores.error)))} onClick={async () => {
        if (enviando.current || pending) return;
        setError('');
        try {
          if (!puedeFacturar || !unCliente || !seleccionados.length) throw new Error('La selección no está habilitada para facturar.');
          if (!COMPROBANTES_LIQUIDACION.includes(tipoComprobante)) throw new Error('Elegí un tipo de comprobante válido.');
          if (multiCuit && !emisores.data?.some(e => e.id === emisor && e.activo)) throw new Error('Seleccioná un emisor fiscal activo.');
          const datosVenta = { servicios: seleccionados.map(s => s.id).sort(), tipo_comprobante: tipoComprobante, modalidad: condicion, pagos: prepararPagosLiquidacion(condicion, pagos, total), emisor_fiscal_id: multiCuit ? emisor : null };
          const firma = JSON.stringify(datosVenta);
          if (intento.current?.firma !== firma) intento.current = { firma, id: crypto.randomUUID() };
          enviando.current = true;
          await run({ accion: 'facturar', datos: { ...datosVenta, idempotency_key: intento.current.id } });
          setConfirmar(false); setSeleccion([]); setPagos([]); intento.current = null;
          setResultado(condicion === 'cta_cte' ? 'Venta registrada en cuenta corriente. El cobro está disponible en Gestión.' : 'Venta y pagos registrados en Gestión.');
        } catch (e) { setError(transporteError(e)); } finally { enviando.current = false; }
      }}>{pending ? 'Registrando…' : 'Confirmar venta'}</Button><Button variant="cancel" disabled={pending} onClick={() => setConfirmar(false)}>Volver</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent></Dialog>
  </div>;
}
