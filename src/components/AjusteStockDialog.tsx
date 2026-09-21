import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function AjusteStockDialog({ productoId, descripcion }: { productoId: string; descripcion: string }) {
  const [open, setOpen] = useState(false), [cantidad, setCantidad] = useState(""), [motivo, setMotivo] = useState("correccion"), [observaciones, setObservaciones] = useState("");
  const client = useQueryClient(); const { toast } = useToast();
  const save = async () => { const value = Number(cantidad); if (!Number.isInteger(value) || !value) return; const { error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: Error | null }> }).rpc("registrar_ajuste_stock", { p_producto_id: productoId, p_cantidad: value, p_motivo: motivo, p_observaciones: observaciones }); if (error) { toast({ title: "No se pudo ajustar el stock", description: error.message, variant: "destructive" }); return; } client.invalidateQueries({ queryKey: ["productos"] }); setOpen(false); setCantidad(""); setObservaciones(""); toast({ title: "Stock ajustado", description: "El movimiento quedó registrado." }); };
  return <Dialog open={open} onOpenChange={setOpen}><Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><SlidersHorizontal className="h-4 w-4" />Ajustar stock</Button><DialogContent><DialogHeader><DialogTitle>Ajustar stock</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{descripcion}</p><Label>Cantidad (+ suma / − resta)</Label><Input type="number" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /><Label>Motivo</Label><Select value={motivo} onValueChange={setMotivo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["inventario","merma","rotura","devolucion","correccion","otro"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select><Label>Observaciones</Label><Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /><DialogFooter><Button onClick={save}>Guardar ajuste</Button></DialogFooter></DialogContent></Dialog>;
}
