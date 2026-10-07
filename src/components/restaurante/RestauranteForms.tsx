import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClientes } from "@/hooks/useClientes";
import type { ContextoRestaurante, ModalidadRestaurante, PedidoRestaurante } from "@/types/restaurante";
import { restauranteMoney as money } from "@/utils/restaurante";
import { RestauranteBusqueda } from "./RestauranteBusqueda";

export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>; }
export function Modal({ title, children, close, amplio = false, description = "Completá los datos y confirmá la operación." }: { title: string; children: ReactNode; close: () => void; amplio?: boolean; description?: string }) {
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className={`max-h-[90dvh] overflow-y-auto ${amplio ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
const schema = z.object({ modalidad: z.enum(["delivery", "retiro", "mesa"]), cliente_id: z.string(), cliente_nombre: z.string().trim().max(200), direccion: z.string().trim().max(500), telefono: z.string().max(100), comensales: z.coerce.number().int().min(1).max(100), mesa_id: z.string(), costo_envio: z.coerce.number().min(0).multipleOf(0.01), prometido_at: z.string(), observaciones: z.string().max(1000), instrucciones_envio: z.string().max(1000), prioridad: z.boolean() }).superRefine((v, c) => {
  if (v.modalidad === "delivery" && !v.direccion) c.addIssue({ code: "custom", path: ["direccion"], message: "Indicá el domicilio." });
  if (v.modalidad === "mesa" && !v.mesa_id) c.addIssue({ code: "custom", path: ["mesa_id"], message: "Seleccioná una mesa." });
});
export function NuevoPedido({ data, operar, trabajando, close, abrir, mesaId }: ContextoRestaurante & { close: () => void; abrir: (id: string) => void; mesaId?: string }) {
  const { data: clientes = [] } = useClientes();
  const modalidades = data.config.modalidades.filter(m => data.admin || data.permisos.includes(m === "mesa" ? "salon" : "pedidos"));
  const { register, watch, setValue, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { modalidad: mesaId ? "mesa" : modalidades[0], cliente_id: "", cliente_nombre: "", direccion: "", telefono: "", comensales: 1, mesa_id: mesaId || "", costo_envio: 0, prometido_at: "", observaciones: "", instrucciones_envio: "", prioridad: false } });
  const modalidad = watch("modalidad");
  return <Modal title="1. Registrar pedido" close={close}><form className="grid gap-4" onSubmit={handleSubmit(async v => { const id = await operar("pedido", { ...v, costo_envio: v.modalidad === "delivery" ? v.costo_envio : 0, prometido_at: v.prometido_at ? new Date(v.prometido_at).toISOString() : null }); if (id) { close(); abrir(id); } })}>
    <RestauranteBusqueda label="Modalidad" value={modalidad} opciones={modalidades.map(m => ({ id: m, nombre: m === "mesa" ? "Salón / mesa" : m === "retiro" ? "Retiro" : "Delivery" }))} cambiar={id => setValue("modalidad", id as ModalidadRestaurante, { shouldValidate: true, shouldDirty: true })} disabled={trabajando} />
    <RestauranteBusqueda label="Cliente de Vortex (opcional)" value={watch("cliente_id")} opciones={[{ id: "", nombre: "Consumidor final / nombre libre" }, ...clientes.filter(c => c.id).map(c => ({ id: c.id!, nombre: `${c.apellido} ${c.nombre}`, detalle: [c.cuit, c.telefono, c.localidad].filter(Boolean).join(" · ") }))]} cambiar={id => { setValue("cliente_id", id, { shouldDirty: true }); const c = clientes.find(c => c.id === id); if (c) { setValue("cliente_nombre", `${c.nombre} ${c.apellido}`); setValue("direccion", `${c.calle} ${c.numero}, ${c.localidad}`); setValue("telefono", c.telefono || ""); } }} disabled={trabajando} />
    <Field label="Nombre"><Input {...register("cliente_nombre")} /></Field>
    <Field label="Teléfono"><Input type="tel" {...register("telefono")} /></Field>
    {modalidad === "mesa" && <><RestauranteBusqueda label="Mesa libre" value={watch("mesa_id")} opciones={data.mesas.filter(m => m.activo && !data.cuenta_mesas.some(c => c.mesa_id === m.id && c.activa)).map(m => ({ id: m.id, nombre: m.nombre, detalle: `${m.capacidad} personas` }))} cambiar={id => setValue("mesa_id", id, { shouldValidate: true, shouldDirty: true })} disabled={trabajando} /><Field label="Comensales"><Input type="number" {...register("comensales")} /></Field></>}
    {modalidad === "delivery" && <><Field label="Domicilio de entrega"><Input {...register("direccion")} /></Field><Field label="Costo de envío"><Input type="number" step="0.01" {...register("costo_envio")} /></Field><Field label="Indicaciones para el reparto"><Input {...register("instrucciones_envio")} /></Field></>}
    <Field label="Horario prometido (opcional)"><Input type="datetime-local" {...register("prometido_at")} /></Field><Field label="Observaciones para cocina"><Input {...register("observaciones")} /></Field>
    <label className="flex items-center gap-2"><input type="checkbox" {...register("prioridad")} /> Prioridad</label>
    {Object.entries(errors).map(([key, e]) => <p key={key} role="alert" className="text-sm text-destructive">{e.message}</p>)}
    <Button disabled={trabajando || !modalidades.length}>Crear y agregar productos</Button>
  </form></Modal>;
}
export function AgregarProducto({ data, operar, trabajando, pedido, close }: ContextoRestaurante & { pedido: PedidoRestaurante; close: () => void }) {
  const [cartaId, setCarta] = useState(""); const [cantidad, setCantidad] = useState(1); const [obs, setObs] = useState(""); const [extras, setExtras] = useState<string[]>([]);
  const carta = data.carta.find(c => c.id === cartaId);
  const precio = Number(carta?.precio || 0) + data.adicionales.filter(a => extras.includes(a.id)).reduce((s, a) => s + Number(a.precio), 0);
  return <Modal title={`Agregar a pedido #${pedido.numero}`} close={close}><form className="grid gap-4" onSubmit={async e => { e.preventDefault(); if (await operar("agregar", { pedido_id: pedido.id, version: pedido.version, items: [{ carta_id: cartaId, cantidad, observaciones: obs, adicionales: extras }] })) close(); }}>
    <RestauranteBusqueda label="Producto de la carta" value={cartaId} opciones={data.carta.filter(c => c.activo && data.sectores.some(s => s.id === c.sector_id && s.activo)).map(c => ({ id: c.id, nombre: c.descripcion, detalle: `${money(c.precio)} · ${data.sectores.find(s => s.id === c.sector_id)?.nombre || ""}` }))} cambiar={setCarta} disabled={trabajando} />
    <Field label="Cantidad"><Input required type="number" min={1} max={1000} step={1} value={cantidad} onChange={e => setCantidad(Number(e.target.value))} /></Field>
    <fieldset className="grid gap-2"><legend className="text-sm font-medium">Adicionales por unidad</legend>{data.adicionales.filter(a => a.activo).map(a => <label key={a.id} className="flex gap-2"><input type="checkbox" checked={extras.includes(a.id)} onChange={e => setExtras(e.target.checked ? [...extras, a.id] : extras.filter(x => x !== a.id))} />{a.nombre} · {money(a.precio)}</label>)}</fieldset>
    <Field label="Observaciones del producto"><Input value={obs} maxLength={1000} onChange={e => setObs(e.target.value)} placeholder="Sin sal, alergias, punto de cocción…" /></Field>
    <p>Total: {money(precio * cantidad)}. Se enviará a cocina al confirmar la nueva ronda.</p><Button disabled={trabajando || !cartaId}>Agregar producto</Button>
  </form></Modal>;
}
