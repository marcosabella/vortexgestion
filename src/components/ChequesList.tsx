import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCheques } from '@/hooks/useCheques';
import { Cheque, ESTADOS_CHEQUE } from '@/types/cheque';
import { useComercio } from '@/hooks/useComercio';
import { ChequeForm } from './ChequeForm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, FilterX, Pencil, Printer, Search, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { buildReportePdfFile, type PrintableSection } from '@/utils/listadoVentasPdf';
import { toast } from 'sonner';

const PDF_COLUMNS = [
  { key: 'emision', label: 'Emision', x: 24, width: 66, align: 'center' },
  { key: 'vencimiento', label: 'Vencimiento', x: 90, width: 66, align: 'center' },
  { key: 'numero', label: 'Nro. cheque', x: 156, width: 68, align: 'left' },
  { key: 'banco', label: 'Banco', x: 224, width: 80, align: 'left' },
  { key: 'origen', label: 'Origen', x: 304, width: 58, align: 'left' },
  { key: 'emisor', label: 'Emisor', x: 362, width: 92, align: 'left' },
  { key: 'estado', label: 'Estado', x: 454, width: 62, align: 'left' },
  { key: 'monto', label: 'Monto', x: 516, width: 72, align: 'right' },
] as const;

const estadoLabel = (estado: string) => ESTADOS_CHEQUE.find((item) => item.value === estado)?.label || estado;

const formatDate = (value: string) => format(new Date(`${value.slice(0, 10)}T00:00:00`), 'dd/MM/yyyy', { locale: es });

const chequeOrigin = (cheque: Cheque) => cheque.tipo_cheque === 'propio' ? 'Propio' : 'De terceros';

const providerName = (cheque: Cheque) => cheque.proveedor?.razon_social
  || [cheque.proveedor?.nombre, cheque.proveedor?.apellido].filter(Boolean).join(' ');

