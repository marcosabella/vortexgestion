import { useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { printHtml } from "@/utils/documentoPrint";
import { restauranteComandaHtml, restauranteCuentaHtml } from "@/utils/restaurantePrint";
import type { ComandaRestaurante, PedidoRestaurante, ResumenRestaurante } from "@/types/restaurante";

export function RestauranteImpresion({ data, pedido, comanda, disabled, registrar }: {
  data: ResumenRestaurante; pedido: PedidoRestaurante; comanda?: ComandaRestaurante; disabled?: boolean;
  registrar?: () => Promise<boolean>;
}) {
  const { comercio } = useComercio();
  const { toast } = useToast();
  const [abriendo, setAbriendo] = useState<"print" | "pdf" | null>(null);
  const formato = comanda ? data.sectores.find(s => s.id === comanda.sector_id)?.impresion || data.config.impresion : data.config.impresion;
  const abrir = async (accion: "print" | "pdf") => {
    setAbriendo(accion);
    try {
      if (registrar && !(await registrar())) return;
      const html = comanda
        ? restauranteComandaHtml(data, { ...comanda, impresiones: comanda.impresiones + 1 }, comercio, formato)
        : restauranteCuentaHtml(data, pedido, comercio, formato);
      await printHtml(html);
      if (accion === "pdf") toast({ title: "Descargar documento en PDF", description: 'Seleccioná "Guardar como PDF" en el diálogo de impresión.' });
    } catch (error) {
      toast({ title: "No se pudo abrir el documento", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setAbriendo(null); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="print" size="sm" disabled={disabled || !comercio || abriendo !== null} onClick={() => void abrir("print")}><Printer className="h-4 w-4" />{abriendo === "print" ? "Abriendo…" : comanda ? comanda.impresiones ? "Reimprimir" : "Imprimir comanda" : "Imprimir detalle de cuenta"}</Button>
    <Button type="button" variant="cancel" size="sm" aria-label={comanda ? `PDF de comanda #${comanda.numero}` : `PDF de cuenta del pedido #${pedido.numero}`} disabled={disabled || !comercio || abriendo !== null} onClick={() => void abrir("pdf")}><FileDown className="h-4 w-4" />{abriendo === "pdf" ? "Generando…" : "PDF"}</Button>
  </div>;
}
