import { useState } from 'react';
import { useApicolaComercialListado } from '@/hooks/useApicolaComercial';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
const filtro = { campana: '', apiario: '', desde: '', hasta: '' };
export function ApicolaTrazabilidadLote({ comercioId, loteId }: { comercioId: string; loteId: string }) {
  const [tipo, setTipo] = useState('salidas'), [pagina, setPagina] = useState(0);
  const consulta = useApicolaComercialListado(comercioId, tipo, filtro, pagina, loteId);
  return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Fraccionado y destinos del lote</h3><Label htmlFor="traza-tipo">Historial comercial</Label><select id="traza-tipo" className="h-11 w-full rounded-md border bg-background px-3" value={tipo} onChange={e => { setTipo(e.target.value); setPagina(0); }}><option value="salidas">Salidas y compradores</option><option value="fraccionamientos">Fraccionamientos</option><option value="devoluciones">Devoluciones físicas</option></select>
    {consulta.isPending ? <p role="status">Cargando destinos...</p> : consulta.isError ? <div role="alert"><p>No se pudo cargar el historial.</p><Button onClick={() => void consulta.refetch()}>Reintentar</Button></div> : <>
      {consulta.data?.items.map(r => <div key={r.id} className="space-y-1 rounded-md border p-3 text-sm"><p className="break-words font-medium">{String(r.codigo || r.comprobante || 'Devolución')} · {String(r.fecha)} · {String(r.estado)}</p>{tipo === 'fraccionamientos' ? <p>{String(r.presentacion)} · {Number(r.unidades).toLocaleString('es-AR')} unidades · Merma: {Number(r.merma_kg).toLocaleString('es-AR')} kg</p> : <><p>{Number(r.cantidad).toLocaleString('es-AR')} {String(r.unidad)}{r.cliente ? ` · ${r.cliente}` : ''}</p>{r.pendiente !== undefined && <p>Pendiente de retorno: {Number(r.pendiente).toLocaleString('es-AR')} {String(r.unidad)}</p>}</>}</div>)}
      {!consulta.data?.items.length && <p className="text-sm text-muted-foreground">Sin registros en este historial.</p>}<div className="flex justify-between gap-2"><Button variant="outline" disabled={!pagina} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span className="text-xs">Página {pagina + 1} · {consulta.data?.total || 0} registros</span><Button variant="outline" disabled={(pagina + 1) * 30 >= (consulta.data?.total || 0)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>
    </>}
  </section>;
}
