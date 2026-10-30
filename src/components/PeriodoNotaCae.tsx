import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function PeriodoNotaCae({ fechaNota, pending, onSolicitar }: {
  fechaNota: string;
  pending: boolean;
  onSolicitar: (periodo: { desde: string; hasta: string }) => void;
}) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(fechaNota));
  const max = ['year', 'month', 'day'].map(tipo => partes.find(p => p.type === tipo)?.value).join('-');
  return <fieldset disabled={pending} className="space-y-2 rounded-md border p-3">
    <legend className="px-1 text-sm font-medium">Período asociado a la nota</legend>
    <p className="text-sm text-muted-foreground">Indicá el período de los comprobantes que estás ajustando. Se enviará a ARCA junto con la solicitud de CAE. Para reintentar, usá el mismo período.</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div><Label htmlFor="nota-periodo-desde">Desde</Label><Input id="nota-periodo-desde" type="date" min="2006-01-02" max={hasta || max} value={desde} onChange={e => setDesde(e.target.value)} /></div>
      <div><Label htmlFor="nota-periodo-hasta">Hasta</Label><Input id="nota-periodo-hasta" type="date" min={desde || '2006-01-02'} max={max} value={hasta} onChange={e => setHasta(e.target.value)} /></div>
    </div>
    <Button variant="outline" size="sm" disabled={pending || !desde || !hasta || desde <= '2006-01-01' || desde > hasta || hasta > max} onClick={() => onSolicitar({ desde, hasta })}>{pending ? 'Obteniendo...' : 'Obtener CAE de la nota'}</Button>
  </fieldset>;
}
