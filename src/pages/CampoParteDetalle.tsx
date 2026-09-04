import { useState } from "react";
import { Pencil } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ParteForm } from "@/components/campo/ParteForm";
import { ParteLotes } from "@/components/campo/ParteLotes";
import { ParteOperarios } from "@/components/campo/ParteOperarios";
import { ParteMaquinarias } from "@/components/campo/ParteMaquinarias";
import { ParteInsumos } from "@/components/campo/ParteInsumos";
import { CampoParteBadge, CampoParteHistory, ParteLifecycleDetails } from "@/components/campo/CampoParteStatus";
import { useComercio } from "@/hooks/useComercio";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoOrdenDetalle } from "@/hooks/useCampoOrdenDetalle";
import { useAnnulCampoParte, useCampoParte, useConfirmCampoParte, useDiscardCampoParte, useRejectCampoParte, useReopenCampoParte, useSendCampoParte, useUpdateCampoParte } from "@/hooks/useCampoPartes";
import { getCampoPartePermissions } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

type Action = "send"|"confirm"|"reject"|"reopen"|"discard"|"annul";
const copy: Record<Action,{title:string;description:string;needsReason:boolean}> = {
  send:{title:"¿Enviar este parte?",description:"Quedará congelado hasta que un administrador lo apruebe o rechace.",needsReason:false},
  confirm:{title:"¿Aprobar este parte?",description:"Sumará avance confirmado y puede iniciar automáticamente la orden.",needsReason:false},
  reject:{title:"¿Rechazar este parte?",description:"El propietario podrá reabrirlo para corregirlo. El motivo quedará en el historial.",needsReason:true},
  reopen:{title:"¿Reabrir este parte?",description:"Volverá a borrador conservando los datos del rechazo.",needsReason:false},
  discard:{title:"¿Descartar este parte?",description:"Es una acción terminal: los datos permanecerán visibles y no sumarán avance.",needsReason:true},
  annul:{title:"¿Anular este parte?",description:"Conservará sus datos e historial, pero dejará de sumar avance.",needsReason:true},
};

