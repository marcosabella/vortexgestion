import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Check, Copy, Gift, MessageCircle, Pin, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProgramaReferidos, useLeerCampanaReferidos, referidosApi, vistaPreviaReferidos } from "@/hooks/useReferidos";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { enlaceReferido, mensajeReferido } from "@/utils/referidos";
import type { ProgramaReferidos } from "@/types/referidos";
import { avisoCampanaVisible, condicionesCampanaPredeterminadas, mensajeCampanaPredeterminado } from "@/utils/comunicaciones";

const REABRIR_EVENTO = "vortex:probar-modal-referidos";
function ContenidoReferidos({ programa }: { programa: ProgramaReferidos }) {
  const { toast } = useToast();
  const enlace = enlaceReferido(programa.codigo, vistaPreviaReferidos ? window.location.origin : undefined);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(enlace); toast({ title: "Enlace copiado" }); }
    catch { toast({ title: "No se pudo copiar", description: "Podés seleccionar y copiar el enlace que aparece debajo.", variant: "destructive" }); }
  };
  return <div className="space-y-5">
    <p className="whitespace-pre-line text-sm leading-6">{programa.mensaje || mensajeCampanaPredeterminado}</p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button asChild className="whitespace-normal"><a href={`https://wa.me/?text=${encodeURIComponent(mensajeReferido(enlace))}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4 shrink-0" />Compartir por WhatsApp</a></Button>
      <Button variant="outline" onClick={() => void copiar()}><Copy className="h-4 w-4" />Copiar enlace</Button>
    </div>
    <div className="rounded-md border bg-background/70 p-3 text-xs"><span className="text-muted-foreground">Tu enlace de recomendación</span><p className="mt-1 select-all break-all">{enlace}</p></div>
    <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Cómo funciona y condiciones</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
        {(programa.condiciones || condicionesCampanaPredeterminadas).split("\n").filter(linea => linea.trim()).map((linea, index) => <li key={index}>{linea}</li>)}
      </ol>
    </details>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span>Pendientes: <strong className="text-foreground">{programa.pendientes}</strong></span><span>Meses bonificados: <strong className="text-foreground">{programa.meses_bonificados}</strong></span></div>
    {vistaPreviaReferidos && <p role="status" className="rounded-md bg-amber-50 p-3 text-xs text-amber-950">Vista previa local. El código y los contadores son de prueba; no se modifican licencias ni se registra la presentación del modal en producción.</p>}
  </div>;
}
export function NotificacionReferidos() {
  const { data } = useProgramaReferidos();
  const leer = useLeerCampanaReferidos();
  if (!data || !avisoCampanaVisible(data)) return null;
  return <Card className="border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><Badge className="gap-1"><Pin className="h-3 w-3" />Destacada</Badge>{data.notificacion_leida_at && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3" />Leída · disponible para compartir</span>}</div><CardTitle className="flex items-center gap-2 pt-2 text-xl"><Gift className="h-5 w-5 shrink-0" />{data.titulo}</CardTitle></CardHeader>
    <CardContent className="space-y-4"><ContenidoReferidos programa={data} />
      <div className="flex flex-wrap gap-2">{!data.notificacion_leida_at && <Button variant="ghost" size="sm" disabled={leer.isPending} onClick={() => leer.mutate(data.campana_id)}>Marcar como leída</Button>}{vistaPreviaReferidos && <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event(REABRIR_EVENTO))}><RotateCcw className="h-4 w-4" />Probar modal</Button>}</div>
      {leer.isError && <p role="alert" className="text-sm text-destructive">No se pudo guardar la lectura. Intentá nuevamente.</p>}
    </CardContent>
  </Card>;
}
export function ModalReferidos({ bloqueado = false, onVisibilityChange }: { bloqueado?: boolean; onVisibilityChange?: (open: boolean) => void }) {
  const { comercio } = useComercio();
  const { data } = useProgramaReferidos();
  const client = useQueryClient();
  const location = useLocation();
  const actual = useRef(comercio?.id);
  actual.current = comercio?.id;
  const [abierto, setAbierto] = useState<string | null>(null);
  const localPresentado = useRef<string | null>(null);
  const disponible = ["/", "/inicio", "/caja", "/notificaciones"].includes(location.pathname);
  const visible = Boolean(data && avisoCampanaVisible(data) && comercio?.id && !bloqueado && abierto === `${comercio.id}:${data.campana_id}`);
  useEffect(() => {
    onVisibilityChange?.(visible);
    return () => onVisibilityChange?.(false);
  }, [visible, onVisibilityChange]);
  useEffect(() => {
    if (bloqueado || !data || !avisoCampanaVisible(data) || !comercio?.id || !disponible) return;
    const id = comercio.id, key = `${id}:${data.campana_id}`;
    if (vistaPreviaReferidos) {
      if (localPresentado.current !== key) { localPresentado.current = key; setAbierto(key); }
      return;
    }
    if (data.modal_visto_at) return;
    // fetchQuery deduplica StrictMode y montajes simultaneos; PostgreSQL arbitra entre dispositivos.
    void client.fetchQuery({ queryKey: ["reclamar-modal-referidos", id, data.campana_id], staleTime: Infinity, retry: false, queryFn: async () => {
      const { data: claimed, error } = await referidosApi.rpc("reclamar_modal_referidos", { p_comercio_id: id, p_campana_id: data.campana_id });
      if (error) throw error;
      return Boolean(claimed);
    } }).then(claimed => { if (claimed && actual.current === id) setAbierto(key); }).catch(() => { /* La campana sigue disponible en Notificaciones; no se bloquea el trabajo. */ });
  }, [bloqueado, client, comercio?.id, data, disponible]);
  useEffect(() => {
    if (!vistaPreviaReferidos) return;
    const reabrir = () => { if (comercio?.id && data) setAbierto(`${comercio.id}:${data.campana_id}`); };
    window.addEventListener(REABRIR_EVENTO, reabrir);
    return () => window.removeEventListener(REABRIR_EVENTO, reabrir);
  }, [comercio?.id, data]);
  if (!data || !avisoCampanaVisible(data) || !comercio?.id || bloqueado) return null;
  const cerrar = () => {
    setAbierto(null);
    if (!vistaPreviaReferidos) {
      client.setQueryData(["reclamar-modal-referidos", comercio.id, data.campana_id], false);
      void client.invalidateQueries({ queryKey: ["programa-referidos", comercio.id] });
    }
  };
  return <Dialog open={abierto === `${comercio.id}:${data.campana_id}`} onOpenChange={open => { if (!open) cerrar(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Gift className="h-6 w-6" /></div><DialogTitle className="text-2xl">{data.titulo}</DialogTitle><DialogDescription>Tu recomendación tiene premio.</DialogDescription></DialogHeader>
      <ContenidoReferidos programa={data} /><Button variant="outline" onClick={cerrar}>Ahora no · seguir trabajando</Button>
    </DialogContent>
  </Dialog>;
}
