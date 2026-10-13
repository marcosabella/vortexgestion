import { useEffect, useState } from "react";
import { Download, Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComercio } from "@/hooks/useComercio";
import { useRestauranteQrMesas } from "@/hooks/useRestauranteConsulta";
import { useToast } from "@/hooks/use-toast";
import { descargarRestauranteQr, imprimirRestauranteQr, restauranteConsultaUrl, restauranteQrImagen } from "@/utils/restauranteQr";
import type { MesaQr } from "@/types/restauranteConsulta";

export function RestauranteQrMesas({ comercioId, nombreComercio }: { comercioId: string; nombreComercio: string }) {
  const [cargar, setCargar] = useState(false);
  const mesas = useRestauranteQrMesas(comercioId, cargar);
  return <section className="space-y-4 border-t pt-5">
    <h3 className="flex items-center gap-2 text-lg font-semibold"><QrCode className="h-5 w-5" />QR de carta por mesa</h3>
    <p className="text-sm text-muted-foreground">Imprimí un QR fijo para cada mesa. Al escanearlo, los comensales pueden ver la carta con los productos disponibles y sus precios.</p>
    <Button type="button" variant="outline" disabled={mesas.isFetching} onClick={() => { setCargar(true); if (cargar) void mesas.refetch(); }}>{mesas.isFetching ? "Cargando mesas…" : cargar ? "Actualizar mesas" : "Generar / ver QR por mesa"}</Button>
    {mesas.isError && <p role="alert" className="text-sm text-destructive">No se pudieron cargar los QR. Revisá tus permisos de configuración y volvé a intentar.</p>}
    {cargar && mesas.data && !mesas.isError && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{mesas.data.map(mesa => <TarjetaQrMesa key={mesa.mesa_id} mesa={mesa} nombreComercio={nombreComercio} />)}{!mesas.data.length && <p className="text-sm text-muted-foreground">No hay mesas activas configuradas.</p>}</div>}
  </section>;
}
function TarjetaQrMesa({ mesa, nombreComercio }: { mesa: MesaQr; nombreComercio: string }) {
  const [imagen, setImagen] = useState(""); const [error, setError] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const { toast } = useToast();
  const { comercio } = useComercio();
  useEffect(() => {
    let vigente = true; setImagen(""); setError(false);
    void restauranteQrImagen(restauranteConsultaUrl(mesa.qr_token), nombreComercio, mesa.nombre)
      .then(value => { if (vigente) setImagen(value); }).catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [mesa.qr_token, mesa.nombre, nombreComercio]);
  return <article className="space-y-3 rounded-lg border p-3"><h4 className="break-words font-semibold">{mesa.nombre}</h4>{imagen ? <img src={imagen} alt={`Cartel QR de ${mesa.nombre}`} className="mx-auto w-full max-w-60" /> : <p className="text-sm" role={error ? "alert" : "status"}>{error ? "No se pudo generar la imagen." : "Generando imagen…"}</p>}<div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={!imagen} onClick={() => descargarRestauranteQr(imagen, mesa.nombre)}><Download className="h-4 w-4" />PNG</Button><Button type="button" size="sm" variant="print" disabled={!imagen || imprimiendo || !comercio} onClick={async () => { setImprimiendo(true); try { await imprimirRestauranteQr(imagen); } catch { toast({ title: "No se pudo imprimir el QR", variant: "destructive" }); } finally { setImprimiendo(false); } }}><Printer className="h-4 w-4" />Imprimir</Button></div></article>;
}
