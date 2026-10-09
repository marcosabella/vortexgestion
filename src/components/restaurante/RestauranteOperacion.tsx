import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Modal } from "./RestauranteForms";
import type { AccionRestaurante, ContextoRestaurante, PedidoRestaurante } from "@/types/restaurante";
import { restauranteMoney as money, restauranteSaldo, restauranteAbierto, restauranteCobrosRendibles, restauranteResponsableCobro, restaurantePuedeCobrar } from "@/utils/restaurante";
import { useObtenerCAE } from "@/hooks/useVentas";
import { RestauranteVenta } from "./RestauranteVenta";
import { useClientes } from "@/hooks/useClientes";
import { RestauranteBusqueda } from "./RestauranteBusqueda";

function ClienteCierre({ value, cambiar }: { value: string; cambiar: (value: string) => void }) {
  const { data: clientes = [] } = useClientes();
  return <RestauranteBusqueda label="Cliente para el comprobante / cuenta corriente" value={value} opciones={[{ id: "", nombre: "Consumidor final", detalle: "Requiere saldo pagado" }, ...clientes.filter(c => c.id).map(c => ({ id: c.id!, nombre: `${c.apellido} ${c.nombre}`, detalle: [c.cuit, c.telefono, c.localidad].filter(Boolean).join(" · ") }))]} cambiar={cambiar} />;
}

