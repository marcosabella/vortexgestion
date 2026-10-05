import { Link } from 'react-router-dom';
import { Check, Receipt } from 'lucide-react';
import type { EstadoTaller, TallerEvento } from '@/types/taller';
import { ESTADOS_TALLER } from '@/types/taller';
import { TallerEstado } from './TallerUI';
import { fechaTaller } from '@/utils/taller';

export function TallerLineaTiempo({ eventos, loading, error }: { eventos: TallerEvento[]; loading: boolean; error: unknown }) {
  return <section aria-label="Historial de la orden" className="space-y-3">
    <h3 className="text-lg font-semibold">Historial de la orden</h3>
    {loading ? <p role="status">Cargando historial...</p> : error ? <p role="alert">No se pudo cargar el historial.</p> : !eventos.length ? <p className="text-sm text-muted-foreground">No hay movimientos registrados.</p> : <div className="overflow-x-auto rounded-lg border p-3" tabIndex={0} aria-label="Línea de tiempo; desplazá horizontalmente para ver todos los movimientos">
      <ol className="flex pb-2">{eventos.map((evento, index) => {
        const ventaId = /^Venta vinculada: ([0-9a-f-]{36})$/i.exec(evento.detalle)?.[1];
        const color = evento.estado_nuevo === 'cancelado' ? 'bg-destructive' : ['listo', 'entregado'].includes(evento.estado_nuevo) ? 'bg-emerald-600' : 'bg-sky-600';
        return <li key={evento.id} className="relative min-w-28 flex-1 basis-0 pr-3 last:pr-0">
          {index < eventos.length - 1 && <div aria-hidden="true" className="absolute left-5 right-0 top-4 h-0.5 bg-border" />}
          <div aria-hidden="true" className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${color} text-white`}>{ventaId ? <Receipt className="h-4 w-4" /> : <Check className="h-4 w-4" />}</div>
          <time dateTime={evento.created_at} className="mt-2 block text-xs text-muted-foreground">{fechaTaller(evento.created_at)}</time>
          <div className="mt-2 [&>*]:max-w-full [&>*]:whitespace-normal">{evento.estado_nuevo in ESTADOS_TALLER ? <TallerEstado estado={evento.estado_nuevo as EstadoTaller} /> : <span className="text-sm font-medium">{evento.estado_nuevo}</span>}</div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{ventaId ? 'Venta generada' : evento.detalle}</p>
          {ventaId && <Link to={`/ventas?detalle=${ventaId}`} className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Ver comprobante</Link>}
        </li>;
      })}</ol>
    </div>}
  </section>;
}
