import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Gift, CheckCircle2 } from "lucide-react";
import { useAdminComercios, useIsAppAdmin } from "@/hooks/useAdminComercios";
import { useAdminReferidos, vistaPreviaReferidos } from "@/hooks/useReferidos";
import { estadosReferido, type Referido } from "@/types/referidos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const fecha = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR") : "—";
export default function AdminReferidos() {
  const permisos = useIsAppAdmin();
  const [pagina, setPagina] = useState(0);
  const { listado, gestionar } = useAdminReferidos(pagina, permisos.data === true);
  const { comerciosQuery } = useAdminComercios(permisos.data === true && !vistaPreviaReferidos);
  const [seleccion, setSeleccion] = useState<{ registro: Referido; accion: "confirmar_pago" | "bonificar" } | null>(null);
  const [nuevoComercio, setNuevoComercio] = useState("");
  const [evidencia, setEvidencia] = useState("");
  if (permisos.isLoading) return <div role="status" className="p-6">Cargando permisos…</div>;
  if (!permisos.data) return <Navigate to="/" replace />;
  const confirmar = async () => {
    if (!seleccion) return;
    try {
      await gestionar.mutateAsync({ p_id: seleccion.registro.id, p_accion: seleccion.accion, ...(seleccion.accion === "confirmar_pago" ? { p_nuevo_comercio_id: nuevoComercio, p_evidencia: evidencia.trim() } : {}) });
      setSeleccion(null); setNuevoComercio(""); setEvidencia("");
    } catch { /* El error de la mutacion se muestra junto a la accion. */ }
  };
  return <div className="container mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <div><h1 className="flex items-center gap-2 text-3xl font-bold"><Gift />Referidos y bonificaciones</h1><p className="mt-2 text-sm text-muted-foreground">Validá el primer pago antes de aplicar un mes. Cada beneficio se registra y se aplica una sola vez.</p></div>
    {vistaPreviaReferidos && <p role="status" className="rounded-md border bg-amber-50 p-4 text-sm text-amber-950">Modo local: probá la campaña y el modal desde Notificaciones. Este panel no consulta referencias ni cambia licencias de producción.</p>}
    {listado.isLoading ? <p role="status">Cargando referencias…</p> : listado.isError ? <p role="alert" className="text-destructive">No se pudieron cargar los referidos. Verificá que las migraciones del programa estén aplicadas.</p> : <>
      {!listado.data?.items.length && <Card><CardContent className="p-6 text-sm text-muted-foreground">Todavía no hay consultas recibidas mediante enlaces de recomendación.</CardContent></Card>}
      {listado.data?.items.map(r => <Card key={r.id}><CardHeader><div className="flex flex-wrap justify-between gap-2"><CardTitle className="text-lg">{r.consulta.negocio}</CardTitle><Badge>{estadosReferido[r.estado]}</Badge></div><p className="text-sm text-muted-foreground">Recomendado por {r.participacion.comercio.nombre_comercio} · {fecha(r.creado_en)}</p></CardHeader><CardContent className="space-y-4">
        <p className="break-words text-sm">{r.consulta.nombre} · {r.consulta.email}{r.consulta.telefono ? ` · ${r.consulta.telefono}` : ""}</p>
        {r.evidencia_pago && <p className="text-sm">Primer pago: {r.evidencia_pago}</p>}
        {r.estado === "bonificado" && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Mes aplicado el {fecha(r.bonificado_at)}. Vencimiento anterior: {fecha(r.vigencia_anterior)}. Nuevo: {fecha(r.vigencia_nueva)}.</p>}
        <div className="flex flex-wrap gap-2">
          {r.estado === "consulta" && <Button variant="outline" disabled={gestionar.isPending} onClick={() => gestionar.mutate({ p_id: r.id, p_accion: "contactar" })}>Marcar en contacto</Button>}
          {["consulta", "contactado"].includes(r.estado) && <><Button disabled={gestionar.isPending} onClick={() => { gestionar.reset(); setSeleccion({ registro: r, accion: "confirmar_pago" }); }}>Confirmar primer pago</Button><Button variant="ghost" disabled={gestionar.isPending} onClick={() => gestionar.mutate({ p_id: r.id, p_accion: "descartar" })}>Descartar</Button></>}
          {r.estado === "pago_confirmado" && <Button disabled={gestionar.isPending} onClick={() => { gestionar.reset(); setSeleccion({ registro: r, accion: "bonificar" }); }}>Aplicar un mes bonificado</Button>}
        </div>
      </CardContent></Card>)}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={pagina === 0 || listado.isFetching} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span className="text-sm">Página {pagina + 1} · {listado.data?.total || 0} referencias</span><Button variant="outline" disabled={(pagina + 1) * 20 >= (listado.data?.total || 0) || listado.isFetching} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>
    </>}
    {gestionar.isError && !seleccion && <p role="alert" className="text-sm text-destructive">{gestionar.error.message}</p>}
    <Dialog open={Boolean(seleccion)} onOpenChange={open => { if (!open && !gestionar.isPending) setSeleccion(null); }}><DialogContent><DialogHeader><DialogTitle>{seleccion?.accion === "bonificar" ? "Aplicar un mes de licencia" : "Confirmar primer pago"}</DialogTitle><DialogDescription>{seleccion?.accion === "bonificar" ? `Se extenderá un mes la vigencia de ${seleccion.registro.participacion.comercio.nombre_comercio} y se le enviará una notificación. No anula facturas emitidas.` : "Esta confirmación es manual: verificá el pago y vinculá el comercio que contrató."}</DialogDescription></DialogHeader>
      {seleccion?.accion === "confirmar_pago" && <div className="space-y-4"><div className="space-y-2"><Label htmlFor="referido-comercio">Nuevo comercio contratado</Label><Select value={nuevoComercio} onValueChange={setNuevoComercio} disabled={comerciosQuery.isLoading || comerciosQuery.isError}><SelectTrigger id="referido-comercio"><SelectValue placeholder="Seleccionar nuevo comercio" /></SelectTrigger><SelectContent>{comerciosQuery.data?.filter(c => c.id !== seleccion.registro.comercio_id && c.activo).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre_comercio} · {c.cuit}</SelectItem>)}</SelectContent></Select>{comerciosQuery.isError && <p role="alert" className="text-sm text-destructive">No se pudieron cargar los comercios.</p>}</div><div className="space-y-2"><Label htmlFor="referido-pago">Comprobante o referencia del pago verificado</Label><Input id="referido-pago" value={evidencia} onChange={e => setEvidencia(e.target.value)} maxLength={500} placeholder="Ej.: transferencia recibida, comprobante…" /></div></div>}
      {gestionar.isError && <p role="alert" className="text-sm text-destructive">{gestionar.error.message}</p>}
      <Button disabled={gestionar.isPending || (seleccion?.accion === "confirmar_pago" && (!nuevoComercio || evidencia.trim().length < 3))} onClick={() => void confirmar()}>{gestionar.isPending ? "Guardando…" : seleccion?.accion === "bonificar" ? "Confirmar bonificación" : "Registrar pago confirmado"}</Button>
    </DialogContent></Dialog>
  </div>;
}
