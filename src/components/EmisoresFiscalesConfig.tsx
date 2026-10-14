import { useState } from "react";
import { SITUACIONES_AFIP, type SituacionAfip } from "@/types/cliente";
import { Plus, Pencil, Save } from "lucide-react";
import { useEmisoresFiscales, useGuardarEmisorFiscal } from "@/hooks/useEmisoresFiscales";
import type { EmisorFiscal, GuardarEmisorFiscal } from "@/types/emisorFiscal";
import { useToast } from "@/hooks/use-toast";
import { extractCertificateExpirationDate } from "@/utils/certificate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const empty = (): GuardarEmisorFiscal => ({ cuit_emisor: "", razon_social: "", punto_venta: 1, ambiente: "homologacion", situacion_afip: "", domicilio: "", localidad: "", provincia: "", ingresos_brutos: "", fecha_inicio_actividad: null, activo: true, predeterminado: false, certificado_vencimiento: null });

export function EmisoresFiscalesConfig() {
  const { data: emisores = [], isLoading, error } = useEmisoresFiscales();
  const guardar = useGuardarEmisorFiscal();
  const { toast } = useToast();
  const [editing, setEditing] = useState<GuardarEmisorFiscal | null>(null);
  const set = (field: keyof GuardarEmisorFiscal, value: string | number | boolean | null) => setEditing((current) => current ? { ...current, [field]: value } : current);
  const edit = (emisor: EmisorFiscal) => {
    const { comercio_id: _tenant, tiene_certificados: _certs, ...data } = emisor;
    setEditing(data);
  };
  const save = async () => {
    if (!editing) return;
    try {
      if (!/^\d{11}$/.test(editing.cuit_emisor) || !editing.razon_social.trim() || !Number.isInteger(editing.punto_venta) || editing.punto_venta < 1 || editing.punto_venta > 9999) throw new Error("Ingresá razón social, CUIT de 11 dígitos y punto de venta entre 1 y 9999.");
      if (!SITUACIONES_AFIP.includes(editing.situacion_afip as SituacionAfip)) throw new Error("Seleccione una condicion frente a ARCA.");
      const payload = { ...editing };
      if (!payload.certificado_crt?.trim()) delete payload.certificado_crt;
      else payload.certificado_vencimiento = extractCertificateExpirationDate(payload.certificado_crt);
      if (!payload.certificado_key?.trim()) delete payload.certificado_key;
      await guardar.mutateAsync(payload);
      setEditing(null);toast({ title: "Emisor fiscal guardado" });
    } catch (err) { toast({ title: "No se pudo guardar el emisor", description: err instanceof Error ? err.message : "Error de configuración", variant: "destructive" }); }
  };
  const file = async (field: "certificado_crt" | "certificado_key", selected?: File) => {
    if (selected) set(field, await selected.text());
  };
  return <div className="container mx-auto space-y-6 p-4 sm:p-6"><div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-3xl font-bold">Emisores fiscales ARCA</h1><p className="text-muted-foreground">Varios CUIT para el mismo comercio. Clientes, stock y cuentas corrientes compartidos.</p></div><Button variant="new" onClick={() => setEditing(empty())}><Plus className="mr-2 h-4 w-4" />Agregar emisor</Button></div>
    <Card><CardHeader><CardTitle>CUIT y puntos de venta</CardTitle></CardHeader><CardContent>{isLoading ? <p>Cargando emisores…</p> : error ? <p role="alert" className="text-destructive">{error.message}</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Razón social</TableHead><TableHead>CUIT</TableHead><TableHead>Punto de venta</TableHead><TableHead>Ambiente</TableHead><TableHead>Certificados</TableHead><TableHead>Predeterminado</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{emisores.map((e) => <TableRow key={e.id}><TableCell>{e.razon_social}</TableCell><TableCell>{e.cuit_emisor}</TableCell><TableCell>{String(e.punto_venta).padStart(4,"0")}</TableCell><TableCell>{e.ambiente}</TableCell><TableCell>{e.tiene_certificados ? "Configurados" : "Pendientes"}{e.certificado_vencimiento && <p className="text-xs">Vence: {e.certificado_vencimiento}</p>}</TableCell><TableCell>{e.predeterminado ? "Sí" : "—"}</TableCell><TableCell>{e.activo ? "Activo" : "Inactivo"}</TableCell><TableCell><Button variant="outline" size="icon" aria-label={`Editar ${e.razon_social}`} onClick={() => edit(e)}><Pencil className="h-4 w-4" /></Button></TableCell></TableRow>)}{!emisores.length && <TableRow><TableCell colSpan={8}>Agregá el primer emisor fiscal del comercio.</TableCell></TableRow>}</TableBody></Table></div>}</CardContent></Card>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && !guardar.isPending && setEditing(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{editing?.id ? "Editar emisor" : "Agregar emisor"}</DialogTitle><DialogDescription>Los certificados son independientes por CUIT. Las credenciales guardadas no se muestran; cargá archivos sólo para reemplazarlas.</DialogDescription></DialogHeader>{editing && <>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>Razón social</Label><Input value={editing.razon_social} onChange={(e) => set("razon_social",e.target.value)} /></div><div><Label>CUIT emisor</Label><Input value={editing.cuit_emisor} disabled={Boolean(editing.id)} onChange={(e) => set("cuit_emisor",e.target.value.replace(/\D/g,""))} /></div><div><Label>Punto de venta</Label><Input type="number" min={1} max={9999} value={editing.punto_venta} disabled={Boolean(editing.id)} onChange={(e) => set("punto_venta",Number(e.target.value))} /></div><div><Label>Ambiente</Label><Select value={editing.ambiente} disabled={Boolean(editing.id)} onValueChange={(v) => set("ambiente",v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="homologacion">Homologación</SelectItem><SelectItem value="produccion">Producción</SelectItem></SelectContent></Select></div><div><Label htmlFor="emisor-situacion-afip">Condicion frente a ARCA *</Label><Select value={editing.situacion_afip || ""} onValueChange={(value) => set("situacion_afip",value)}><SelectTrigger id="emisor-situacion-afip" aria-required="true"><SelectValue placeholder="Seleccionar condicion" /></SelectTrigger><SelectContent>{SITUACIONES_AFIP.map((situacion) => <SelectItem key={situacion} value={situacion}>{situacion}</SelectItem>)}</SelectContent></Select></div><div><Label>Domicilio fiscal</Label><Input value={editing.domicilio} onChange={(e) => set("domicilio",e.target.value)} /></div><div><Label>Localidad</Label><Input value={editing.localidad} onChange={(e) => set("localidad",e.target.value)} /></div><div><Label>Provincia</Label><Input value={editing.provincia} onChange={(e) => set("provincia",e.target.value)} /></div><div><Label>Ingresos brutos</Label><Input value={editing.ingresos_brutos} onChange={(e) => set("ingresos_brutos",e.target.value)} /></div><div><Label>Inicio de actividades</Label><Input type="date" value={editing.fecha_inicio_actividad || ""} onChange={(e) => set("fecha_inicio_actividad",e.target.value || null)} /></div></div>
      <div className="flex flex-wrap gap-6"><Label className="flex items-center gap-2"><Switch checked={editing.activo} onCheckedChange={(v) => { set("activo",v); if (!v) set("predeterminado",false); }} />Activo</Label><Label className="flex items-center gap-2"><Switch checked={editing.predeterminado} disabled={!editing.activo} onCheckedChange={(v) => set("predeterminado",v)} />Emisor predeterminado</Label></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>Certificado (.crt)</Label><Input type="file" accept=".crt,.pem" onChange={(e) => void file("certificado_crt",e.target.files?.[0])} /><Textarea aria-label="Certificado del emisor" rows={3} value={editing.certificado_crt || ""} onChange={(e) => set("certificado_crt",e.target.value)} /></div><div><Label>Clave privada (.key)</Label><Input type="file" accept=".key,.pem" onChange={(e) => void file("certificado_key",e.target.files?.[0])} /><Textarea aria-label="Clave privada del emisor" rows={3} value={editing.certificado_key || ""} onChange={(e) => set("certificado_key",e.target.value)} /></div></div>
      <DialogFooter><Button variant="outline" disabled={guardar.isPending} onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={guardar.isPending} onClick={save}><Save className="mr-2 h-4 w-4" />{guardar.isPending ? "Guardando…" : "Guardar emisor"}</Button></DialogFooter>
    </>}</DialogContent></Dialog>
  </div>;
}
