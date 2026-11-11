import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ESTADOS_TRANSPORTE, type EstadoTransporte, type TransporteEvento } from '@/types/transporte';

export function TransporteLineaTiempo({ eventos }: { eventos: TransporteEvento[] }) {
  const movimientos = [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return <section aria-label="Historial del servicio" className="space-y-3">
    <h3 className="text-lg font-semibold">Historial del servicio</h3>
    {!movimientos.length ? <p className="text-sm text-muted-foreground">No hay movimientos registrados.</p> : <div className="rounded-lg border p-3">
      <ol>{movimientos.map((evento, index) => {
        const cancelado = ['cancelado', 'no_realizado'].includes(evento.estado);
        const finalizado = evento.estado === 'finalizado';
        const color = cancelado ? 'bg-destructive' : finalizado ? 'bg-emerald-600' : 'bg-sky-600';
        const variante = cancelado ? 'destructive' : finalizado ? 'success' : ['en_camino', 'en_lugar', 'trasladando'].includes(evento.estado) ? 'default' : 'secondary';
        return <li key={evento.id} className="relative min-w-0 pb-6 pl-12 last:pb-0">
          {index < movimientos.length - 1 && <div aria-hidden="true" className="absolute -bottom-4 left-4 top-4 w-0.5 bg-border" />}
          <div aria-hidden="true" className={`absolute left-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full ${color} text-white`}><Check className="h-4 w-4" /></div>
          <time dateTime={evento.created_at} className="block text-xs text-muted-foreground">{new Date(evento.created_at).toLocaleString('es-AR')}</time>
          <div className="mt-2 [&>*]:max-w-full [&>*]:whitespace-normal"><Badge variant={variante}>{ESTADOS_TRANSPORTE[evento.estado as EstadoTransporte] || evento.estado}</Badge></div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{evento.detalle}</p>
        </li>;
      })}</ol>
    </div>}
  </section>;
}
