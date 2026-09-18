import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type CampoParteInsumo, type CampoParteInsumoValues, useCampoParteInsumoCandidates, useCampoParteInsumos, useCreateCampoParteInsumo, useSetCampoParteInsumoStatus, useUpdateCampoParteInsumo } from "@/hooks/useCampoParteInsumos";
import type { CampoInsumo, CampoOrdenDetail, CampoParte } from "@/types/campo";

type FormValues = { insumo_id: string; cantidad: string; observaciones: string };
const decimal = /^\d+(?:[.,]\d+)?$/;
const schema: z.ZodType<FormValues> = z.object({
  insumo_id: z.string().uuid("Seleccioná un insumo"),
  cantidad: z.string().trim().refine((value) => decimal.test(value) && Number.isFinite(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) > 0, "Debe ser un número mayor que cero"),
  observaciones: z.string().trim(),
});

function InsumoForm({ item, candidates, pending, onSubmit }: { item: CampoParteInsumo | null; candidates: CampoInsumo[]; pending: boolean; onSubmit: (values: FormValues) => Promise<void> }) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { insumo_id: item?.insumo_id ?? "", cantidad: item ? String(item.cantidad) : "", observaciones: item?.observaciones ?? "" },
  });
  return <form className="space-y-4" onSubmit={handleSubmit(async (values) => { try { await onSubmit(values); } catch { /* conserva el formulario ante error */ } })}>
    <div>
      <Label>Insumo *</Label>
      {item ? <p className="rounded border p-2">{item.insumo?.nombre ?? "Insumo no disponible"} · {item.insumo?.codigo_interno ?? "Sin código"}</p> : <Controller control={control} name="insumo_id" render={({ field }) => <Select value={field.value} onValueChange={field.onChange} disabled={pending}><SelectTrigger><SelectValue placeholder="Seleccionar insumo" /></SelectTrigger><SelectContent>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.nombre} · {candidate.codigo_interno ?? "Sin código"} · {candidate.unidad}</SelectItem>)}</SelectContent></Select>} />}
      {errors.insumo_id && <p className="text-sm text-destructive">{errors.insumo_id.message}</p>}
    </div>
    {item && <div><Label>Unidad histórica</Label><p className="rounded border p-2">{item.unidad}</p></div>}
    <div><Label>Cantidad *</Label><Input inputMode="decimal" {...register("cantidad")} disabled={pending} />{errors.cantidad && <p className="text-sm text-destructive">{errors.cantidad.message}</p>}</div>
    <div><Label>Observaciones</Label><Textarea {...register("observaciones")} disabled={pending} /></div>
    <Button type="submit" disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
  </form>;
}

