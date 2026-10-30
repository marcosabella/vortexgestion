import { useEffect, useRef, useState } from 'react';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { useEmisoresFiscales } from '@/hooks/useEmisoresFiscales';
import { emisorFiscalLabel } from '@/utils/emisorFiscal';
import { Button } from '@/components/ui/button';
import { PagosVentaManager } from '@/components/PagosVentaManager';
import { tallerJson } from '@/hooks/useTaller';
import type { TallerOrden } from '@/types/taller';
import { type PagoVenta, type TipoComprobante, getTotalPagosBase } from '@/types/venta';
import { moneyTaller } from '@/utils/taller';
import { TallerCampo, tallerSelectClass, type TallerData } from './TallerUI';

export function FacturarOrdenForm({ data, orden, total, onClose }: {
  data: Pick<TallerData, 'run' | 'isPending'>;
  orden: Pick<TallerOrden, 'id' | 'cliente_id'>;
  total: number;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<TipoComprobante>('recibo_x');
  const { data: parametros } = useComercioParametrizacion();
  const multi = parametros.funciones.multiples_cuit;
  const emisores = useEmisoresFiscales(multi);
  const [emisorId, setEmisorId] = useState('');
  const activos = (emisores.data || []).filter(e => e.activo);
  const emisorPredeterminado = activos.find(e => e.predeterminado)?.id || (activos.length === 1 ? activos[0].id : '');
  useEffect(() => {
    if (!emisores.data?.some(e => e.activo && e.id === emisorId)) {
      setEmisorId(emisorPredeterminado);
    }
  }, [emisores.data, emisorId, emisorPredeterminado]);
  const emisorValido = !multi || (!emisores.isLoading && !emisores.error && activos.some(e => e.id === emisorId));
  const [pagos, setPagos] = useState<PagoVenta[]>([]);
  const [guardando, setGuardando] = useState(false);
  const enCurso = useRef(false);
  const pending = data.isPending || guardando;
  const pagosCompletos = pagos.length > 0 && Math.abs(getTotalPagosBase(pagos) - total) <= 0.005;
  return <div className="space-y-4">
    <fieldset disabled={pending} className="space-y-4">
      {multi && <TallerCampo label="Emisor fiscal"><select className={tallerSelectClass} value={emisorId} onChange={event => setEmisorId(event.target.value)}><option value="">Seleccioná el emisor</option>{activos.map(e => <option key={e.id} value={e.id}>{emisorFiscalLabel(e)} · PV {e.punto_venta}</option>)}</select>{emisores.error && <p role="alert" className="text-sm text-destructive">{emisores.error.message}</p>}{!emisores.isLoading && !emisores.error && activos.length === 0 && <p role="alert">Configurá un emisor fiscal activo en ARCA antes de facturar.</p>}</TallerCampo>}
      <TallerCampo label="Comprobante"><select className={tallerSelectClass} value={tipo} onChange={event => setTipo(event.target.value as TipoComprobante)}><option value="recibo_x">Recibo X</option><option value="factura_a">Factura A</option><option value="factura_b">Factura B</option><option value="factura_c">Factura C</option></select></TallerCampo>
      <PagosVentaManager totalVenta={total} clienteId={orden.cliente_id} pagos={pagos} onChange={setPagos} />
    </fieldset>
    <p className="text-sm text-muted-foreground">Agregá el pago en contado, transferencia, cheque o tarjeta. Podés combinar medios y cargar en cuenta corriente solamente lo que quede pendiente. El CAE se solicita luego desde Ventas.</p>
    <Button className="w-full" disabled={pending || !pagosCompletos || !emisorValido} onClick={async () => {
      if (enCurso.current || data.isPending || !pagosCompletos || !emisorValido) return;
      enCurso.current = true;
      setGuardando(true);
      try {
        await data.run({ name: 'taller_facturar_orden', args: { p_orden_id: orden.id, p_tipo: tipo, p_pagos: tallerJson(pagos), ...(multi ? { p_emisor_fiscal_id: emisorId } : {}) } });
        onClose();
      } catch { /* La mutación informa el error; se conservan los pagos. */ }
      finally { enCurso.current = false; setGuardando(false); }
    }}>{pending ? 'Generando venta...' : `Generar venta por ${moneyTaller(total)}`}</Button>
  </div>;
}
