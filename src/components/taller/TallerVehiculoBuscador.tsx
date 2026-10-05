import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useClientes } from '@/hooks/useClientes';
import type { TallerVehiculo } from '@/types/taller';

const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');

export function TallerVehiculoBuscador({ vehiculos, vehiculoId, disabled, onSelect }: {
  vehiculos: TallerVehiculo[]; vehiculoId: string; disabled: boolean;
  onSelect: (vehiculo: TallerVehiculo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [buscar, setBuscar] = useState('');
  const { data: clientes = [], isLoading, error, refetch } = useClientes();
  const clientesPorId = new Map(clientes.map(cliente => [cliente.id, cliente]));
  const seleccionado = vehiculos.find(vehiculo => vehiculo.id === vehiculoId);
  const cliente = seleccionado ? clientesPorId.get(seleccionado.cliente_id) : undefined;
  const termino = normalizar(buscar);
  const resultados = vehiculos.filter(vehiculo => {
    const titular = clientesPorId.get(vehiculo.cliente_id);
    return vehiculo.activo && normalizar([vehiculo.patente, vehiculo.marca, vehiculo.modelo, titular?.nombre, titular?.apellido, titular?.cuit].filter(Boolean).join(' ')).includes(termino);
  });
  const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : isLoading ? 'Cargando cliente...' : 'Cliente no disponible';

  return <div className="space-y-3">
    <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-between text-left" aria-haspopup="dialog" disabled={disabled} onClick={() => { setBuscar(''); setOpen(true); }}>
      <span className="min-w-0 whitespace-normal break-words" aria-live="polite">{seleccionado ? `${nombreCliente} - ${seleccionado.patente} · ${seleccionado.marca} ${seleccionado.modelo}` : 'Buscar vehículo'}</span><Search className="ml-2 h-4 w-4 shrink-0" />
    </Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Seleccionar vehículo</DialogTitle><DialogDescription>Buscá por patente, marca, modelo, nombre del titular o CUIT.</DialogDescription></DialogHeader>
      <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" aria-label="Buscar vehículo" placeholder="Patente, marca, modelo o titular..." value={buscar} onChange={event => setBuscar(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} /></div>
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando titulares...</p>}
      {error && <div role="alert" className="space-y-2 text-sm"><p>No se pudieron cargar los titulares. Podés buscar por los datos del vehículo.</p><Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button></div>}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {resultados.map(vehiculo => {
          const titular = clientesPorId.get(vehiculo.cliente_id);
          return <div key={vehiculo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0 flex-1 break-words"><p className="font-semibold">{vehiculo.patente} · {vehiculo.marca} {vehiculo.modelo}</p><p className="text-sm text-muted-foreground">{titular ? `${titular.nombre} ${titular.apellido || ''}`.trim() : 'Titular no disponible'}{titular?.cuit ? ` · ${titular.cuit}` : ''}</p><p className="text-sm text-muted-foreground">{vehiculo.kilometraje.toLocaleString('es-AR')} km{vehiculo.anio ? ` · Año ${vehiculo.anio}` : ''}</p></div>
            <Button type="button" variant="outline" disabled={disabled} aria-label={`Elegir vehículo ${vehiculo.patente}`} onClick={() => { onSelect(vehiculo); setOpen(false); }}>Elegir</Button>
          </div>;
        })}
        {!resultados.length && <p className="p-6 text-center text-sm text-muted-foreground">{termino ? 'No se encontraron vehículos que coincidan con la búsqueda.' : 'No hay vehículos activos disponibles.'}</p>}
      </div>
    </DialogContent></Dialog>
  </div>;
}
