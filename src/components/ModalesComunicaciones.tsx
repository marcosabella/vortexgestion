import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ModalReferidos } from "@/components/referidos/CampanaReferidos";
import { useProgramaReferidos } from "@/hooks/useReferidos";
import { useModalesNotificaciones } from "@/hooks/useComunicaciones";
import { useComercio } from "@/hooks/useComercio";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { avisoCampanaVisible, metadataComunicacion } from "@/utils/comunicaciones";

export function ModalesComunicaciones({ bloqueado = false }: { bloqueado?: boolean }) {
  const [referidosAbierto, setReferidosAbierto] = useState(false);
  const programa = useProgramaReferidos();
  const { comercio } = useComercio();
  const { pendientes, confirmar } = useModalesNotificaciones();
  const location = useLocation();
  const disponible = ["/", "/inicio", "/caja", "/notificaciones"].includes(location.pathname);
  // La campaña inicial tiene prioridad; nunca superponer ambos tipos de modal.
  const esperandoReferidos = programa.isPending || Boolean(programa.data && avisoCampanaVisible(programa.data) && !programa.data.modal_visto_at);
  const aviso = !bloqueado && disponible && !referidosAbierto && !esperandoReferidos ? pendientes.data?.[0] : undefined;
  const cerrar = () => {
    if (aviso && comercio && !confirmar.isPending) confirmar.mutate({ comercioId: comercio.id, notificacionId: aviso.id });
  };
  return <>
    <ModalReferidos bloqueado={bloqueado || Boolean(aviso)} onVisibilityChange={setReferidosAbierto} />
    <Dialog open={Boolean(aviso)} onOpenChange={open => { if (!open) cerrar(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{aviso?.titulo}</DialogTitle><DialogDescription>Aviso de la administración</DialogDescription></DialogHeader>
        <p className="whitespace-pre-line break-words text-sm leading-6">{aviso?.mensaje}</p>
        {confirmar.isError && <p role="alert" className="text-sm text-destructive">No se pudo registrar la presentación. Intentá cerrar nuevamente.</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={confirmar.isPending} onClick={cerrar}>{confirmar.isPending ? "Guardando..." : "Entendido · seguir trabajando"}</Button>
          {aviso && metadataComunicacion(aviso.metadata).tipo === "campana_referidos" && <Button asChild variant="outline"><Link to="/notificaciones" onClick={cerrar}>Ver mi enlace de referido</Link></Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
