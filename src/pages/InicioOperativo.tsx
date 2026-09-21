import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, Package, Receipt, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useComercio } from "@/hooks/useComercio";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { supabase } from "@/integrations/supabase/client";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

type SummaryCardProps = {
  title: string;
  value: string;
  detail: string;
  to: string;
  icon: typeof Banknote;
};

function SummaryCard({ title, value, detail, to, icon: Icon }: SummaryCardProps) {
  return <Link to={to} className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg">
    <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  </Link>;
}

export default function InicioOperativo() {
  const { comercio } = useComercio();
  const { data: parametrizacion } = useComercioParametrizacion();
  const cards = parametrizacion.inicio.tarjetas;
  const comercioId = comercio?.id;
  const fecha = today();

  const ventas = useQuery({
    queryKey: ["inicio-operativo", "ventas", comercioId, fecha],
    enabled: Boolean(comercioId && cards.ventas_hoy),
    queryFn: async () => {
      const { data, error } = await supabase.from("ventas").select("id,total").eq("fecha_venta", fecha);
      if (error) throw error;
      return data || [];
    },
  });
  const caja = useQuery({
    queryKey: ["inicio-operativo", "caja", comercioId, fecha],
    enabled: Boolean(comercioId && cards.caja_actual),
    queryFn: async () => {
      const { data, error } = await supabase.from("cajas_diarias").select("id,estado").eq("fecha", fecha).eq("estado", "abierta").limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });
  const stock = useQuery({
    queryKey: ["inicio-operativo", "stock", comercioId],
    enabled: Boolean(comercioId && cards.stock_critico),
    queryFn: async () => {
      const { count, error } = await supabase.from("productos").select("id", { count: "exact", head: true }).lte("stock", 0);
      if (error) throw error;
      return count || 0;
    },
  });
  const cuentaCorriente = useQuery({
    queryKey: ["inicio-operativo", "cuenta-corriente", comercioId],
    enabled: Boolean(comercioId && cards.cuenta_corriente),
    queryFn: async () => {
      const { data, error } = await supabase.from("cuenta_corriente").select("cliente_id,tipo_movimiento,monto");
      if (error) throw error;
      const balances = new Map<string, number>();
      (data || []).forEach((item) => balances.set(item.cliente_id, (balances.get(item.cliente_id) || 0) + (item.tipo_movimiento === "debito" ? Number(item.monto) : -Number(item.monto))));
      const pending = [...balances.values()].filter((balance) => balance > 0);
      return { clients: pending.length, total: pending.reduce((sum, balance) => sum + balance, 0) };
    },
  });
  const cheques = useQuery({
    queryKey: ["inicio-operativo", "cheques", comercioId, fecha],
    enabled: Boolean(comercioId && cards.cheques_proximos),
    queryFn: async () => {
      const nextWeek = new Date(`${fecha}T12:00:00`);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const { count, error } = await supabase.from("cheques").select("id", { count: "exact", head: true }).eq("estado", "en_cartera").gte("fecha_vencimiento", fecha).lte("fecha_vencimiento", nextWeek.toLocaleDateString("en-CA"));
      if (error) throw error;
      return count || 0;
    },
  });

  const ventasTotal = (ventas.data || []).reduce((sum, venta) => sum + Number(venta.total), 0);
  const loading = ventas.isLoading || caja.isLoading || stock.isLoading || cuentaCorriente.isLoading || cheques.isLoading;

  return <div className="container mx-auto space-y-6 p-4 sm:p-6">
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">Inicio operativo</h1>
      <p className="text-sm text-muted-foreground">{comercio?.nombre_comercio || "Comercio"} · Resumen de la jornada</p>
    </div>
    {loading && <p className="text-sm text-muted-foreground">Actualizando resumen…</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.ventas_hoy && <SummaryCard title="Ventas de hoy" value={money.format(ventasTotal)} detail={`${ventas.data?.length || 0} operación${(ventas.data?.length || 0) === 1 ? "" : "es"}`} to="/ventas" icon={ShoppingCart} />}
      {cards.caja_actual && <SummaryCard title="Caja actual" value={caja.data ? "Abierta" : "Sin apertura"} detail={caja.data ? "Hay una caja operativa para hoy." : "Abrí la caja para registrar la jornada."} to="/caja" icon={Banknote} />}
      {cards.stock_critico && <SummaryCard title="Stock crítico" value={`${stock.data || 0} productos`} detail="Sin existencias o con stock igual a cero." to="/productos" icon={Package} />}
      {cards.cuenta_corriente && <SummaryCard title="Cuenta corriente" value={money.format(cuentaCorriente.data?.total || 0)} detail={`${cuentaCorriente.data?.clients || 0} cliente${(cuentaCorriente.data?.clients || 0) === 1 ? "" : "s"} con saldo pendiente.`} to="/cuenta-corriente" icon={CreditCard} />}
      {cards.cheques_proximos && <SummaryCard title="Cheques próximos" value={`${cheques.data || 0} cheques`} detail="Vencen en los próximos 7 días." to="/cheques" icon={Receipt} />}
    </div>
  </div>;
}
