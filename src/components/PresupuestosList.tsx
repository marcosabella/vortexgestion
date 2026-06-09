import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CheckCircle2, Edit, Eye, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
import { usePresupuestos } from "@/hooks/usePresupuestos";
import { Presupuesto } from "@/types/presupuesto";
import { getVentaItemCodigo, getVentaTotalFinal } from "@/types/venta";
import { useComercio } from "@/hooks/useComercio";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { useToast } from "@/hooks/use-toast";
import { buildFacturaWhatsAppPdfFile } from "@/utils/facturaWhatsAppPdf";
import { FacturaImpresion } from "@/components/FacturaImpresion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const downloadFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
};

export function PresupuestosList() {
  const navigate = useNavigate();
  const { presupuestos, isLoading, deletePresupuesto, confirmarPresupuesto, isConfirming, isDeleting } = usePresupuestos();
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Presupuesto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Presupuesto | null>(null);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return presupuestos.filter((item) =>
      item.numero_comprobante.toLowerCase().includes(term) || item.cliente_nombre.toLowerCase().includes(term),
    );
  }, [presupuestos, search]);

  const share = async (presupuesto: Presupuesto) => {
    try {
      const file = await buildFacturaWhatsAppPdfFile({
        venta: presupuesto,
        comercio,
        afipConfig,
        documentType: "presupuesto",
      });
      const text = `Presupuesto ${presupuesto.numero_comprobante} - Total $${getVentaTotalFinal(presupuesto).toFixed(2)}`;
      const data: ShareData = { title: `Presupuesto ${presupuesto.numero_comprobante}`, text, files: [file] };
      if (navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data);
        return;
      }
      downloadFile(file);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      toast({ title: "PDF generado", description: "Adjunte el archivo descargado en WhatsApp Web." });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast({ title: "No se pudo compartir", description: "No se pudo generar el PDF del presupuesto.", variant: "destructive" });
    }
  };

  const confirm = async (presupuesto: Presupuesto) => {
    if (!window.confirm(`Confirmar ${presupuesto.numero_comprobante} y convertirlo en venta?`)) return;
    try {
      await confirmarPresupuesto(presupuesto.id!);
      setSelected(null);
      navigate("/ventas");
    } catch (error) {
      toast({ title: "No se pudo confirmar", description: error instanceof Error ? error.message : "Revise el stock disponible.", variant: "destructive" });
    }
  };

  const remove = async (presupuesto: Presupuesto) => {
    try {
      await deletePresupuesto(presupuesto.id!);
      if (selected?.id === presupuesto.id) setSelected(null);
      setPendingDelete(null);
    } catch (error) {
      toast({ title: "No se pudo eliminar", description: error instanceof Error ? error.message : "Error al eliminar el presupuesto.", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Cargando presupuestos...</div>;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Presupuestos</CardTitle>
          <Button asChild variant="new"><Link to="/presupuestos/nuevo"><Plus className="mr-2 h-4 w-4" />Nuevo Presupuesto</Link></Button>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por numero o cliente..." />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Numero</TableHead><TableHead>Cliente</TableHead><TableHead>Estado</TableHead><TableHead>Total</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
              <TableBody>{filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{format(new Date(item.fecha_venta), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="font-medium">{item.numero_comprobante}</TableCell>
                  <TableCell>{item.cliente_nombre}</TableCell>
                  <TableCell><Badge variant={item.estado === "confirmado" ? "default" : "secondary"}>{item.estado}</Badge></TableCell>
                  <TableCell className="font-semibold">${getVentaTotalFinal(item).toFixed(2)}</TableCell>
                  <TableCell><div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelected(item)}><Eye className="h-4 w-4" /></Button>
                    {item.estado === "pendiente" && <Button asChild size="sm" variant="outline"><Link to={`/presupuestos/${item.id}/editar`}><Edit className="h-4 w-4" /></Link></Button>}
                    {item.estado === "pendiente" && <Button size="sm" variant="destructive" onClick={() => setPendingDelete(item)}><Trash2 className="h-4 w-4" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          {!filtered.length && <p className="py-8 text-center text-muted-foreground">No se encontraron presupuestos.</p>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Presupuesto {selected?.numero_comprobante}</DialogTitle></DialogHeader>
          {selected && <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p><strong>Cliente:</strong> {selected.cliente_nombre}</p>
                <p><strong>Estado:</strong> {selected.estado}</p>
                {selected.venta_vinculada && (
                  <p>
                    <strong>Venta vinculada:</strong>{" "}
                    <Link className="font-medium text-primary underline-offset-4 hover:underline" to={`/ventas?detalle=${selected.venta_vinculada.id}`}>
                      {selected.venta_vinculada.numero_comprobante}
                    </Link>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <FacturaImpresion venta={selected} documentType="presupuesto" />
                <Button size="sm" className="bg-[#25D366] text-white hover:bg-[#1DA851]" onClick={() => share(selected)}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
                {selected.estado === "pendiente" && <Button size="sm" variant="success" disabled={isConfirming} onClick={() => confirm(selected)}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar y vender</Button>}
                {selected.estado === "pendiente" && <Button size="sm" variant="destructive" disabled={isDeleting} onClick={() => setPendingDelete(selected)}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button>}
              </div>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Codigo</TableHead><TableHead>Descripcion</TableHead><TableHead>Cantidad</TableHead><TableHead>P. Unitario</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
              <TableBody>{selected.venta_items?.map((item, index) => <TableRow key={item.id || index}>
                <TableCell>{getVentaItemCodigo(item) || "-"}</TableCell>
                <TableCell>{item.producto?.descripcion || item.descripcion_manual}</TableCell>
                <TableCell>{item.cantidad}</TableCell><TableCell>${item.precio_unitario.toFixed(2)}</TableCell><TableCell>${item.total.toFixed(2)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
            <div className="text-right text-xl font-bold">Total: ${getVentaTotalFinal(selected).toFixed(2)}</div>
          </div>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar presupuesto</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara {pendingDelete?.numero_comprobante}. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) void remove(pendingDelete);
              }}
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
