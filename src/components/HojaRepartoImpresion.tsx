import { useRef, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComercio } from "@/hooks/useComercio";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useToast } from "@/hooks/use-toast";
import type {
  RepartoDistribucion,
  ResumenDistribucion,
} from "@/types/distribucion";
import { buildHojaRepartoPrintHtml } from "@/utils/distribucionPdf";
import { printHtml } from "@/utils/documentoPrint";

export function HojaRepartoImpresion(
  { data, reparto, compact = false }: {
    data: ResumenDistribucion;
    reparto: RepartoDistribucion;
    compact?: boolean;
  },
) {
  const { comercio } = useComercio();
  const { data: parametrizacion } = useComercioParametrizacion();
  const { toast } = useToast();
  const [accion, setAccion] = useState<"print" | "pdf" | null>(null);
  const bloqueo = useRef(false);
  async function abrir(action: "print" | "pdf") {
    if (!comercio || bloqueo.current) return;
    bloqueo.current = true;
    setAccion(action);
    try {
      await printHtml(
        buildHojaRepartoPrintHtml(
          data,
          reparto,
          comercio,
          parametrizacion.impresion.formato_comprobante,
        ),
      );
      if (action === "pdf") {
        toast({
          title: "Hoja de reparto en PDF",
          description:
            'Seleccione "Guardar como PDF" en el diálogo de impresión.',
        });
      }
    } catch (error) {
      toast({
        title: "No se pudo imprimir la hoja de reparto",
        description: error instanceof Error
          ? error.message
          : "Intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      bloqueo.current = false;
      setAccion(null);
    }
  }
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="print"
        disabled={!comercio || accion !== null}
        title="Imprimir hoja de reparto"
        aria-label={"Imprimir hoja de reparto " + reparto.nombre}
        onClick={() => abrir("print")}
      >
        <Printer className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />
        {!compact &&
          (accion === "print" ? "Abriendo..." : "Imprimir hoja de reparto")}
      </Button>
      <Button
        type="button"
        size="sm"
        className="bg-red-600 text-white hover:bg-red-700"
        disabled={!comercio || accion !== null}
        title="Guardar hoja de reparto como PDF"
        aria-label={"Guardar hoja de reparto como PDF " + reparto.nombre}
        onClick={() => abrir("pdf")}
      >
        <FileDown className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />
        {!compact && (accion === "pdf" ? "Generando..." : "PDF")}
      </Button>
    </>
  );
}