export const ChequesList = () => {
  const { cheques, isLoading, createCheque, updateCheque, deleteCheque } = useCheques();
  const { comercio } = useComercio();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCheque, setSelectedCheque] = useState<Cheque | undefined>();
  const [chequeToDelete, setChequeToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [emisionDesde, setEmisionDesde] = useState('');
  const [emisionHasta, setEmisionHasta] = useState('');
  const [vencimientoDesde, setVencimientoDesde] = useState('');
  const [vencimientoHasta, setVencimientoHasta] = useState('');
  const [estado, setEstado] = useState('todos');
  const [origen, setOrigen] = useState('todos');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const filteredCheques = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es-AR');

    return (cheques || []).filter((cheque) => {
      const emision = cheque.fecha_emision.slice(0, 10);
      const vencimiento = cheque.fecha_vencimiento.slice(0, 10);
      const searchable = [
        cheque.numero_cheque,
        cheque.banco_emisor,
        cheque.emisor_nombre,
        cheque.emisor_cuit,
        cheque.cliente?.nombre,
        cheque.cliente?.apellido,
        providerName(cheque),
      ].filter(Boolean).join(' ').toLocaleLowerCase('es-AR');

      return (!normalizedSearch || searchable.includes(normalizedSearch))
        && (!emisionDesde || emision >= emisionDesde)
        && (!emisionHasta || emision <= emisionHasta)
        && (!vencimientoDesde || vencimiento >= vencimientoDesde)
        && (!vencimientoHasta || vencimiento <= vencimientoHasta)
        && (estado === 'todos' || cheque.estado === estado)
        && (origen === 'todos' || (cheque.tipo_cheque || 'tercero') === origen);
    });
  }, [cheques, search, emisionDesde, emisionHasta, vencimientoDesde, vencimientoHasta, estado, origen]);

  const totalFiltered = useMemo(
    () => filteredCheques.reduce((total, cheque) => total + Number(cheque.monto || 0), 0),
    [filteredCheques],
  );

  const filtersDescription = () => {
    const filters: string[] = [];
    if (emisionDesde || emisionHasta) filters.push(`Emision ${emisionDesde || 'inicio'} a ${emisionHasta || 'hoy'}`);
    if (vencimientoDesde || vencimientoHasta) filters.push(`Vencimiento ${vencimientoDesde || 'inicio'} a ${vencimientoHasta || 'sin limite'}`);
    if (estado !== 'todos') filters.push(`Estado: ${estadoLabel(estado)}`);
    if (origen !== 'todos') filters.push(`Origen: ${origen === 'propio' ? 'Propio' : 'De terceros'}`);
    if (search.trim()) filters.push(`Busqueda: ${search.trim()}`);
    return filters.length ? filters.join(' | ') : 'Todos los cheques';
  };

  const buildPdf = async () => {
    const rows = filteredCheques.map((cheque) => ({
      emision: formatDate(cheque.fecha_emision),
      vencimiento: formatDate(cheque.fecha_vencimiento),
      numero: cheque.numero_cheque,
      banco: cheque.banco_emisor,
      origen: chequeOrigin(cheque),
      emisor: cheque.emisor_nombre,
      estado: estadoLabel(cheque.estado),
      monto: formatCurrency(cheque.monto),
    }));
    const sections: PrintableSection[] = [{ title: `Detalle de cheques (${rows.length})`, rows, columns: PDF_COLUMNS }];
    return buildReportePdfFile(sections, {
      comercio,
      titulo: 'LISTADO DE CHEQUES',
      rango: filtersDescription(),
    });
  };

  const handlePdf = async (mode: 'download' | 'print') => {
    if (!filteredCheques.length || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const file = await buildPdf();
      const url = URL.createObjectURL(file);
      if (mode === 'download') {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      } else {
        const pdfWindow = window.open(url, '_blank');
        if (!pdfWindow) {
          URL.revokeObjectURL(url);
          toast.error('No se pudo abrir el PDF. Habilitá las ventanas emergentes e intentá nuevamente.');
          return;
        }
        pdfWindow.opener = null;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      console.error('No se pudo generar el listado de cheques:', error);
      toast.error('No se pudo generar el listado de cheques.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setEmisionDesde('');
    setEmisionHasta('');
    setVencimientoDesde('');
    setVencimientoHasta('');
    setEstado('todos');
    setOrigen('todos');
  };

  const handleSubmit = (data: Omit<Cheque, 'id' | 'created_at' | 'updated_at' | 'cliente' | 'proveedor'>) => {
    if (selectedCheque) {
      updateCheque({ ...data, id: selectedCheque.id });
    } else {
      createCheque(data);
    }
    setIsDialogOpen(false);
    setSelectedCheque(undefined);
  };

  const handleEdit = (cheque: Cheque) => {
    setSelectedCheque(cheque);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteCheque(id);
    setChequeToDelete(null);
  };

  const getEstadoBadgeVariant = (estado: string) => {
    switch (estado) {
      case 'en_cartera': return 'success';
      case 'depositado': return 'success';
      case 'rechazado': return 'destructive';
      case 'endosado': return 'secondary';
      default: return 'success';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
  };

  if (isLoading) {
    return <div className="text-center py-8">Cargando cheques...</div>;
  }

  return (
    <>
      <Card className="p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">Cartera de Cheques</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!filteredCheques.length || isGeneratingPdf} onClick={() => handlePdf('download')}>
              <Download className="mr-2 h-4 w-4" />Exportar PDF
            </Button>
            <Button variant="print" disabled={!filteredCheques.length || isGeneratingPdf} onClick={() => handlePdf('print')}>
              <Printer className="mr-2 h-4 w-4" />Imprimir listado
            </Button>
            <Button asChild variant="new">
              <Link to="/cheques/nuevo">
                <Plus className="mr-2 h-4 w-4" />
                Registrar Cheque
              </Link>
            </Button>
          </div>
        </div>

        <div className="mb-6 space-y-4 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-end gap-3 xl:flex-nowrap">
            <div className="min-w-[190px] flex-1 space-y-2">
              <Label htmlFor="cheques-search">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="cheques-search" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Numero, banco, emisor, cliente o proveedor" />
              </div>
            </div>
            <div className="w-[145px] shrink-0 space-y-2">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{ESTADOS_CHEQUE.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="w-[150px] shrink-0 space-y-2">
              <Label>Origen</Label>
              <Select value={origen} onValueChange={setOrigen}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los origenes</SelectItem><SelectItem value="propio">Propios</SelectItem><SelectItem value="tercero">De terceros</SelectItem></SelectContent></Select>
            </div>
            <div className="w-[140px] shrink-0 space-y-2"><Label htmlFor="emision-desde">Emision desde</Label><Input id="emision-desde" className="px-2" type="date" value={emisionDesde} onChange={(event) => setEmisionDesde(event.target.value)} /></div>
            <div className="w-[140px] shrink-0 space-y-2"><Label htmlFor="emision-hasta">Emision hasta</Label><Input id="emision-hasta" className="px-2" type="date" value={emisionHasta} onChange={(event) => setEmisionHasta(event.target.value)} /></div>
            <div className="w-[140px] shrink-0 space-y-2"><Label htmlFor="vencimiento-desde">Vence desde</Label><Input id="vencimiento-desde" className="px-2" type="date" value={vencimientoDesde} onChange={(event) => setVencimientoDesde(event.target.value)} /></div>
            <div className="w-[140px] shrink-0 space-y-2"><Label htmlFor="vencimiento-hasta">Vence hasta</Label><Input id="vencimiento-hasta" className="px-2" type="date" value={vencimientoHasta} onChange={(event) => setVencimientoHasta(event.target.value)} /></div>
          </div>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{filteredCheques.length} cheque{filteredCheques.length === 1 ? '' : 's'} · Total {formatCurrency(totalFiltered)}</p>
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" />Limpiar filtros</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Cheque</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Emisor</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>F. Emisión</TableHead>
                <TableHead>F. Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCheques.length > 0 ? (
                filteredCheques.map((cheque) => (
                  <TableRow key={cheque.id}>
                    <TableCell className="font-medium">{cheque.numero_cheque}</TableCell>
                    <TableCell>{cheque.banco_emisor}</TableCell>
                    <TableCell><Badge variant="outline">{cheque.tipo_cheque === 'propio' ? 'Propio' : 'De terceros'}</Badge>{cheque.proveedor && <div className="mt-1 text-xs text-muted-foreground">Entregado a {cheque.proveedor.razon_social || [cheque.proveedor.nombre, cheque.proveedor.apellido].filter(Boolean).join(' ')}</div>}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{cheque.emisor_nombre}</div>
                        {cheque.emisor_cuit && (
                          <div className="text-muted-foreground">{cheque.emisor_cuit}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cheque.cliente ? (
                        <div className="text-sm">
                          {cheque.cliente.nombre} {cheque.cliente.apellido}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(cheque.monto)}
                    </TableCell>
                    <TableCell>
                      {formatDate(cheque.fecha_emision)}
                    </TableCell>
                    <TableCell>
                      {formatDate(cheque.fecha_vencimiento)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getEstadoBadgeVariant(cheque.estado)}>
                        {ESTADOS_CHEQUE.find(e => e.value === cheque.estado)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(cheque)}
                          disabled={Boolean(cheque.movimiento_proveedor_id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => setChequeToDelete(cheque.id!)}
                          disabled={Boolean(cheque.movimiento_proveedor_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No hay cheques que coincidan con los filtros seleccionados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCheque ? 'Editar Cheque' : 'Registrar Nuevo Cheque'}
            </DialogTitle>
          </DialogHeader>
          <ChequeForm
            cheque={selectedCheque}
            onSubmit={handleSubmit}
            onCancel={() => {
              setIsDialogOpen(false);
              setSelectedCheque(undefined);
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!chequeToDelete} onOpenChange={() => setChequeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el cheque de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => chequeToDelete && handleDelete(chequeToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
