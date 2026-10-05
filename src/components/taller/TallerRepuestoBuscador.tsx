import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Producto } from '@/types/producto';
import { moneyTaller } from '@/utils/taller';

export function TallerRepuestoBuscador({ productos, productoId, onSelect, loading, error, disabled }: {
  productos: Producto[]; productoId: string; onSelect: (producto: Producto) => void;
  loading: boolean; error: unknown; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [buscar, setBuscar] = useState('');
  const seleccionado = productos.find(producto => producto.id === productoId);
  const termino = buscar.trim().toLocaleLowerCase();
  const resultados = productos.filter(producto => producto.tipo_moneda === 'ARS' && (
    producto.cod_producto.toLocaleLowerCase().includes(termino) || producto.descripcion.toLocaleLowerCase().includes(termino) || producto.cod_barras?.toLocaleLowerCase().includes(termino)
  ));
  return <>
    <Button type="button" variant="outline" className="w-full justify-between" disabled={disabled} onClick={() => { setBuscar(''); setOpen(true); }}><span className="truncate">{seleccionado ? `${seleccionado.cod_producto} · ${seleccionado.descripcion}` : 'Buscar repuesto'}</span><Search className="ml-2 h-4 w-4 shrink-0" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Seleccionar repuesto</DialogTitle><DialogDescription>Buscá productos en pesos por código, descripción o código de barras.</DialogDescription></DialogHeader>
      <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" aria-label="Buscar repuesto" placeholder="Buscar por código o descripción..." value={buscar} onChange={event => setBuscar(event.target.value)} /></div>
      {loading ? <p role="status">Cargando repuestos...</p> : error ? <p role="alert">No se pudieron cargar los productos.</p> : <div className="max-h-96 overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Precio final</TableHead><TableHead className="text-right">IVA %</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader><TableBody>
        {resultados.map(producto => <TableRow key={producto.id}><TableCell className="font-medium">{producto.cod_producto}</TableCell><TableCell>{producto.descripcion}</TableCell><TableCell className="whitespace-nowrap text-right">{moneyTaller(producto.precio_venta)}</TableCell><TableCell className="text-right">{producto.porcentaje_iva}%</TableCell><TableCell className="text-right">{producto.stock}</TableCell><TableCell className="text-right"><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => { onSelect(producto); setOpen(false); }}>Elegir</Button></TableCell></TableRow>)}
        {!resultados.length && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No se encontraron repuestos{termino ? ' que coincidan con la búsqueda' : ' en pesos'}.</TableCell></TableRow>}
      </TableBody></Table></div>}
    </DialogContent></Dialog>
  </>;
}
