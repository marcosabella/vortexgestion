import { useId, useState } from "react";
import { Search, Check } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { RestauranteGrilla, RestauranteAccion } from "./RestauranteGrilla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type OpcionRestaurante = { id: string; nombre: string; detalle?: string; buscar?: string };
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

export function RestauranteBusqueda({ label, value, opciones, cambiar, placeholder = "Sin seleccionar", disabled = false, name, className = "" }: {
  label: string; value: string; opciones: OpcionRestaurante[]; cambiar: (id: string) => void;
  placeholder?: string; disabled?: boolean; name?: string; className?: string;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [buscar, setBuscar] = useState("");
  const seleccionada = opciones.find(o => o.id === value);
  const palabras = normalizar(buscar).trim().split(/\s+/).filter(Boolean);
  const resultados = opciones.filter(o => palabras.every(palabra => normalizar(`${o.nombre} ${o.detalle || ""} ${o.buscar || ""}`).includes(palabra)));
  return <div className={`grid gap-2 ${className}`}>
    <span id={labelId} className="text-sm font-medium">{label}</span>
    {name && <input type="hidden" name={name} value={value} />}
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
      <div className="min-w-0 flex-1"><p className="break-words text-sm">{seleccionada?.nombre || (value ? "Selección no disponible" : placeholder)}</p>{seleccionada?.detalle && <p className="text-xs text-muted-foreground">{seleccionada.detalle}</p>}</div>
      <Button type="button" variant="outline" disabled={disabled} aria-labelledby={labelId} aria-haspopup="dialog" onClick={() => { setBuscar(""); setOpen(true); }}><Search className="mr-2 h-4 w-4" />{value ? "Cambiar" : "Buscar"}</Button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader><DialogTitle>Buscar: {label}</DialogTitle><DialogDescription>Buscá y presioná el registro que querés seleccionar.</DialogDescription></DialogHeader>
        <Input autoFocus aria-label={`Buscar ${label}`} placeholder="Escribí nombre, código u otro dato…" value={buscar} onChange={e => setBuscar(e.target.value)} />
        <div className="min-h-0 overflow-y-auto" role="group" aria-label="Resultados de búsqueda">
          <RestauranteGrilla label={`Resultados: ${label}`} columnas={[{ titulo: "Registro" }, { titulo: "Detalle" }, { titulo: "Acciones", derecha: true }]} vacia={!resultados.length ? "No se encontraron registros." : undefined}>
            {resultados.slice(0, 100).map(o => <TableRow key={o.id}><TableCell className="font-medium">{o.nombre}</TableCell><TableCell className="text-muted-foreground">{o.detalle || ""}</TableCell><TableCell><div className="flex justify-end"><RestauranteAccion icon={Check} disabled={disabled} aria-label={`Seleccionar ${o.nombre}`} onClick={() => { cambiar(o.id); setOpen(false); }}>Seleccionar</RestauranteAccion></div></TableCell></TableRow>)}
          </RestauranteGrilla>
        </div>
        <p className="text-xs text-muted-foreground">{resultados.length > 100 ? `Se muestran 100 de ${resultados.length} resultados. Afiná la búsqueda para encontrar el registro.` : `${resultados.length} resultados`}</p>
      </DialogContent>
    </Dialog>
  </div>;
}
