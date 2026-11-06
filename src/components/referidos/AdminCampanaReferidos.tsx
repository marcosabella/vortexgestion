import { useState } from "react";
import { useAdminCampanaReferidos, useEditarCampanaReferidos, useEstadoAvisoReferidos } from "@/hooks/useReferidos";
import { TableCell, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Archive, ArchiveRestore, Pencil, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { condicionesCampanaPredeterminadas, mensajeCampanaPredeterminado } from "@/utils/comunicaciones";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const fecha = (value: string) => new Date(value).toLocaleString("es-AR");

export function AdminCampanaReferidos({ enabled, comercios, onReenviar }: {
  enabled: boolean;
  comercios: { id: string; nombre_comercio: string; activo: boolean }[];
  onReenviar: (campana: { id: string; titulo: string; mensaje?: string | null }) => void;
}) {
  const consulta = useAdminCampanaReferidos(enabled);
  const editar = useEditarCampanaReferidos();
  const estado = useEstadoAvisoReferidos();
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [borrador, setBorrador] = useState<{ p_id: string; p_titulo: string; p_mensaje: string; p_condiciones: string } | null>(null);
  const campana = consulta.data;
  const destinatarios = comercios.filter(comercio => comercio.activo);
  const estados = new Map(campana?.participaciones.map(item => [item.comercio_id, item]));
  const presentados = destinatarios.filter(item => estados.get(item.id)?.modal_visto_at).length;
  const leidas = destinatarios.filter(item => estados.get(item.id)?.notificacion_leida_at).length;

  if (consulta.isPending) return <TableRow><TableCell colSpan={8}><p role="status" className="text-muted-foreground">Cargando campaña de referidos...</p></TableCell></TableRow>;
  if (consulta.isError) return <TableRow><TableCell colSpan={8}><div role="alert" className="flex items-center gap-3"><p>No se pudo cargar la campaña de referidos.</p><Button variant="outline" onClick={() => void consulta.refetch()}>Reintentar</Button></div></TableCell></TableRow>;
  if (!campana) return null;

  return <>
    <TableRow data-campana-referidos={campana.id}>
      <TableCell>{campana.creada_en ? fecha(campana.creada_en) : "-"}</TableCell>
      <TableCell className="font-medium"><div className="flex items-center gap-2">{campana.titulo}<Badge variant="outline">Modal</Badge></div><p className="mt-1 text-xs font-normal text-muted-foreground">Campaña de referidos</p></TableCell>
      <TableCell>General</TableCell>
      <TableCell>Todos los comercios activos</TableCell>
      <TableCell>
        <Popover>
          <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-auto flex-col items-start gap-1 px-2 py-1"><Badge variant="secondary">{leidas}/{destinatarios.length} leídas</Badge><Badge variant="outline">{presentados}/{destinatarios.length} presentaciones</Badge></Button></PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <p className="mb-3 text-sm font-medium">Campaña inicial · estado por comercio</p>
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {destinatarios.map(comercio => {
                const estado = estados.get(comercio.id);
                return <div key={comercio.id} className="border-t pt-2 text-sm">
                  <p className="font-medium">{comercio.nombre_comercio}</p>
                  <p className="text-muted-foreground">{estado?.modal_visto_at ? `Presentación registrada: ${fecha(estado.modal_visto_at)}` : "Modal pendiente de presentación"}</p>
                  <p className="text-muted-foreground">{estado?.notificacion_leida_at ? `Marcada como leída: ${fecha(estado.notificacion_leida_at)}` : "Sin marcar como leída"}</p>
                </div>;
              })}
              {destinatarios.length === 0 && <p className="text-sm text-muted-foreground">No hay comercios activos.</p>}
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell><span className="text-muted-foreground">-</span></TableCell>
      <TableCell><Badge variant={campana.aviso_estado === "archivado" ? "secondary" : "default"}>{campana.aviso_estado === "archivado" ? "Archivada" : "Activa"}</Badge></TableCell>
      <TableCell className="text-right"><div className="flex justify-end gap-1">
        <Button disabled={estado.isPending} variant="outline" size="sm" title="Editar textos de la campaña" onClick={() => { editar.reset(); setBorrador({ p_id: campana.id, p_titulo: campana.titulo, p_mensaje: campana.mensaje || mensajeCampanaPredeterminado, p_condiciones: campana.condiciones || condicionesCampanaPredeterminadas }); }}><Pencil className="h-4 w-4" /><span className="sr-only">Editar textos</span></Button>
        <Button disabled={estado.isPending} variant="outline" size="sm" title="Preparar reenvío de campaña" onClick={() => onReenviar(campana)}><Send className="h-4 w-4" /><span className="sr-only">Preparar reenvío de campaña</span></Button>
        {campana.aviso_estado === "archivado" ? <Button disabled={estado.isPending} variant="outline" size="sm" title="Restaurar aviso de campaña" onClick={() => estado.mutate({ p_id: campana.id, p_accion: "restaurar" })}><ArchiveRestore className="h-4 w-4" /><span className="sr-only">Restaurar campaña</span></Button>
          : <Button disabled={estado.isPending} variant="outline" size="sm" title="Archivar aviso de campaña" onClick={() => estado.mutate({ p_id: campana.id, p_accion: "archivar" })}><Archive className="h-4 w-4" /><span className="sr-only">Archivar campaña</span></Button>}
        <AlertDialog open={confirmarEliminar} onOpenChange={open => { if (!estado.isPending) setConfirmarEliminar(open); }}>
          <AlertDialogTrigger asChild><Button disabled={estado.isPending} variant="destructive" size="sm" title="Eliminar aviso de campaña"><Trash2 className="h-4 w-4" /><span className="sr-only">Eliminar campaña</span></Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Eliminar aviso de campaña</AlertDialogTitle><AlertDialogDescription>Se quitará “{campana.titulo}” de esta grilla y dejará de mostrarse su aviso inicial y modal. No se podrá restaurar desde el panel. Se conservan los referidos, enlaces, lecturas y bonificaciones. Los reenvíos ya creados se gestionan por separado en sus propias filas.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel disabled={estado.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={estado.isPending} onClick={event => { event.preventDefault(); estado.mutate({ p_id: campana.id, p_accion: "eliminar" }, { onSuccess: () => setConfirmarEliminar(false) }); }}>{estado.isPending ? "Eliminando..." : "Eliminar aviso"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div></TableCell>
    </TableRow>
    {estado.isError && <TableRow><TableCell colSpan={8}><p role="alert" className="text-sm text-destructive">No se pudo actualizar el aviso: {estado.error.message}</p></TableCell></TableRow>}
    <Dialog open={Boolean(borrador)} onOpenChange={open => { if (!open && !editar.isPending) setBorrador(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Editar campaña de referidos</DialogTitle><DialogDescription>Actualizá los textos de la campaña y su modal inicial. Guardar conserva las lecturas y presentaciones. Para mostrarla nuevamente, prepará un reenvío desde la grilla. Los textos no modifican las reglas de bonificación.</DialogDescription></DialogHeader>
        {borrador && <form className="space-y-4" onSubmit={event => { event.preventDefault(); editar.mutate(borrador, { onSuccess: () => setBorrador(null) }); }}>
          <div className="space-y-2"><Label htmlFor="campana-titulo">Título</Label><Input id="campana-titulo" required maxLength={200} value={borrador.p_titulo} onChange={event => setBorrador({ ...borrador, p_titulo: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="campana-mensaje">Mensaje</Label><Textarea id="campana-mensaje" required maxLength={10000} rows={4} value={borrador.p_mensaje} onChange={event => setBorrador({ ...borrador, p_mensaje: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="campana-condiciones">Condiciones · una por línea</Label><Textarea id="campana-condiciones" required maxLength={10000} rows={7} value={borrador.p_condiciones} onChange={event => setBorrador({ ...borrador, p_condiciones: event.target.value })} /></div>
          {editar.isError && <p role="alert" className="text-sm text-destructive">{editar.error.message}</p>}
          <Button type="submit" disabled={editar.isPending}>{editar.isPending ? "Guardando..." : "Guardar textos"}</Button>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
