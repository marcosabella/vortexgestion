import { useEffect, useMemo, useState } from "react";
import { FileDown, MessageCircle, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { compartirPdfWhatsApp } from "@/utils/compartirWhatsApp";
import { buildReciboPagoHtml, buildReciboPagoPdf, dineroRecibo, numeroRecibo } from "@/utils/reciboPagoCliente";
import type { ReciboPagoCliente } from "@/types/recibo-pago-cliente";
import { printHtml } from "@/utils/documentoPrint";

export function ReciboPagoClienteDialog({ recibo, onClose }: { recibo: ReciboPagoCliente; onClose: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(false);
  const [soloChat, setSoloChat] = useState(false);
  const html = useMemo(() => buildReciboPagoHtml(recibo), [recibo]);
  useEffect(() => {
    let active = true;
    setFile(null); setError(false); setSoloChat(false);
    buildReciboPagoPdf(recibo).then((pdf) => { if (active) setFile(pdf); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [recibo]);
  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a"); link.href = url; link.download = file.name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const share = async () => {
    if (!file) return;
    const phone = (recibo.cliente_snapshot.telefono || "").replace(/\D/g, "");
    const estado = Number(recibo.saldo_posterior) > 0 ? `saldo pendiente ${dineroRecibo(recibo, recibo.saldo_posterior)}`
      : Number(recibo.saldo_posterior) < 0 ? `saldo a favor ${dineroRecibo(recibo, Math.abs(recibo.saldo_posterior))}` : "cuenta saldada";
    const text = `${recibo.anulado_en ? "RECIBO ANULADO. " : ""}${recibo.historico ? "Comprobante de pago histórico" : "Recibo"} ${numeroRecibo(recibo)} - ${recibo.cliente_snapshot.nombre}. Importe: ${dineroRecibo(recibo, recibo.importe)}. ${recibo.historico ? `Saldo reconstruido al cierre del ${recibo.historico.saldo_a_fecha}` : "Estado al emitir"}: ${estado}.`;
    try {
      const result = await compartirPdfWhatsApp({ files: [file], title: `Recibo ${numeroRecibo(recibo)}`, text }, `https://wa.me/${phone ? (phone.startsWith("54") ? phone : `54${phone}`) : ""}?text=${encodeURIComponent(text)}`, soloChat);
      if (result === "descargado") toast({ title: "Recibo descargado", description: "Adjuntá el PDF descargado al chat de WhatsApp." });
    } catch {
      setSoloChat(true);
      toast({ title: "No se pudo compartir el archivo", description: "Volvé a pulsar WhatsApp para abrir el chat y descargar el PDF.", variant: "destructive" });
    }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-w-5xl max-h-[95dvh] overflow-auto">
    <DialogHeader><DialogTitle>Recibo de pago {numeroRecibo(recibo)}</DialogTitle><DialogDescription className="sr-only">Recibo guardado del pago del cliente, con impresión, PDF y WhatsApp.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2">
      <Button variant="print" onClick={() => { void printHtml(html).catch(() => toast({ title: "No se pudo imprimir el recibo", variant: "destructive" })); }}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
      <Button disabled={!file} className="bg-red-600 text-white hover:bg-red-700" onClick={download}><FileDown className="mr-2 h-4 w-4" />PDF</Button>
      <Button disabled={!file} className="bg-[#25D366] text-white hover:bg-[#1DA851]" onClick={share}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
    </div>
    {!file && <p className="text-sm text-muted-foreground">{error ? "No se pudo generar el PDF. Podés imprimir el recibo o cerrar y volver a abrirlo para reintentar." : "Preparando PDF…"}</p>}
    <div className="overflow-auto rounded border bg-muted"><iframe title="Vista previa del recibo" srcDoc={html} className="h-[65vh] min-w-[794px] w-full bg-white" /></div>
  </DialogContent></Dialog>;
}
