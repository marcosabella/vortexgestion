import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ArcaConfig } from '@/components/ArcaConfig';
import { useEmisoresFiscales } from '@/hooks/useEmisoresFiscales';
import { configEmisorFiscal } from '@/utils/emisorFiscal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function EmisoresFiscalesConfig() {
  const { data: emisores = [], isLoading, error } = useEmisoresFiscales();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId === 'nuevo' ? undefined : emisores.find(e => e.id === selectedId) || emisores.find(e => e.predeterminado) || emisores[0];
  if (isLoading) return <p className="p-6">Cargando configuración...</p>;
  if (error) return <p role="alert" className="p-6 text-destructive">{error.message}</p>;
  return <>
    <div className="mx-auto flex max-w-4xl flex-wrap items-end gap-3 px-6 pt-6">
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="emisorArca">CUIT a configurar</Label>
        <Select value={selected?.id || 'nuevo'} onValueChange={setSelectedId}><SelectTrigger id="emisorArca"><SelectValue /></SelectTrigger><SelectContent>
          {emisores.map(e => <SelectItem key={e.id} value={e.id}>{e.cuit_emisor} / {e.razon_social} / PV {e.punto_venta} / {e.ambiente}{!e.activo ? ' / Inactivo' : ''}</SelectItem>)}
          <SelectItem value="nuevo">Nuevo emisor</SelectItem>
        </SelectContent></Select>
      </div>
      <Button variant="outline" onClick={() => setSelectedId('nuevo')}><Plus className="mr-2 h-4 w-4" />Agregar emisor</Button>
    </div>
    <ArcaConfig key={selected?.id || 'nuevo'} config={selected ? configEmisorFiscal(selected) : null} emisor={selected} multiple onSaved={setSelectedId} />
  </>;
}
