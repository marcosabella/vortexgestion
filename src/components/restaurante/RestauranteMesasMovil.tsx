import { ArrowRight, Plus, UtensilsCrossed } from "lucide-react";
import type { PedidoRestaurante, ResumenRestaurante } from "@/types/restaurante";
import { restauranteMoney as money } from "@/utils/restaurante";

export function RestauranteMesasMovil({ mesas, abrir, ocupar }: {
  mesas: (ResumenRestaurante["mesas"][number] & { pedido?: PedidoRestaurante })[];
  abrir: (id: string) => void; ocupar: (id: string) => void;
}) {
  return <section aria-label="Mesas del salón" className="grid min-w-0 gap-3">
    {mesas.length ? <div className="grid grid-cols-2 gap-3">
      {mesas.map(m => <button key={m.id} type="button" data-mesa-id={m.id} data-estado={m.pedido ? "ocupada" : "libre"} aria-label={m.pedido ? `Ver pedido de ${m.nombre}, ocupada, pedido ${m.pedido.numero}, ${m.pedido.cliente_nombre}` : `Ocupar ${m.nombre}, libre, ${m.capacidad} lugares`} onClick={() => m.pedido ? abrir(m.pedido.id) : ocupar(m.id)} className={`flex aspect-square min-w-0 flex-col justify-between gap-1 rounded-xl border-2 p-2.5 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] ${m.pedido ? "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100" : "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100"}`}>
        <span className="flex items-center justify-between gap-1"><UtensilsCrossed aria-hidden className="h-5 w-5 shrink-0" /><span className="text-xs font-semibold">{m.pedido ? "Ocupada" : "Libre"}</span></span>
        <span className="grid min-w-0 gap-0.5"><span className="truncate text-lg font-bold" title={m.nombre}>{m.nombre}</span>{m.pedido ? <><span className="truncate text-xs">#{m.pedido.numero} · {m.pedido.cliente_nombre}</span><span className="text-xs font-medium">{m.pedido.cuenta === "solicitada" ? "Cuenta solicitada" : money(m.pedido.total)}</span></> : <span className="text-sm">{m.capacidad} lugares</span>}</span>
        <span className="flex items-center gap-1 text-sm font-semibold">{m.pedido ? <ArrowRight aria-hidden className="h-4 w-4 shrink-0" /> : <Plus aria-hidden className="h-4 w-4 shrink-0" />}{m.pedido ? "Ver pedido" : "Ocupar mesa"}</span>
      </button>)}
    </div> : <p className="rounded-lg border p-4 text-sm text-muted-foreground">No hay mesas para mostrar.</p>}
  </section>;
}
