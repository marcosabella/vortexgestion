import { useState } from 'react';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ClienteForm } from '@/components/ClienteForm';
import { useClientes } from '@/hooks/useClientes';
import type { Cliente } from '@/types/cliente';

const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
const nombreCliente = (cliente: Cliente) => `${cliente.nombre} ${cliente.apellido || ''}`.trim();

export function TallerClienteBuscador({ clienteId, disabled, onSelect }: {
  clienteId: string;
  disabled: boolean;
  onSelect: (cliente: Cliente) => void;
}) {
  const { data: clientes = [], isLoading, error, refetch } = useClientes();
  const [open, setOpen] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState<Cliente | null>(null);
  const disponibles = nuevoCliente && !clientes.some(cliente => cliente.id === nuevoCliente.id)
    ? [nuevoCliente, ...clientes] : clientes;
  const seleccionado = disponibles.find(cliente => cliente.id === clienteId);
  const terminos = buscar.trim().split(/\s+/).map(normalizar).filter(Boolean);
  const resultados = disponibles.filter(cliente => {
    const texto = normalizar(`${nombreCliente(cliente)} ${cliente.cuit}`);
    return terminos.every(termino => texto.includes(termino));
  });
  const elegir = (cliente: Cliente) => {
    if (!cliente.id) return;
    onSelect(cliente);
    setOpen(false);
    setCreando(false);
    setGuardando(false);
  };

  return <>
    <Button type="button" variant="outline" aria-haspopup="dialog" disabled={disabled}
      className="h-auto min-h-10 w-full justify-between text-left"
      onClick={() => { setBuscar(''); setCreando(false); setOpen(true); }}>
      <span className="min-w-0 whitespace-normal break-words" aria-live="polite">
        {seleccionado ? `${nombreCliente(seleccionado)} · ${seleccionado.cuit}` : clienteId ? isLoading ? 'Cargando cliente...' : 'Cliente no disponible · Buscar cliente' : 'Buscar cliente'}
      </span><Search className="ml-2 h-4 w-4 shrink-0" />
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!guardando) setOpen(value); }}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${creando ? 'max-w-4xl' : 'max-w-3xl'}`}
        onSubmit={event => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{creando ? 'Nuevo cliente' : 'Seleccionar cliente / titular'}</DialogTitle>
          <DialogDescription>{creando ? 'Al guardar volverás al vehículo con este cliente seleccionado.' : 'Buscá por nombre, apellido, razón social, DNI o CUIT. Si no está cargado, podés crearlo aquí.'}</DialogDescription>
        </DialogHeader>
        {creando ? <>
          <Button type="button" variant="outline" className="w-fit" disabled={guardando} onClick={() => setCreando(false)}><ArrowLeft className="mr-2 h-4 w-4" />Volver a buscar</Button>
          <ClienteForm showTitle={false} onPendingChange={setGuardando} onSaved={cliente => { setNuevoCliente(cliente); elegir(cliente); }} />
        </> : <>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-48 flex-1" aria-label="Buscar cliente" placeholder="Nombre, apellido, razón social, DNI o CUIT..."
              value={buscar} onChange={event => setBuscar(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
            <Button type="button" variant="outline" disabled={disabled} onClick={() => setCreando(true)}><Plus className="mr-2 h-4 w-4" />Nuevo cliente</Button>
          </div>
          {isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando clientes...</p>}
          {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>No se pudieron cargar los clientes.</p><Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>Reintentar</Button></div>}
          {!isLoading && !error && <div className="max-h-96 space-y-2 overflow-y-auto">
            {resultados.map(cliente => <div key={cliente.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1 break-words"><p className="font-semibold">{nombreCliente(cliente)}</p><p className="text-sm text-muted-foreground">DNI / CUIT: {cliente.cuit}</p></div>
              <Button type="button" variant="outline" disabled={disabled} aria-label={`Elegir cliente ${nombreCliente(cliente)}`} onClick={() => elegir(cliente)}>Elegir</Button>
            </div>)}
            {!resultados.length && <p className="p-6 text-center text-sm text-muted-foreground">{buscar.trim() ? 'No se encontraron clientes. Podés crear uno con Nuevo cliente.' : 'No hay clientes cargados. Podés crear el primero con Nuevo cliente.'}</p>}
          </div>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
