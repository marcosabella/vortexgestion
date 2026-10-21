import { lazy, Suspense, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLicenciaComercio } from "@/hooks/useLicenciaComercio";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useEmisoresFiscales } from "@/hooks/useEmisoresFiscales";
import type { AdminComercio } from "@/hooks/useAdminComercios";
import { CONCEPTO_LICENCIA } from "@/types/licencia";

const DetalleVenta = lazy(() => import("@/components/VentasList").then((module) => ({ default: module.VentasList })));
const hoyArgentina = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const importeArs = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function LicenciaComercioButton({ comercio }: { comercio: AdminComercio }) {
  const [open, setOpen] = useState(false);
  const [ventaId, setVentaId] = useState<string | null>(null);
  const licencia = useLicenciaComercio(comercio.id, open);
  const { data: parametros } = useComercioParametrizacion();
  const multiple = Boolean(parametros.funciones.multiples_cuit);
  const emisores = useEmisoresFiscales(open && multiple);
  const [emisorId, setEmisorId] = useState("");
  const [importe, setImporte] = useState("");
  const [concepto, setConcepto] = useState(CONCEPTO_LICENCIA);
  const [periodo, setPeriodo] = useState(hoyArgentina().slice(0, 7));
  const [vencimiento, setVencimiento] = useState(hoyArgentina());
  const [tipo, setTipo] = useState("recibo_x");
  const [iva, setIva] = useState("0");
  const config = licencia.query.data?.configuracion;
  useEffect(() => {
    setImporte(config ? String(config.importe_mensual) : "");
    setConcepto(config?.concepto || CONCEPTO_LICENCIA);
  }, [config, licencia.emisor?.id, comercio.id]);
  useEffect(() => { setEmisorId(""); setVentaId(null); }, [licencia.emisor?.id]);
  const busy = licencia.guardar.isPending || licencia.generar.isPending;
  const emisorValido = Boolean(licencia.emisor?.id && licencia.emisor.id !== comercio.id);
  const dirty = !config || Number(importe) !== Number(config.importe_mensual) || concepto.trim() !== config.concepto;
  const existentes = licencia.query.data?.comprobantes || [];
  const comprobanteMes = existentes.find((item) => item.periodo.slice(0, 7) === periodo && item.venta_id);
  const cerrar = (value: boolean) => { if (!busy) setOpen(value); };

  return <>
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm" title="Licencia mensual y comprobantes"><FileText className="h-4 w-4" /><span className="sr-only">Licencia de {comercio.nombre_comercio}</span></Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] w-max min-w-0 max-w-[calc(100%-2rem)] gap-3 overflow-y-auto p-4 sm:p-5">
        <DialogHeader><DialogTitle>Licencia mensual · {comercio.nombre_comercio}</DialogTitle></DialogHeader>
        {!emisorValido ? <p role="status">Seleccioná tu comercio emisor en el selector de comercios. Debe ser diferente al destinatario.</p>
          : licencia.query.isLoading ? <p role="status">Cargando licencia...</p>
          : licencia.query.error ? <div role="alert" className="space-y-2 text-destructive"><p>{licencia.query.error.message}</p><Button type="button" variant="outline" onClick={() => licencia.query.refetch()}>Reintentar</Button></div>
          : <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm"><p>Emisor: <strong>{licencia.emisor?.nombre_comercio}</strong></p><p>Destinatario: {comercio.nombre_comercio} · CUIT {comercio.cuit}</p></div>
            <form className="flex flex-wrap items-end gap-3 rounded-md border p-3" onSubmit={(event) => { event.preventDefault(); licencia.guardar.mutate({ importe: Number(importe), concepto: concepto.trim() }); }}>
              <div className="space-y-1.5"><Label className="block text-xs" htmlFor={`licencia-importe-${comercio.id}`}>Importe mensual final (ARS, IVA incluido)</Label><Input className="h-9 w-40 max-w-full" id={`licencia-importe-${comercio.id}`} type="number" min="0.01" step="0.01" required value={importe} disabled={busy} onChange={(event) => setImporte(event.target.value)} /></div>
              <div className="w-72 max-w-full space-y-1.5"><Label className="block text-xs" htmlFor={`licencia-concepto-${comercio.id}`}>Concepto</Label><Input className="h-9" id={`licencia-concepto-${comercio.id}`} required maxLength={200} value={concepto} disabled={busy} onChange={(event) => setConcepto(event.target.value)} /></div>
              <Button className="h-9" type="submit" variant="success" disabled={busy || !dirty || !Number.isFinite(Number(importe)) || Number(importe) <= 0 || !concepto.trim()}>{licencia.guardar.isPending ? "Guardando..." : "Guardar importe mensual"}</Button>
            </form>
            <form className="space-y-2 rounded-md border p-3" onSubmit={(event) => {
              event.preventDefault();
              licencia.generar.mutate({ periodo, tipo, iva: Number(iva), vencimiento, emisorId: multiple ? emisorId : undefined }, { onSuccess: (data) => { setVentaId(data.venta_id); setOpen(false); } });
            }}>
              <h3 className="font-semibold">Generar comprobante</h3>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="space-y-1.5"><Label className="block text-xs" htmlFor={`licencia-periodo-${comercio.id}`}>Mes a facturar</Label><Input className="h-9 w-48 max-w-full" id={`licencia-periodo-${comercio.id}`} type="month" required value={periodo} disabled={busy} onChange={(event) => setPeriodo(event.target.value)} /></div>
                <div className="space-y-1.5"><Label className="block text-xs" htmlFor={`licencia-vto-${comercio.id}`}>Vencimiento de pago</Label><Input className="h-9 w-40 max-w-full" id={`licencia-vto-${comercio.id}`} type="date" required min={hoyArgentina()} value={vencimiento} disabled={busy} onChange={(event) => setVencimiento(event.target.value)} /></div>
                <div className="max-w-full space-y-1.5"><Label className="block text-xs">Tipo de comprobante</Label><Select value={tipo} disabled={busy} onValueChange={(value) => { setTipo(value); if (value === "factura_c" || value === "recibo_x") setIva("0"); }}><SelectTrigger className="h-9 w-auto max-w-full gap-2" aria-label="Tipo de comprobante de licencia"><SelectValue /></SelectTrigger><SelectContent>{[["recibo_x","Comprobante X (sin valor fiscal)"],["factura_a","Factura A"],["factura_b","Factura B"],["factura_c","Factura C"]].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="block text-xs">IVA incluido</Label><Select value={iva} disabled={busy || tipo === "factura_c" || tipo === "recibo_x"} onValueChange={setIva}><SelectTrigger className="h-9 w-20" aria-label="IVA de licencia"><SelectValue /></SelectTrigger><SelectContent>{[0,10.5,21,27].map((value) => <SelectItem key={value} value={String(value)}>{value}%</SelectItem>)}</SelectContent></Select></div>
                {multiple && <div className="max-w-full space-y-1.5"><Label className="block text-xs">CUIT emisor</Label><Select value={emisorId} disabled={busy} onValueChange={setEmisorId}><SelectTrigger className="h-9 w-auto min-w-48 max-w-[20rem] gap-2" aria-label="CUIT emisor de licencia"><SelectValue placeholder="Seleccionar emisor" /></SelectTrigger><SelectContent>{emisores.data?.filter((emisor) => emisor.activo).map((emisor) => <SelectItem key={emisor.id} value={emisor.id}>{emisor.razon_social} · {emisor.cuit_emisor}</SelectItem>)}</SelectContent></Select></div>}
                {comprobanteMes ? <Button className="h-9" type="button" variant="outline" onClick={() => { setVentaId(comprobanteMes.venta_id); setOpen(false); }}>Abrir comprobante de este mes</Button>
                  : <Button className="h-9" type="submit" disabled={busy || dirty || !periodo || !vencimiento || (multiple && !emisorId)}>{licencia.generar.isPending ? "Generando..." : "Generar comprobante mensual"}</Button>}
              </div>
              {multiple && emisores.error && <p role="alert" className="text-xs text-destructive">{emisores.error.message}</p>}
              <p className="max-w-4xl text-xs text-muted-foreground">Se registra una venta en cuenta corriente del emisor. No registra un cobro ni renueva la membresía. Para una factura fiscal, obtené el CAE desde el comprobante antes de enviarla.</p>
              {dirty && <p className="text-xs text-muted-foreground">Guardá el importe y el concepto antes de generar el comprobante.</p>}
            </form>
            <section className="space-y-2"><h3 className="font-semibold">Últimos 24 períodos</h3>{!existentes.length ? <p className="text-sm text-muted-foreground">Todavía no hay comprobantes de licencia.</p> : existentes.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><div><strong>{item.periodo.slice(5,7)}/{item.periodo.slice(0,4)}</strong> · {importeArs(item.importe)}<p>{item.numero_comprobante || "Venta eliminada"} {item.cae ? "· Con CAE" : item.tipo_comprobante === "recibo_x" ? "· Comprobante X" : item.venta_id ? "· Pendiente de CAE" : ""}</p></div>{item.venta_id && <Button type="button" variant="outline" size="sm" onClick={() => { setVentaId(item.venta_id); setOpen(false); }}>Abrir comprobante</Button>}</div>)}</section>
          </div>}
      </DialogContent>
    </Dialog>
    {ventaId && <Suspense fallback={<p role="status">Cargando comprobante...</p>}><DetalleVenta detalleId={ventaId} notificacionComercioIdInicial={comercio.id} onCerrarDetalle={() => setVentaId(null)} /></Suspense>}
  </>;
}
