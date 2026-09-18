import { useState } from "react";
import { Pencil } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campoOtrosCostosEditable, useCampoParteOtrosCostos, useGuardarCampoParteOtroCosto, type CampoOtroCosto, type CampoOtrosCostosContext } from "@/hooks/useCampoParteOtrosCostos";
import { campoOtroCostoSchema, formatoCosto, type CampoOtroCostoValues } from "@/utils/campoCostos";

function OtroCostoForm({ item, pending, onSubmit }: { item: CampoOtroCosto | null; pending: boolean; onSubmit: (v: CampoOtroCostoValues) => Promise<void> }) {
  const { register, control, handleSubmit, formState: { errors } } = useForm<CampoOtroCostoValues>({
    resolver: zodResolver(campoOtroCostoSchema), defaultValues: {
      concepto: item?.concepto ?? "", cantidad: item ? String(item.cantidad) : "1",
      costo_unitario: item ? String(item.costo_unitario) : "", moneda: item?.moneda === "USD" ? "USD" : "ARS",
      observaciones: item?.observaciones ?? "", activo: item?.activo ?? true,
    },
  });
  return <form className="space-y-4" onSubmit={handleSubmit(async v => { try { await onSubmit(v); } catch { /* conserva valores */ } })}>
    <div><Label htmlFor="otro-concepto">Concepto *</Label><Input id="otro-concepto" {...register("concepto")} disabled={pending} />{errors.concepto && <p className="text-sm text-destructive">{errors.concepto.message}</p>}</div>
    <div className="grid gap-3 sm:grid-cols-2">{([['cantidad', 'Cantidad'], ['costo_unitario', 'Costo unitario']] as const).map(([name, label]) => <div key={name}><Label htmlFor={`otro-${name}`}>{label} *</Label><Input id={`otro-${name}`} inputMode="decimal" {...register(name)} disabled={pending} />{errors[name] && <p className="text-sm text-destructive">{errors[name]?.message}</p>}</div>)}</div>
    <div><Label htmlFor="otro-moneda">Moneda *</Label><Controller control={control} name="moneda" render={({ field }) => <Select value={field.value} onValueChange={field.onChange} disabled={pending}><SelectTrigger id="otro-moneda"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ARS">ARS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select>} />{errors.moneda && <p className="text-sm text-destructive">Seleccioná ARS o USD.</p>}</div>
    <div><Label htmlFor="otro-obs">Observaciones</Label><Textarea id="otro-obs" {...register("observaciones")} disabled={pending} /></div>
    <p className="text-sm text-muted-foreground">{item?.activo === false ? "Inactivo" : "Activo"}. Podés cambiar el estado desde el listado con confirmación.</p>
    <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button></div>
  </form>;
}

export function ParteOtrosCostos(props: CampoOtrosCostosContext) {
  const query = useCampoParteOtrosCostos(props), save = useGuardarCampoParteOtroCosto(props);
  const [editing, setEditing] = useState<CampoOtroCosto | null>(null), [creating, setCreating] = useState(false), [status, setStatus] = useState<CampoOtroCosto | null>(null);
  if (!props.isAdmin) return null;
  const canWrite = campoOtrosCostosEditable(props), pending = save.isPending;
  const close = () => { if (!pending) { setEditing(null); setCreating(false); } };
  const actions = (item: CampoOtroCosto) => <div className="flex items-center justify-center gap-3">
    <Button size="icon" variant="outline" disabled={pending} onClick={() => setEditing(item)} aria-label={`Editar ${item.concepto}`}><Pencil className="h-4 w-4" /></Button>
    <Switch checked={item.activo} disabled={pending} onCheckedChange={() => setStatus(item)} aria-label={`${item.activo ? "Desactivar" : "Activar"} ${item.concepto}`} />
  </div>;
  return <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><CardTitle>Otros costos</CardTitle>{canWrite && <Button disabled={pending} onClick={() => setCreating(true)}>Agregar costo</Button>}</CardHeader><CardContent className="space-y-3">
    {!canWrite && <p className="text-sm text-muted-foreground">Sólo se editan costos en borrador y con la orden abierta.</p>}
    {query.isPending ? <p>Cargando otros costos...</p> : query.isError ? <div><p className="text-destructive">No se pudieron cargar los otros costos.</p><Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div> : !query.data?.length ? <p>No hay otros costos cargados.</p> : <>
      <div className="grid gap-3 md:hidden">{query.data.map(item => <Card key={item.id}><CardContent className="space-y-2 pt-4"><p className="break-words font-medium">{item.concepto}</p><p>{item.activo ? "Activo" : "Inactivo"}</p><p>Cantidad: {item.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 4 })}</p><p>Costo unitario: {formatoCosto(item.costo_unitario, item.moneda)}</p><p className="whitespace-pre-wrap break-words">{item.observaciones || "Sin observaciones"}</p>{canWrite && actions(item)}</CardContent></Card>)}</div>
      <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Costo unitario</TableHead><TableHead>Observaciones</TableHead><TableHead>Estado</TableHead>{canWrite && <TableHead className="text-center">Acciones</TableHead>}</TableRow></TableHeader><TableBody>{query.data.map(item => <TableRow key={item.id}><TableCell className="max-w-xs break-words">{item.concepto}</TableCell><TableCell className="text-right tabular-nums">{item.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 4 })}</TableCell><TableCell className="text-right tabular-nums">{formatoCosto(item.costo_unitario, item.moneda)}</TableCell><TableCell className="max-w-xs whitespace-pre-wrap break-words">{item.observaciones || "—"}</TableCell><TableCell>{item.activo ? "Activo" : "Inactivo"}</TableCell>{canWrite && <TableCell>{actions(item)}</TableCell>}</TableRow>)}</TableBody></Table></div>
    </>}
  </CardContent>
    <Dialog open={canWrite && (creating || Boolean(editing))} onOpenChange={open => { if (!open) close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={e => { if (pending) e.preventDefault(); }} onInteractOutside={e => { if (pending) e.preventDefault(); }}><DialogHeader><DialogTitle>{editing ? "Editar otro costo" : "Agregar otro costo"}</DialogTitle></DialogHeader><OtroCostoForm item={editing} pending={pending} onSubmit={async values => { if (editing) await save.mutateAsync({ accion: "editar", id: editing.id, values }); else await save.mutateAsync({ accion: "crear", values }); setEditing(null); setCreating(false); }} /></DialogContent></Dialog>
    <AlertDialog open={canWrite && Boolean(status)} onOpenChange={open => { if (!open && !pending) setStatus(null); }}><AlertDialogContent onEscapeKeyDown={e => { if (pending) e.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>{status?.activo ? "¿Desactivar este costo?" : "¿Activar este costo?"}</AlertDialogTitle><AlertDialogDescription>El registro se conserva. Sólo los costos activos se incluyen en el resumen del parte.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={e => { e.preventDefault(); if (status && !pending) void save.mutateAsync({ accion: "estado", id: status.id, activo: !status.activo }).then(() => setStatus(null)).catch(() => undefined); }}>{pending ? "Guardando..." : "Confirmar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Card>;
}
