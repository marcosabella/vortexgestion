import { useRef, useState } from 'react';
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
  const [pagos, setPagos] = useState<PagoVenta[]>([]);
  const [guardando, setGuardando] = useState(false);
  const enCurso = useRef(false);
  const pending = data.isPending || guardando;
  const pagosCompletos = pagos.length > 0 && Math.abs(getTotalPagosBase(pagos) - total) <= 0.005;
  return <div className="space-y-4">
    <fieldset disabled={pending} className="space-y-4">
      <TallerCampo label="Comprobante"><select className={tallerSelectClass} value={tipo} onChange={event => setTipo(event.target.value as TipoComprobante)}><option value="recibo_x">Recibo X</option><option value="factura_a">Factura A</option><option value="factura_b">Factura B</option><option value="factura_c">Factura C</option></select></TallerCampo>
      <PagosVentaManager totalVenta={total} clienteId={orden.cliente_id} pagos={pagos} onChange={setPagos} />
    </fieldset>
    <p className="text-sm text-muted-foreground">Agregá el pago en contado, transferencia, cheque o tarjeta. Podés combinar medios y cargar en cuenta corriente solamente lo que quede pendiente. El CAE se solicita luego desde Ventas.</p>
    <Button className="w-full" disabled={pending || !pagosCompletos} onClick={async () => {
      if (enCurso.current || data.isPending || !pagosCompletos) return;
      enCurso.current = true;
      setGuardando(true);
      try {
        await data.run({ name: 'taller_facturar_orden', args: { p_orden_id: orden.id, p_tipo: tipo, p_pagos: tallerJson(pagos) } });
        onClose();
      } catch { /* La mutación informa el error; se conservan los pagos. */ }
      finally { enCurso.current = false; setGuardando(false); }
    }}>{pending ? 'Generando venta...' : `Generar venta por ${moneyTaller(total)}`}</Button>
  </div>;
}
