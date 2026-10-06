import { useRef, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import type { RepartoDistribucion, ResumenDistribucion } from "@/types/distribucion";
import { buildHojaRutaPrintHtml } from "@/utils/distribucionRuta";
import { printHtml } from "@/utils/documentoPrint";

export function HojaRutaImpresion({ data, reparto, compact = false, disabled = false }: { data: ResumenDistribucion; reparto: RepartoDistribucion; compact?: boolean; disabled?: boolean }) {
  const { comercio } = useComercio(), { toast } = useToast();
  const bloqueo = useRef(false), [abriendo, setAbriendo] = useState(false);
  async function imprimir(pdf: boolean) {
    if (!comercio || bloqueo.current) return;
    bloqueo.current = true; setAbriendo(true);
    try {
      if (pdf) toast({ title: "Hoja de ruta", description: 'Elegí "Guardar como PDF" en el diálogo de impresión.' });
      await printHtml(buildHojaRutaPrintHtml(data, reparto, comercio));
    } catch (error) {
      toast({ title: "No se pudo imprimir", description: error instanceof Error ? error.message : "Intentá nuevamente.", variant: "destructive" });
    } finally { bloqueo.current = false; setAbriendo(false); }
  }
  const inhabilitado = disabled || !comercio || abriendo || !data.paradas.some(p => p.reparto_id === reparto.id);
  return <>
    <Button variant="print" size="sm" title="Imprimir hoja de ruta" aria-label={`Imprimir hoja de ruta ${reparto.nombre}`} disabled={inhabilitado} onClick={() => imprimir(false)}><Printer className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"}/>{!compact && "Imprimir hoja de ruta"}</Button>
    <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" title="PDF de hoja de ruta" aria-label={`PDF de hoja de ruta ${reparto.nombre}`} disabled={inhabilitado} onClick={() => imprimir(true)}><FileDown className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"}/>{!compact && "PDF"}</Button>
  </>;
}
