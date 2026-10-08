import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRestauranteReservas } from "@/hooks/useRestauranteReservas";
import type { ContextoRestaurante, AccionRestaurante } from "@/types/restaurante";
import type { ReservaRestaurante } from "@/types/restauranteReservas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { RestauranteGrilla } from "./RestauranteGrilla";
import { RestauranteBusqueda } from "./RestauranteBusqueda";
import { Field, Modal } from "./RestauranteForms";

const local = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const schema = z.object({ mesa_id: z.string().min(1, "Seleccioná una mesa"), nombre: z.string().trim().min(1, "Ingresá un nombre").max(200), telefono: z.string().max(100), comensales: z.coerce.number().int().min(1).max(100), inicio: z.string().min(1), fin: z.string().min(1), observaciones: z.string().max(1000) }).refine(v => new Date(v.fin) > new Date(v.inicio), { path: ["fin"], message: "La finalización debe ser posterior al inicio" });
type Values = z.infer<typeof schema>;
function ReservaForm({ data, operar, trabajando, errorOperacion, reserva, fecha, close }: ContextoRestaurante & { reserva?: ReservaRestaurante; fecha: string; close: () => void }) {
  const comienzo = new Date(`${fecha}T20:00:00`); const fin = new Date(comienzo.getTime() + 2 * 3600000);
  const [rechazado, setRechazado] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: reserva ? { ...reserva, inicio: local(new Date(reserva.inicio)), fin: local(new Date(reserva.fin)) } : { mesa_id: "", nombre: "", telefono: "", comensales: 2, inicio: local(comienzo), fin: local(fin), observaciones: "" } });
  return <Modal title={reserva ? "Editar reserva" : "Nueva reserva"} close={close}><form noValidate className="grid gap-4" onSubmit={form.handleSubmit(async values => {
    const result = await operar("reserva_guardar", { ...values, ...(reserva ? { id: reserva.id, version: reserva.version, cliente_id: reserva.cliente_id } : {}), inicio: new Date(values.inicio).toISOString(), fin: new Date(values.fin).toISOString() });
    if (result) close(); else setRechazado(true);
  })}>
    <RestauranteBusqueda label="Mesa" value={form.watch("mesa_id")} opciones={data.mesas.filter(m => m.activo).map(m => ({ id: m.id, nombre: m.nombre, detalle: `${m.capacidad} lugares` }))} cambiar={id => form.setValue("mesa_id", id, { shouldValidate: true })} disabled={trabajando} />
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre"><Input {...form.register("nombre")} /></Field><Field label="Teléfono"><Input type="tel" {...form.register("telefono")} /></Field><Field label="Comensales"><Input type="number" min={1} max={100} {...form.register("comensales")} /></Field><Field label="Inicio"><Input type="datetime-local" {...form.register("inicio")} /></Field><Field label="Finalización prevista"><Input type="datetime-local" {...form.register("fin")} /></Field></div>
    <Field label="Observaciones"><Input {...form.register("observaciones")} /></Field>
    {Object.entries(form.formState.errors).map(([key, error]) => <p key={key} role="alert" className="text-destructive">{error.message}</p>)}
    {rechazado && <p role="alert" className="text-destructive">{errorOperacion || "No se pudo guardar la reserva."}</p>}
    <Button disabled={trabajando || form.formState.isSubmitting}>Guardar reserva</Button>
  </form></Modal>;
}
export function RestauranteReservas(ctx: ContextoRestaurante & { abrir: (id: string) => void }) {
  const [fecha, setFecha] = useState(local(new Date()).slice(0, 10)); const [historial, setHistorial] = useState(false);
  const [editando, setEditando] = useState<ReservaRestaurante | "nueva" | null>(null);
  const [finalizar, setFinalizar] = useState<{ reserva: ReservaRestaurante; accion: AccionRestaurante } | null>(null); const [motivo, setMotivo] = useState("");
  const query = useRestauranteReservas(fecha);
  const reservas = (query.data || []).filter(r => historial || r.estado === "confirmada");
  return <section className="grid gap-4">
    <div className="flex flex-wrap items-end gap-3"><Field label="Fecha"><Input type="date" required value={fecha} onChange={e => { if (e.target.value) setFecha(e.target.value); }} /></Field><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={historial} onChange={e => setHistorial(e.target.checked)} />Incluir finalizadas</label><Button onClick={() => setEditando("nueva")}>Nueva reserva</Button></div>
    <p className="text-sm text-muted-foreground">La reserva aparta un horario. Recibir cliente abre la cuenta si la mesa está libre; una mesa puede estar ocupada ahora y tener una reserva futura.</p>
    {ctx.errorOperacion && <p role="alert" className="text-destructive">{ctx.errorOperacion}</p>}
    {query.error && <p role="alert" className="text-destructive">No se pudo actualizar la agenda: {query.error.message} <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></p>}
    {query.isPending ? <p>Cargando reservas…</p> : <RestauranteGrilla label="Reservas de mesas" columnas={[{ titulo: "Horario" }, { titulo: "Mesa" }, { titulo: "Cliente / contacto" }, { titulo: "Comensales" }, { titulo: "Estado / observaciones" }, { titulo: "Acciones" }]} vacia={!reservas.length ? "No hay reservas para esta fecha." : undefined}>{reservas.map(r => <TableRow key={r.id}>
      <TableCell>{new Date(r.inicio).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} – {new Date(r.fin).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</TableCell><TableCell>{ctx.data.mesas.find(m => m.id === r.mesa_id)?.nombre}</TableCell><TableCell>{r.nombre}<p>{r.telefono}</p></TableCell><TableCell>{r.comensales}</TableCell><TableCell>{r.estado}<p className="text-sm">{r.observaciones || r.motivo}</p></TableCell><TableCell><div className="flex flex-wrap gap-2">
        {r.estado === "confirmada" && <><Button disabled={ctx.trabajando} onClick={async () => { const id = await ctx.operar("reserva_recibir", { id: r.id, version: r.version }); if (id) ctx.abrir(id); }}>Recibir cliente</Button><Button variant="outline" disabled={ctx.trabajando} onClick={() => setEditando(r)}>Editar</Button><Button variant="outline" disabled={ctx.trabajando} onClick={() => { setMotivo(""); setFinalizar({ reserva: r, accion: "reserva_cancelar" }); }}>Cancelar</Button>{Date.parse(r.inicio) <= Date.now() && <Button variant="outline" disabled={ctx.trabajando} onClick={() => { setMotivo(""); setFinalizar({ reserva: r, accion: "reserva_ausente" }); }}>No asistió</Button>}</>}
        {r.pedido_id && <Button variant="outline" onClick={() => ctx.abrir(r.pedido_id!)}>Ver cuenta</Button>}
      </div></TableCell></TableRow>)}</RestauranteGrilla>}
    {editando && <ReservaForm {...ctx} fecha={fecha} reserva={editando === "nueva" ? undefined : editando} close={() => setEditando(null)} />}
    {finalizar && <Modal title={finalizar.accion === "reserva_cancelar" ? "Cancelar reserva" : "Registrar ausencia"} close={() => setFinalizar(null)}><form className="grid gap-4" onSubmit={async e => { e.preventDefault(); if (await ctx.operar(finalizar.accion, { id: finalizar.reserva.id, version: finalizar.reserva.version, motivo })) setFinalizar(null); }}><Field label="Motivo"><Input required maxLength={1000} value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>{ctx.errorOperacion && <p role="alert" className="text-destructive">{ctx.errorOperacion}</p>}<Button disabled={ctx.trabajando || !motivo.trim()}>Confirmar</Button></form></Modal>}
  </section>;
}
