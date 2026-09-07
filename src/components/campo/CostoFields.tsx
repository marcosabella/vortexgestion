import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampoCostoFormValues } from "@/utils/campoCostos";

export function CostoFields({ costo, moneda, onCosto, onMoneda, disabled, label, error }: {
  costo: string; moneda: CampoCostoFormValues["moneda_costo"]; onCosto: (v: string) => void;
  onMoneda: (v: CampoCostoFormValues["moneda_costo"]) => void; disabled: boolean; label: string; error?: string;
}) {
  return <fieldset className="space-y-2 rounded-md border p-3" disabled={disabled}>
    <legend className="px-1 text-sm font-medium">Costo interno</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor="catalogo-costo">{label}</Label><Input id="catalogo-costo" inputMode="decimal" value={costo} onChange={e => onCosto(e.target.value)} disabled={disabled} /></div>
      <div><Label htmlFor="catalogo-moneda">Moneda</Label><Select value={moneda} onValueChange={v => { if (v === "ARS" || v === "USD") onMoneda(v); }} disabled={disabled}><SelectTrigger id="catalogo-moneda"><SelectValue placeholder="Seleccionar" /></SelectTrigger><SelectContent><SelectItem value="ARS">ARS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-sm text-muted-foreground">Ambos vacíos indican costo desconocido. Cero es un costo válido. Los cambios no alteran costos históricos de partes existentes.</p>
    <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { onCosto(""); onMoneda(""); }}>Dejar costo desconocido</Button>
  </fieldset>;
}