export default function CampoParteDetalle() {
  const nav=useNavigate(), {ordenId,parteId}=useParams(), {comercio}=useComercio(), c=comercio?.id??null, access=useCampoAccess(c);
  const ok=access.perteneceAlComercio&&!access.isLoading&&!access.error&&isCampoUuid(ordenId)&&isCampoUuid(parteId);
  const ordenQ=useCampoOrdenDetalle(c,ordenId,ok), orden=ok?ordenQ.data:null, parteQ=useCampoParte(c,ordenId,parteId,ok,orden), parte=ok?parteQ.data:null;
  const permissions=parte?getCampoPartePermissions(parte,access):null;
  const update=useUpdateCampoParte(c,ordenId??null,parteId??null,ok&&Boolean(permissions?.canEditParte),orden,parte);
  const send=useSendCampoParte(c,ordenId??null,parteId??null,ok&&Boolean(permissions?.canSendParte),orden,parte);
  const confirm=useConfirmCampoParte(c,ordenId??null,parteId??null,ok&&Boolean(permissions?.canConfirmParte),orden,parte);
  const reject=useRejectCampoParte(c,ordenId??null,parteId??null,ok&&Boolean(permissions?.canRejectParte),orden,parte);
  const reopen=useReopenCampoParte(c,ordenId??null,parteId??null,ok&&Boolean(permissions?.canReopenParte),orden,parte);
  const discard=useDiscardCampoParte(c,ordenId??null,parteId??null,ok&&Boolean(permissions?.canDiscardParte),orden,parte);
  const annul=useAnnulCampoParte(c,ordenId??null,parteId??null,ok&&Boolean(permissions?.canAnnulParte),orden,parte);
  const [action,setAction]=useState<Action|null>(null),[motivo,setMotivo]=useState(""),[editing,setEditing]=useState(false),[editSaving,setEditSaving]=useState(false);
  if(!ok)return <div className="p-8">{access.isLoading?"Verificando acceso...":"Sin acceso"}</div>;
  if(ordenQ.isLoading||parteQ.isLoading)return <div className="p-8">Cargando parte...</div>;
  if(!orden||!parte||!permissions)return <div className="p-8">Parte no encontrado o sin acceso.</div>;
  const pending=send.isPending||confirm.isPending||reject.isPending||reopen.isPending||discard.isPending||annul.isPending;
  const initialValues={orden_labor_id:parte.orden_labor_id,fecha_trabajo:parte.fecha_trabajo,hora_inicio:parte.hora_inicio??"",hora_fin:parte.hora_fin??"",descripcion:parte.descripcion??"",observaciones:parte.observaciones??"",condiciones_climaticas:parte.condiciones_climaticas??""};
  const run=async()=>{if(!action||pending)return; if(action==="send")await send.mutateAsync(); else if(action==="confirm")await confirm.mutateAsync(); else if(action==="reject")await reject.mutateAsync(motivo); else if(action==="reopen")await reopen.mutateAsync(); else if(action==="discard")await discard.mutateAsync(motivo); else await annul.mutateAsync(motivo); setAction(null);setMotivo("");};
  const openAction=(next:Action)=>{if(!pending){setMotivo("");setAction(next)}};
  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <Button variant="outline" onClick={()=>nav(`/campo/ordenes/${ordenId}`)}>Volver a la orden</Button>
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Parte N.º {parte.numero}</CardTitle><CampoParteBadge estado={parte.estado}/></div></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2"><p>Labor: {parte.labor?.nombre??"—"}</p><p>Fecha: {parte.fecha_trabajo}</p><p>Horario: {parte.hora_inicio??"—"} – {parte.hora_fin??"—"}</p><p>Clima: {parte.condiciones_climaticas??"—"}</p><p className="md:col-span-2">Descripción: {parte.descripcion??"—"}</p><p className="md:col-span-2">Observaciones: {parte.observaciones??"—"}</p></div>
      <ParteLifecycleDetails parte={parte}/>
      <div className="flex flex-wrap gap-2">
        {permissions.canEditParte&&<Button size="icon" variant="outline" onClick={()=>setEditing(true)} aria-label="Editar cabecera del parte" title="Editar cabecera"><Pencil className="h-4 w-4"/></Button>}
        {permissions.canSendParte&&<Button disabled={pending} onClick={()=>openAction("send")}>Enviar parte</Button>}
        {permissions.canConfirmParte&&<Button disabled={pending} onClick={()=>openAction("confirm")}>Aprobar parte</Button>}
        {permissions.canRejectParte&&<Button variant="outline" disabled={pending} onClick={()=>openAction("reject")}>Rechazar</Button>}
        {permissions.canReopenParte&&<Button disabled={pending} onClick={()=>openAction("reopen")}>Reabrir como borrador</Button>}
        {permissions.canDiscardParte&&<Button variant="outline" disabled={pending} onClick={()=>openAction("discard")}>Descartar</Button>}
        {permissions.canAnnulParte&&<Button variant="destructive" disabled={pending} onClick={()=>openAction("annul")}>Anular parte</Button>}
      </div>
    </CardContent></Card>
    <ParteLotes comercioId={c!} ordenId={ordenId!} parteId={parteId!} access={ok} canEditParte={permissions.canEditParte} orden={orden} parte={parte}/>
    <ParteOperarios comercioId={c!} ordenId={ordenId!} parteId={parteId!} access={ok} canEditParte={permissions.canEditParte} orden={orden} parte={parte}/>
    <ParteMaquinarias comercioId={c!} ordenId={ordenId!} parteId={parteId!} access={ok} canEditParte={permissions.canEditParte} orden={orden} parte={parte}/>
    <ParteInsumos comercioId={c!} ordenId={ordenId!} parteId={parteId!} access={ok} canEditParte={permissions.canEditParte} orden={orden} parte={parte}/>
    <CampoParteHistory comercioId={c!} ordenId={ordenId!} parte={parte} access={ok}/>
    <Dialog open={editing} onOpenChange={v=>{if(!editSaving)setEditing(v)}}><DialogContent className="max-h-[90vh] overflow-y-auto" onEscapeKeyDown={e=>{if(editSaving)e.preventDefault()}} onInteractOutside={e=>{if(editSaving)e.preventDefault()}}><DialogHeader><DialogTitle>Editar cabecera del parte</DialogTitle></DialogHeader><ParteForm labores={[{id:parte.orden_labor_id,nombre:parte.labor?.nombre??"Labor del parte",activo:true}]} initial={initialValues} pending={update.isPending} onSaving={setEditSaving} onSubmit={async values=>{await update.mutateAsync(values);setEditing(false)}}/></DialogContent></Dialog>
    <AlertDialog open={Boolean(action)} onOpenChange={v=>{if(!v&&!pending){setAction(null);setMotivo("")}}}><AlertDialogContent onEscapeKeyDown={e=>{if(pending)e.preventDefault()}} onInteractOutside={e=>{if(pending)e.preventDefault()}}><AlertDialogHeader><AlertDialogTitle>{action&&copy[action].title}</AlertDialogTitle><AlertDialogDescription>{action&&copy[action].description}</AlertDialogDescription></AlertDialogHeader>{action&&copy[action].needsReason&&<Input value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Motivo obligatorio" disabled={pending}/>}<AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={pending||Boolean(action&&copy[action].needsReason&&!motivo.trim())} onClick={e=>{e.preventDefault();void run().catch(()=>undefined)}}>{pending?"Guardando...":"Confirmar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
