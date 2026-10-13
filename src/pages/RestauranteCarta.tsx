import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useRestauranteConsulta } from "@/hooks/useRestauranteConsulta";
import { consultaTokenValido } from "@/utils/restauranteQr";
import { restauranteMoney as money } from "@/utils/restaurante";
import { Button } from "@/components/ui/button";

export default function RestauranteCarta() {
  const { qr = "" } = useParams();
  return <CartaMesa key={qr} qr={qr} />;
}
function CartaMesa({ qr }: { qr: string }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  const consulta = useRestauranteConsulta(qr, null, consultaTokenValido(qr) && online && visible);
  useEffect(() => {
    const limpiarAcceso = () => {
      try { sessionStorage.removeItem(`mesa-consulta:${qr}`); } catch { /* La carta no necesita almacenamiento local. */ }
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    limpiarAcceso();
    window.addEventListener("hashchange", limpiarAcceso);
    return () => window.removeEventListener("hashchange", limpiarAcceso);
  }, [qr]);
  useEffect(() => {
    const conexion = () => setOnline(navigator.onLine);
    const visibilidad = () => setVisible(document.visibilityState === "visible");
    window.addEventListener("online", conexion); window.addEventListener("offline", conexion);
    document.addEventListener("visibilitychange", visibilidad);
    return () => { window.removeEventListener("online", conexion); window.removeEventListener("offline", conexion); document.removeEventListener("visibilitychange", visibilidad); };
  }, []);
  const data = consulta.data;
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 bg-background px-4 py-6 sm:px-6">
    <header className="space-y-2 border-b pb-5"><p className="text-sm font-medium text-muted-foreground">Nuestra carta</p><h1 className="break-words text-2xl font-bold">{data?.comercio || "Bienvenidos"}</h1>{data && <p className="text-lg font-semibold">{data.mesa}</p>}<p className="text-sm text-muted-foreground">Consultá el menú y los precios. Para realizar un pedido, hablá con el mozo.</p></header>
    {!consultaTokenValido(qr) ? <p role="alert">El QR no es válido.</p> : !online ? <p role="status">Sin conexión. Reconectate para consultar información actualizada.</p> : consulta.isError ? <div className="space-y-3"><p role="alert">No se pudo cargar la carta. El QR puede no estar disponible.</p><Button variant="outline" onClick={() => void consulta.refetch()}>Volver a consultar</Button></div> : consulta.isPending ? <p role="status">Cargando carta…</p> : data && <>
      <section className="space-y-4" aria-label="Carta"><h2 className="text-xl font-semibold">Nuestra carta</h2>{!data.carta.length && <p className="text-muted-foreground">No hay productos disponibles en la carta.</p>}{[...new Set(data.carta.map(item => item.sector))].map(sector => <div key={sector} className="rounded-xl border p-4"><h3 className="mb-2 text-lg font-semibold">{sector}</h3><ul className="divide-y">{data.carta.filter(item => item.sector === sector).map(item => <li key={item.id} className="flex justify-between gap-4 py-3"><span className="min-w-0 break-words">{item.descripcion}</span><strong className="shrink-0">{money(item.precio)}</strong></li>)}</ul></div>)}</section>
    </>}
  </main>;
}
