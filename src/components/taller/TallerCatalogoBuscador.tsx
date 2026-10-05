import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { tallerError } from '@/hooks/useTaller';
import type { TallerData } from './TallerUI';

type Opcion = { id: string; nombre: string };
const clave = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase().replace(/[ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜ]/g, letra => letra.normalize('NFD')[0]);

export function TallerCatalogoBuscador({ tipo, opciones, value, onChange, data, marcaId, marcaNombre, loading, error, onRetry }: {
  tipo: 'marca' | 'modelo'; opciones: Opcion[]; value: string; onChange: (opcion: Opcion) => void;
  data: TallerData; marcaId?: string; marcaNombre?: string; loading: boolean; error: unknown; onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [buscar, setBuscar] = useState('');
  const resultados = opciones.filter(opcion => clave(opcion.nombre).includes(clave(buscar)));
  const exacto = opciones.find(opcion => clave(opcion.nombre) === clave(buscar));
  const seleccionar = (opcion: Opcion) => { onChange(opcion); setOpen(false); };
  const crear = async () => {
    if (!buscar.trim() || loading || error || data.isPending) return;
    if (exacto) { seleccionar(exacto); return; }
    try {
      const id = await data.run({ name: 'taller_guardar_marca_modelo', args: { p_comercio_id: data.comercioId!, p_tipo: tipo, p_nombre: buscar, p_marca_id: marcaId || null } });
      if (typeof id === 'string') seleccionar({ id, nombre: buscar.trim().replace(/\s+/g, ' ').toUpperCase() });
    } catch { /* La mutación informa el error y conserva la búsqueda. */ }
  };
  return <>
    <Button type="button" variant="outline" className="w-full justify-between" disabled={data.isPending || (tipo === 'modelo' && !marcaId)} onClick={() => { setBuscar(''); setOpen(true); }}><span className="truncate">{value || `Buscar ${tipo}`}</span><Search className="ml-2 h-4 w-4 shrink-0" /></Button>
    <Dialog open={open} onOpenChange={next => { if (!data.isPending) setOpen(next); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Buscar {tipo}</DialogTitle><DialogDescription>{tipo === 'modelo' ? `Modelos de ${marcaNombre}.` : 'Marcas disponibles en este comercio.'} Seleccioná una opción o agregá la que falta.</DialogDescription></DialogHeader>
      <Input aria-label={`Buscar ${tipo}`} placeholder={`Escribí el nombre de ${tipo}...`} value={buscar} onChange={event => setBuscar(event.target.value)} maxLength={100} disabled={data.isPending} />
      {loading ? <p role="status">Cargando catálogo...</p> : error ? <div role="alert" className="space-y-2"><p>{tallerError(error)}</p><Button type="button" variant="outline" onClick={onRetry}>Volver a consultar</Button></div> : <>
        <div className="max-h-64 space-y-1 overflow-y-auto">{resultados.map(opcion => <Button type="button" key={opcion.id} variant="ghost" className="w-full justify-start" disabled={data.isPending} onClick={() => seleccionar(opcion)}>{opcion.nombre}</Button>)}{!resultados.length && <p className="p-3 text-sm text-muted-foreground">No hay coincidencias.</p>}</div>
        {buscar.trim() && !exacto && data.isAdmin && <Button type="button" disabled={data.isPending} onClick={crear}><Plus className="mr-2 h-4 w-4" />{data.isPending ? 'Guardando...' : `Agregar ${tipo}: ${buscar.trim()}`}</Button>}
      </>}
    </DialogContent></Dialog>
  </>;
}
