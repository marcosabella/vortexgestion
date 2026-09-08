import { useRef, useState } from "react";
import { ExternalLink, ReceiptText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { campoFacturacionErrorMessage, useCampoOrdenComprobantes, useFacturarCampoOrden } from "@/hooks/useCampoOrdenFacturacion";
import { useAfipConfig } from "@/hooks/useAfipConfig";

const tipos = ["factura_a", "factura_b", "factura_c", "recibo_a", "recibo_b", "recibo_c", "ticket_fiscal", "recibo_x"];
const money = (value: number, moneda: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda }).format(value || 0);

export function OrdenFacturacion({ comercioId, ordenId, finalizada }: { comercioId: string; ordenId: string; finalizada: boolean }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const query = useCampoOrdenComprobantes(comercioId, ordenId, true);
  const afipConfig = useAfipConfig();
  const mutation = useFacturarCampoOrden(comercioId, ordenId, true, finalizada);
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const [tipo, setTipo] = useState("factura_c");
  const [modalidad, setModalidad] = useState<"transferencia" | "cta_cte">("transferencia");
  const key = useRef<string | null>(null);
  const puntoVenta = afipConfig.data?.punto_venta;
  const configuracionPuntoVentaValida =
    typeof puntoVenta === "number" && Number.isInteger(puntoVenta) && puntoVenta > 0;
  const punto = configuracionPuntoVentaValida ? String(puntoVenta).padStart(4, "0") : "No disponible";
  const bloqueada = query.data?.some((item) => item.moneda === moneda) ?? false;

  const change = (fn: () => void) => {
    if (!mutation.isPending) {
      key.current = null;
      fn();
    }
  };

  const submit = async () => {
    if (mutation.isPending || bloqueada || !finalizada) return;
    if (!configuracionPuntoVentaValida) {
      toast({
        title: "Configuración requerida",
        description: "Configurá un punto de venta activo y válido antes de facturar.",
        variant: "destructive",
      });
      return;
    }

    if (!key.current) key.current = crypto.randomUUID();
    try {
      await mutation.mutateAsync({ moneda, tipo, puntoVenta, modalidad, idempotencyKey: key.current });
      key.current = null;
      toast({ title: "Comprobante Campo generado", description: "La facturación " + moneda + " fue registrada." });
    } catch (error) {
      toast({ title: "No se pudo facturar", description: campoFacturacionErrorMessage(error), variant: "destructive" });
    }
  };

  if (query.isLoading) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">Cargando comprobantes...</CardContent></Card>;
  }
  if (query.error) {
    return <Card><CardContent className="py-10 text-center text-destructive">No se pudieron cargar los comprobantes.</CardContent></Card>;
  }
  if (afipConfig.isLoading) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">Cargando configuración comercial...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" />Facturación</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">ARS y USD se facturan por separado; no se suman ni convierten. CAE/ARCA se gestiona posteriormente.</p>
          {!finalizada && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">La orden debe estar finalizada para habilitar la facturación.</p>}
          {!configuracionPuntoVentaValida && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Configurá un punto de venta activo y válido para facturar.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label>Moneda</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={moneda} disabled={mutation.isPending} onChange={(e) => change(() => setMoneda(e.target.value as "ARS" | "USD"))}><option>ARS</option><option>USD</option></select></div>
            <div><Label>Tipo de comprobante</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={tipo} disabled={mutation.isPending} onChange={(e) => change(() => setTipo(e.target.value))}>{tipos.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
            <div><Label>Punto de venta</Label><div className="mt-1 flex h-10 items-center rounded-md border bg-muted px-3 text-sm" aria-label="Punto de venta configurado">{punto}</div></div>
            <div><Label>Modalidad</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={modalidad} disabled={mutation.isPending} onChange={(e) => change(() => setModalidad(e.target.value as "transferencia" | "cta_cte"))}><option value="transferencia">Transferencia bancaria</option><option value="cta_cte">Cuenta corriente</option></select></div>
          </div>
          <p className="text-sm text-muted-foreground">{modalidad === "transferencia" ? "La transferencia registra el pago, pero no un movimiento de Caja." : "Cuenta corriente registra deuda pendiente."}</p>
          {bloqueada && <p className="text-sm text-destructive">Esta moneda ya tiene un comprobante vinculado.</p>}
          <Button onClick={() => void submit()} disabled={!finalizada || bloqueada || !configuracionPuntoVentaValida || mutation.isPending}>{mutation.isPending ? "Facturando..." : "Facturar " + moneda}</Button>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:hidden">
        {query.data?.map((item) => <Card key={item.id}><CardContent className="space-y-1 pt-4"><strong>{item.venta?.numero_comprobante ?? "Comprobante"}</strong><p>{item.moneda} · {money(item.venta?.total ?? 0, item.moneda)}</p><p className="text-sm text-muted-foreground">{item.venta?.tipo_comprobante} · {item.venta?.tipo_pago}</p>{item.venta && <Button size="sm" variant="outline" title="Abrir venta" aria-label="Abrir detalle de la venta" onClick={() => navigate("/ventas/" + item.venta!.id)}><ExternalLink className="h-4 w-4" /></Button>}</CardContent></Card>)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table><TableHeader><TableRow><TableHead>Comprobante</TableHead><TableHead>Moneda</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Modalidad</TableHead><TableHead>Total</TableHead><TableHead>Fiscal</TableHead><TableHead /></TableRow></TableHeader><TableBody>
          {query.data?.length ? query.data.map((item) => <TableRow key={item.id}><TableCell>{item.venta?.numero_comprobante ?? "-"}</TableCell><TableCell>{item.moneda}</TableCell><TableCell>{item.venta?.tipo_comprobante ?? "-"}</TableCell><TableCell>{item.venta?.fecha_venta ? new Date(item.venta.fecha_venta).toLocaleDateString("es-AR") : "-"}</TableCell><TableCell>{item.venta?.tipo_pago ?? "-"}</TableCell><TableCell>{money(item.venta?.total ?? 0, item.moneda)}</TableCell><TableCell>{item.venta?.cae ?? "Sin CAE"}</TableCell><TableCell>{item.venta && <Button size="icon" variant="ghost" title="Abrir venta" aria-label="Abrir detalle de la venta" onClick={() => navigate("/ventas/" + item.venta!.id)}><ExternalLink className="h-4 w-4" /></Button>}</TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No hay comprobantes Campo.</TableCell></TableRow>}
        </TableBody></Table>
      </div>
    </div>
  );
}