export function ParteInsumos({ comercioId, ordenId, parteId, access, canEditParte, orden, parte }: { comercioId: string; ordenId: string; parteId: string; access: boolean; canEditParte: boolean; orden: CampoOrdenDetail; parte: CampoParte }) {
  const query = useCampoParteInsumos(comercioId, ordenId, parteId, access, orden, parte);
  const catalog = useCampoParteInsumoCandidates(comercioId, ordenId, parteId, access, orden, parte);
  const [editing, setEditing] = useState<CampoParteInsumo | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<CampoParteInsumo | null>(null);
  const used = useMemo(() => new Set((query.data ?? []).map((item) => item.insumo_id)), [query.data]);
  const candidates = useMemo(() => (catalog.data ?? []).filter((item) => !used.has(item.id)), [catalog.data, used]);
  const canWrite = access && canEditParte && parte.estado === "borrador" && !["finalizada", "cancelada"].includes(orden.estado);
  const create = useCreateCampoParteInsumo(comercioId, ordenId, parteId, access, canEditParte, orden, parte, candidates);
  const update = useUpdateCampoParteInsumo(comercioId, ordenId, parteId, access, canEditParte, orden, parte, editing);
  const setState = useSetCampoParteInsumoStatus(comercioId, ordenId, parteId, access, canEditParte, orden, parte, status);
  const formPending = create.isPending || update.isPending;
  useEffect(() => { setCreating(false); setEditing(null); setStatus(null); }, [comercioId, ordenId, parteId, access]);
  const submit = async (values: FormValues) => {
    const normalized: CampoParteInsumoValues = { insumo_id: editing?.insumo_id ?? values.insumo_id, cantidad: Number(values.cantidad.replace(",", ".")), observaciones: values.observaciones.trim() || null };
    if (editing) await update.mutateAsync({ ...normalized, id: editing.id });
    else await create.mutateAsync(normalized);
    setCreating(false);
    setEditing(null);
  };
  return <Card>
    <CardHeader className="flex-row items-center justify-between"><CardTitle>Insumos</CardTitle>{canWrite && <Button onClick={() => setCreating(true)} disabled={!candidates.length}>Agregar insumo</Button>}</CardHeader>
    <CardContent>
      {query.isLoading || catalog.isLoading ? <p>Cargando insumos...</p> : query.error || catalog.error ? <p className="text-destructive">No se pudieron cargar los insumos.</p> : !query.data?.length ? <p className="text-muted-foreground">Todavía no hay insumos en el parte.</p> : <><div className="grid gap-3 md:hidden">{query.data.map((item) => <Card key={item.id} className={!item.activo ? "opacity-70" : ""}><CardContent className="space-y-2 pt-4">
        <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{item.insumo?.nombre ?? "Insumo no disponible"}</p><p className="text-sm text-muted-foreground">{item.insumo?.codigo_interno ?? "Sin código"}</p></div><Badge variant={item.activo ? "default" : "secondary"}>{item.activo ? "Activo" : "Inactivo"}</Badge></div>
        <p><span className="text-muted-foreground">Cantidad:</span> {item.cantidad} {item.unidad}</p>
        <p><span className="text-muted-foreground">Observaciones:</span> {item.observaciones ?? "—"}</p>
        {item.insumo && !item.insumo.activo && <p className="text-sm text-amber-700">El insumo actual del catálogo está inactivo.</p>}
        {item.insumo && item.insumo.unidad !== item.unidad && <p className="text-sm text-amber-700">La unidad actual del catálogo difiere de la unidad histórica.</p>}
        {canWrite && <div className="flex items-center justify-end gap-3"><Button size="icon" variant="outline" onClick={() => setEditing(item)} aria-label={`Editar consumo de ${item.insumo?.nombre ?? "insumo"}`} title="Editar consumo"><Pencil className="h-4 w-4" /></Button><Switch checked={item.activo} onCheckedChange={() => setStatus(item)} disabled={setState.isPending} aria-label={`${item.activo ? "Desactivar" : "Reactivar"} consumo de ${item.insumo?.nombre ?? "insumo"}`} /></div>}
      </CardContent></Card>)}</div>
      <div className="hidden overflow-x-auto rounded-md border md:block"><Table>
        <TableHeader><TableRow><TableHead>Insumo</TableHead><TableHead>Código</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Unidad histórica</TableHead><TableHead>Observaciones</TableHead><TableHead>Estado</TableHead>{canWrite && <TableHead className="text-right">Acciones</TableHead>}</TableRow></TableHeader>
        <TableBody>{query.data.map((item) => <TableRow key={item.id} className={!item.activo ? "opacity-70" : undefined}>
          <TableCell className="font-medium">{item.insumo?.nombre ?? "Insumo no disponible"}{item.insumo && !item.insumo.activo && <p className="text-xs text-amber-700">Catálogo inactivo</p>}{item.insumo && item.insumo.unidad !== item.unidad && <p className="text-xs text-amber-700">La unidad actual difiere</p>}</TableCell><TableCell>{item.insumo?.codigo_interno ?? "Sin código"}</TableCell><TableCell className="text-right tabular-nums">{item.cantidad}</TableCell><TableCell>{item.unidad}</TableCell><TableCell className="max-w-xs whitespace-pre-wrap">{item.observaciones ?? "—"}</TableCell><TableCell><Badge variant={item.activo ? "default" : "secondary"}>{item.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
          {canWrite && <TableCell><div className="flex items-center justify-end gap-3"><Button size="icon" variant="outline" onClick={() => setEditing(item)} aria-label={`Editar consumo de ${item.insumo?.nombre ?? "insumo"}`} title="Editar consumo"><Pencil className="h-4 w-4" /></Button><Switch checked={item.activo} onCheckedChange={() => setStatus(item)} disabled={setState.isPending} aria-label={`${item.activo ? "Desactivar" : "Reactivar"} consumo de ${item.insumo?.nombre ?? "insumo"}`} /></div></TableCell>}
        </TableRow>)}</TableBody>
      </Table></div></>}
    </CardContent>
    <Dialog open={creating || Boolean(editing)} onOpenChange={(open) => { if (!open && !formPending) { setCreating(false); setEditing(null); } }}><DialogContent onEscapeKeyDown={(event) => { if (formPending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (formPending) event.preventDefault(); }}><DialogHeader><DialogTitle>{editing ? "Editar insumo del parte" : "Agregar insumo al parte"}</DialogTitle></DialogHeader><InsumoForm item={editing} candidates={candidates} pending={formPending} onSubmit={submit} /></DialogContent></Dialog>
    <AlertDialog open={Boolean(status)} onOpenChange={(open) => { if (!open && !setState.isPending) setStatus(null); }}><AlertDialogContent onEscapeKeyDown={(event) => { if (setState.isPending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (setState.isPending) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>{status?.activo ? "¿Desactivar este insumo del parte? Permanecerá guardado con su unidad histórica." : "¿Reactivar este insumo en el parte?"}</AlertDialogTitle><AlertDialogDescription>{status?.activo ? "El detalle seguirá disponible como parte del historial." : "El insumo debe continuar activo en el catálogo."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={setState.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={setState.isPending} onClick={(event) => { event.preventDefault(); if (!status || setState.isPending) return; void setState.mutateAsync({ id: status.id, insumoId: status.insumo_id, nuevoEstado: !status.activo }).then(() => setStatus(null)).catch(() => undefined); }}>{setState.isPending ? "Guardando..." : "Confirmar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Card>;
}
