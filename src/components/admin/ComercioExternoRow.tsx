import { Link } from 'react-router-dom';
import { ExternalLink, Eye, Pencil, Trash2 } from 'lucide-react';
import type { ComercioExterno, useComerciosExternos } from '@/hooks/useComerciosExternos';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LicenciaComercioButton } from './LicenciaComercioButton';

const fecha = (v: string | null) => v ? new Date(`${v}T12:00:00`).toLocaleDateString('es-AR') : 'Sin fecha informada';
export function ComercioExternoRow({ externo: e, emisorId, eliminar }: { externo: ComercioExterno; emisorId?: string; eliminar: ReturnType<typeof useComerciosExternos>['eliminar'] }) {
  const propio = e.comercio_id === emisorId;
  return <TableRow>
    <TableCell className="font-medium">{e.nombre_comercio}<p className="text-xs font-normal text-muted-foreground">{e.sistema}</p></TableCell>
    <TableCell className="text-muted-foreground">Sistema externo</TableCell>
    <TableCell>{fecha(e.fecha_ingreso_sistema)}</TableCell><TableCell>{fecha(e.membresia_vigente_hasta)}</TableCell>
    <TableCell className="whitespace-nowrap text-right tabular-nums">{Number(e.importe_mensual).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</TableCell>
    <TableCell><Badge variant="secondary" title={`Emisor: ${e.emisor_nombre}`}>Externo</Badge></TableCell>
    <TableCell className="text-right"><div className="flex flex-nowrap items-center justify-end gap-1 [&>*]:shrink-0">
      <Button asChild variant="outline" size="sm"><Link to={`/admin/comercios/externos/${e.id}`} aria-label={`Ver detalle de ${e.nombre_comercio}`} title="Ver detalle"><Eye className="h-4 w-4" /></Link></Button>
      <Button asChild variant="outline" size="sm"><a href={e.url_sistema} target="_blank" rel="noopener noreferrer" aria-label={`Abrir sistema de ${e.nombre_comercio}`} title="Abrir sistema externo"><ExternalLink className="h-4 w-4" /></a></Button>
      {propio && <>
        <Button asChild variant="outline" size="sm"><Link to={`/admin/comercios/externos/${e.id}/editar`} aria-label={`Editar ${e.nombre_comercio}`} title="Editar"><Pencil className="h-4 w-4" /></Link></Button>
        <LicenciaComercioButton externo comercio={{ id: e.id, nombre_comercio: e.nombre_comercio, cuit: e.cliente_cuit }} />
        <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm" title="Eliminar registro externo" aria-label={`Eliminar registro de ${e.nombre_comercio}`} disabled={eliminar.isPending}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar el registro de {e.nombre_comercio}?</AlertDialogTitle><AlertDialogDescription>Se conserva el cliente y todos sus movimientos. El registro externo solo se elimina si no tiene comprobantes de membresía.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={eliminar.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={eliminar.isPending} onClick={event => { event.preventDefault(); eliminar.mutate(e.id); }}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </>}
    </div></TableCell>
  </TableRow>;
}