export type OperacionElegida = { accion: AccionRestaurante; pedido?: PedidoRestaurante; item_id?: string; cobro_id?: string };
export function RestauranteOperacion({ data, operar, trabajando, elegida, close }: ContextoRestaurante & { elegida: OperacionElegida; close: () => void }) {
  const { accion, pedido: snapshot } = elegida;
  const p = data.pedidos.find(p => p.id === snapshot?.id) || snapshot;
  const [monto, setMonto] = useState(p ? restauranteSaldo(data, p).saldo : 0);
  const [medio, setMedio] = useState("contado"); const [motivo, setMotivo] = useState(""); const [pagador, setPagador] = useState("");
  const [seleccion, setSeleccion] = useState(""); const [porItem, setPorItem] = useState(false); const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [confirmado, setConfirmado] = useState(false); const [tipo, setTipo] = useState("recibo_x"); const [venta, setVenta] = useState<string | null>(null);
  const [cliente, setCliente] = useState(p?.cliente_id || "");
  const [recibidoPor, setRecibidoPor] = useState(p?.modalidad === "mesa" && data.usuarios.some(u => u.id === p.creado_por) ? p.creado_por : data.usuario_id);
  const [verVenta, setVerVenta] = useState(false);
  const [cobroIds, setCobroIds] = useState<string[]>([]);
  const cae = useObtenerCAE();
  const items = data.items.filter(i => i.pedido_id === p?.id && !["borrador", "cancelada"].includes(i.estado));
  const restantes = (id: string, cantidad: number) => cantidad - data.cobro_items.filter(ci => ci.item_id === id && data.cobros.some(c => c.id === ci.cobro_id && !c.anulado)).reduce((s, ci) => s + ci.cantidad, 0);
  const importeItems = items.reduce((s, i) => s + Math.round((cantidades[i.id] || 0) * Number(i.precio) * 100) / 100, 0);
  const pendientesRendicion = restauranteCobrosRendibles(data);
  const rendibles = pendientesRendicion.filter(c => restauranteResponsableCobro(c) === seleccion);
  const idsRendicion = rendibles.filter(c => cobroIds.includes(c.id)).map(c => c.id);
  const esperado = rendibles.filter(c => cobroIds.includes(c.id)).reduce((s, c) => s + Number(c.monto), 0);
  const conMotivo = ["cancelar", "cancelar_item", "anular_cobro", "incidencia"].includes(accion);
  const cobroBloqueado = accion === "cobro" && (!p || !restaurantePuedeCobrar(p));
  const titulos: Partial<Record<AccionRestaurante, string>> = { salida: "Registrar salida", entregar: "Registrar entrega", solicitar_cuenta: "Solicitar cuenta", cobro: "Registrar cobro", cerrar: "Cerrar y generar comprobante", rendir: "Recibir rendición", asignar_envio: "Asignar repartidor", mover_mesa: "Mover cuenta de mesa", unir: "Unir cuentas", cancelar: "Cancelar pedido", cancelar_item: "Cancelar producto", anular_cobro: "Anular cobro y confirmar devolución", incidencia: "Registrar incidencia" };
  const usuarios = accion === "asignar_envio" ? data.usuarios.filter(u => u.admin || data.asignaciones.some(a => a.usuario_id === u.id && a.permisos.includes("envios"))) : accion === "rendir" ? data.usuarios.filter(u => pendientesRendicion.some(c => restauranteResponsableCobro(c) === u.id)) : data.usuarios;
  return <Modal title={titulos[accion] || accion} close={close}>{venta ? <div className="grid gap-4"><p>Cuenta cerrada. Venta registrada una sola vez.</p>{tipo !== "recibo_x" && <><Button disabled={cae.isPending} onClick={() => cae.mutate(venta)}>Solicitar / reintentar CAE</Button><p className="text-sm text-muted-foreground">La autorización fiscal se solicita a ARCA después del cierre. Si falla, la venta conserva su registro y se puede reintentar.</p></>}<Button variant="outline" onClick={() => setVerVenta(true)}>Ver venta</Button><Button onClick={close}>Cerrar</Button></div> : <form className="grid gap-4" onSubmit={async e => {
    e.preventDefault();
    if (cobroBloqueado) return;
    const base = p ? { pedido_id: p.id, version: p.version } : {};
    const destino = data.pedidos.find(x => x.id === seleccion);
    const payload = { ...base, ...(elegida.item_id ? { item_id: elegida.item_id } : {}), ...(elegida.cobro_id ? { cobro_id: elegida.cobro_id } : {}), motivo,
      ...(accion === "cobro" ? { monto: porItem ? Math.round(importeItems * 100) / 100 : monto, medio, pagador, recibido_por: p?.modalidad === "mesa" ? recibidoPor : data.usuario_id, ...(porItem ? { items: items.filter(i => cantidades[i.id] > 0).map(i => ({ item_id: i.id, cantidad: cantidades[i.id] })) } : {}) } : {}),
      ...(accion === "rendir" ? { usuario_id: seleccion, recibido: monto, cobro_ids: idsRendicion } : {}),
      ...(accion === "asignar_envio" ? { repartidor_id: seleccion } : {}), ...(accion === "mover_mesa" ? { mesa_id: seleccion } : {}),
      ...(accion === "unir" ? { destino_id: seleccion, destino_version: destino?.version } : {}),
      ...(accion === "anular_cobro" ? { devolucion_confirmada: confirmado } : {}), ...(accion === "cerrar" ? { tipo_comprobante: tipo, cliente_id: cliente } : {}),
    };
    const result = await operar(accion, payload);
    if (result) { if (accion === "cerrar") { setVenta(result); setVerVenta(true); } else close(); }
  }}>
    {p && <p>Pedido #{p.numero} · {p.cliente_nombre} · Total {money(p.total)} · Saldo {money(restauranteSaldo(data, p).saldo)}</p>}
    {cobroBloqueado && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">La cuenta ya no está disponible para cobrar. En mesas, primero deben estar servidos los productos y solicitada la cuenta. Cerrá esta ventana y revisá el pedido.</p>}
    {["asignar_envio", "rendir"].includes(accion) && <RestauranteBusqueda label={accion === "asignar_envio" ? "Repartidor" : "Usuario que rinde"} value={seleccion} opciones={usuarios.map(u => ({ id: u.id, nombre: u.nombre }))} cambiar={id => { setSeleccion(id); setCobroIds([]); }} disabled={trabajando} />}
    {accion === "mover_mesa" && <RestauranteBusqueda label="Mesa destino libre" value={seleccion} opciones={data.mesas.filter(m => m.activo && !data.cuenta_mesas.some(c => c.activa && c.mesa_id === m.id)).map(m => ({ id: m.id, nombre: m.nombre, detalle: `${m.capacidad} personas` }))} cambiar={setSeleccion} disabled={trabajando} />}
    {accion === "unir" && <><p>Las comandas y mesas pasarán a la cuenta destino. Ambas cuentas deben estar sin cobros.</p><RestauranteBusqueda label="Cuenta destino" value={seleccion} opciones={data.pedidos.filter(x => x.modalidad === "mesa" && x.id !== p?.id && restauranteAbierto(x) && x.cuenta === "abierta").map(x => ({ id: x.id, nombre: `Pedido #${x.numero} · ${x.cliente_nombre}`, detalle: money(x.total) }))} cambiar={setSeleccion} disabled={trabajando} /></>}
    {accion === "cobro" && <><RestauranteBusqueda label="Medio de pago" value={medio} opciones={[{ id: "contado", nombre: "Efectivo" }, { id: "transferencia", nombre: "Transferencia" }, { id: "tarjeta", nombre: "Tarjeta" }]} cambiar={setMedio} disabled={trabajando} /><Field label="Nombre de quien paga (opcional)"><Input value={pagador} onChange={e => setPagador(e.target.value)} /></Field><label className="flex gap-2"><input type="checkbox" checked={porItem} onChange={e => setPorItem(e.target.checked)} /> Dividir por productos</label>{porItem ? <div className="grid gap-3">{items.map(i => <Field key={i.id} label={`${i.descripcion} · ${money(i.precio)} · ${restantes(i.id, i.cantidad)} disponibles`}><Input type="number" min={0} max={restantes(i.id, i.cantidad)} step={1} value={cantidades[i.id] || 0} onChange={e => setCantidades({ ...cantidades, [i.id]: Number(e.target.value) })} /></Field>)}<p>Cobro seleccionado: {money(importeItems)}. El envío se cobra por importe.</p></div> : <Field label="Importe (permite pagos parciales)"><Input required type="number" min="0.01" step="0.01" max={p ? restauranteSaldo(data, p).saldo : undefined} value={monto} onChange={e => setMonto(Number(e.target.value))} /></Field>}<p className="text-xs text-muted-foreground">Registrá el pago después de verificar su recepción. Esta pantalla no procesa tarjetas ni transferencias automáticamente.</p></>}
    {accion === "cobro" && p?.modalidad === "mesa" && <RestauranteBusqueda label="Recibió el pago" value={recibidoPor} opciones={data.usuarios.filter(u => u.id === data.usuario_id || u.id === p.creado_por || u.admin).map(u => ({ id: u.id, nombre: `${u.admin ? "Caja" : "Mozo"} · ${u.nombre}` }))} cambiar={setRecibidoPor} disabled={trabajando} />}
    {accion === "rendir" && <><fieldset className="grid gap-2"><legend>Cobros en efectivo pendientes</legend>{rendibles.map(c => <label key={c.id} className="flex gap-2"><input type="checkbox" checked={cobroIds.includes(c.id)} onChange={e => setCobroIds(e.target.checked ? [...cobroIds, c.id] : cobroIds.filter(id => id !== c.id))} />Pedido #{data.pedidos.find(p => p.id === c.pedido_id)?.numero} · {money(c.monto)}</label>)}</fieldset><p>Esperado: {money(esperado)}</p><Field label="Efectivo recibido"><Input required min={0} type="number" step="0.01" value={monto} onChange={e => setMonto(Number(e.target.value))} /></Field><p>Diferencia: {money(monto - esperado)}</p><Field label="Explicación de la diferencia"><Input required={monto !== esperado} value={motivo} onChange={e => setMotivo(e.target.value)} /></Field></>}
    {conMotivo && <Field label="Motivo obligatorio"><Input required value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>}
    {accion === "anular_cobro" && <label className="flex gap-2"><input required type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />Confirmo que devolví el dinero y corregí el pago externo.</label>}
    {accion === "salida" && <p className="text-sm text-muted-foreground">Confirmá cuando tengas el pedido controlado y salgas hacia el domicilio del cliente.</p>}
    {accion === "entregar" && <p className="text-sm text-muted-foreground">Confirmá después de entregar el pedido al cliente. La entrega no registra un pago: el cobro se informa por separado.</p>}
    {accion === "solicitar_cuenta" && <p className="text-sm text-muted-foreground">La mesa pasará a Cuentas y cobros y dejará de admitir nuevas rondas. Los pagos ya registrados se conservan; esta acción no registra otro cobro.</p>}
    {accion === "cerrar" && <><ClienteCierre value={cliente} cambiar={setCliente} /><RestauranteBusqueda label="Comprobante" value={tipo} opciones={[{ id: "recibo_x", nombre: "Recibo X" }, { id: "factura_a", nombre: "Factura A" }, { id: "factura_b", nombre: "Factura B" }, { id: "factura_c", nombre: "Factura C" }]} cambiar={setTipo} disabled={trabajando} /><p>El cierre registra la venta, los pagos y el stock. El saldo pendiente pasa a cuenta corriente si el pedido tiene un cliente vinculado. La mesa se libera al cerrar.</p></>}
    <Button disabled={trabajando || cobroBloqueado || (["asignar_envio", "mover_mesa", "unir", "rendir"].includes(accion) && !seleccion) || (accion === "rendir" && !idsRendicion.length) || (accion === "cobro" && porItem && importeItems <= 0)}>Confirmar</Button>
  </form>}{venta && verVenta && <RestauranteVenta ventaId={venta} close={() => setVerVenta(false)} />}</Modal>;
}
