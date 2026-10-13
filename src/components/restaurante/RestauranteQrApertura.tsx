import { useState } from "react";
import { Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComercio } from "@/hooks/useComercio";
import { obtenerQrApertura } from "@/hooks/useRestauranteConsulta";
import { useToast } from "@/hooks/use-toast";
import { descargarRestauranteQr, restauranteConsultaUrl, restauranteQrImagen } from "@/utils/restauranteQr";
import type { AperturaQr } from "@/types/restauranteConsulta";

export function RestauranteQrApertura({ mesaId, nombre }: { mesaId: string; nombre: string }) {
  const { comercio } = useComercio(); const { toast } = useToast();
  const [credencial, setCredencial] = useState<AperturaQr | null>(null);
  const [imagen, setImagen] = useState(""); const [cargando, setCargando] = useState(false);
  return <section className="grid gap-2 border-t pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consulta del comensal · {nombre}</h3>
    <Button type="button" variant="outline" disabled={!comercio || cargando} onClick={async () => {
      if (!comercio) return;
      setCargando(true); setCredencial(null); setImagen("");
      try {
        const acceso = await obtenerQrApertura(comercio.id, mesaId);
        const png = await restauranteQrImagen(restauranteConsultaUrl(acceso.qr_token, acceso.apertura_token), comercio.nombre_comercio, acceso.nombre, true);
        setCredencial(acceso); setImagen(png);
      } catch { toast({ title: "No se pudo obtener el acceso de esta apertura", description: "Actualizá la mesa y verificá tus permisos.", variant: "destructive" }); }
      finally { setCargando(false); }
    }}><QrCode className="h-4 w-4" />{cargando ? "Preparando acceso…" : "Mostrar QR de esta apertura"}</Button>
    {credencial && imagen && <><img src={imagen} alt={`QR de consulta de la apertura de ${nombre}`} className="w-full" /><p className="text-xs text-muted-foreground">Mostrá este QR al comensal. Sirve solo para consultar esta apertura.</p><label className="text-xs font-medium">Código para el QR fijo<input readOnly value={credencial.apertura_token} className="mt-1 w-full rounded border bg-background p-2 text-xs" onFocus={e => e.currentTarget.select()} /></label><Button type="button" variant="outline" size="sm" onClick={() => descargarRestauranteQr(imagen, `${nombre}-apertura`)}><Download className="h-4 w-4" />Descargar PNG</Button></>}
  </section>;
}
