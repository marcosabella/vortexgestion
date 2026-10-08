import { useState, type FormEvent, type ReactNode } from "react";
import { Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { RestauranteGrilla, RestauranteAccion } from "./RestauranteGrilla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RestauranteUsuarios } from "./RestauranteUsuarios";
import { useProductos } from "@/hooks/useProductos";
import type { AccionRestaurante, ContextoRestaurante, ModalidadRestaurante } from "@/types/restaurante";
import { Field } from "./RestauranteForms";
import { RestauranteBusqueda } from "./RestauranteBusqueda";
import { restauranteMoney as money } from "@/utils/restaurante";

const formatos = [{ id: "58mm", nombre: "Ticket 58 mm" }, { id: "a4", nombre: "A4" }];
const secciones = [
  { id: "general", nombre: "General" }, { id: "sectores", nombre: "Sectores" },
  { id: "mesas", nombre: "Mesas" }, { id: "carta", nombre: "Carta" },
  { id: "adicionales", nombre: "Adicionales" }, { id: "usuarios", nombre: "Usuarios y roles" },
];
function ConfigForm({ title, children, guardar, trabajando, disabled = false }: {
  title: string; children: ReactNode; guardar: (e: FormEvent<HTMLFormElement>) => void; trabajando: boolean; disabled?: boolean;
}) {
  return <section className="rounded-xl border p-4"><h2 className="mb-4 text-lg font-semibold">{title}</h2><form className="grid gap-4" onSubmit={guardar}>{children}<Button className="justify-self-start" disabled={trabajando || disabled}>Guardar</Button></form></section>;
}
export function RestauranteConfiguracion({ data, operar, trabajando }: ContextoRestaurante) {
  const { productos } = useProductos();
  const [modalidades, setModalidades] = useState<ModalidadRestaurante[]>(data.config.modalidades);
  const [impresion, setImpresion] = useState(data.config.impresion);
  const [ivaEnvio, setIvaEnvio] = useState(data.config.iva_envio);
  const [productoCarta, setProductoCarta] = useState("");
  const [sectorCarta, setSectorCarta] = useState("");
  const [formatoSector, setFormatoSector] = useState("");
  const sectores = data.sectores.filter(s => s.activo).map(s => ({ id: s.id, nombre: s.nombre }));
  const guardar = (accion: AccionRestaurante) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    if (accion === "carta" && (!productoCarta || !sectorCarta)) return;
    const resultado = await operar(accion, { ...values,
      ...(accion === "mesa" ? { capacidad: Number(values.capacidad) } : {}),
      ...(accion === "adicional" ? { precio: Number(values.precio) } : {}),
      ...(accion === "carta" ? { afecta_stock: values.afecta_stock === "on", activo: true } : {}),
    });
    if (resultado) {
      form.reset();
      if (accion === "carta") { setProductoCarta(""); setSectorCarta(""); }
      if (accion === "sector") setFormatoSector("");
    }
  };
  return <Tabs defaultValue="general" className="grid gap-4">
    <TabsList aria-label="Secciones de configuración" className="flex h-auto flex-wrap justify-start gap-1">
      {secciones.filter(s => s.id !== "usuarios" || data.admin).map(s => <TabsTrigger key={s.id} value={s.id} className="min-h-11">{s.nombre}</TabsTrigger>)}
    </TabsList>
    <TabsContent value="general">
      <ConfigForm title="Modalidades e impresión" trabajando={trabajando} disabled={!modalidades.length} guardar={async e => { e.preventDefault(); await operar("config", { modalidades, impresion, iva_envio: ivaEnvio }); }}>
        <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">Modalidades habilitadas</legend>{(["delivery", "retiro", "mesa"] as const).map(m => <label key={m} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={modalidades.includes(m)} onChange={e => setModalidades(e.target.checked ? [...modalidades, m] : modalidades.filter(x => x !== m))} />{m === "mesa" ? "Salón / mesas" : m === "retiro" ? "Retiro" : "Delivery"}</label>)}</fieldset>
        <RestauranteBusqueda label="Formato general de impresión" value={impresion} opciones={formatos} cambiar={id => setImpresion(id as "58mm" | "a4")} disabled={trabajando} />
        <p className="text-sm text-muted-foreground">Imprimir y PDF usan el formato guardado aquí para el detalle de cuenta y las comandas sin formato propio. Cada sector puede tener su formato de comanda.</p>
        <RestauranteBusqueda label="IVA del servicio de envío (precio final)" value={String(ivaEnvio)} opciones={[0, 10.5, 21, 27].map(v => ({ id: String(v), nombre: `${v}%` }))} cambiar={id => setIvaEnvio(Number(id))} disabled={trabajando} />
      </ConfigForm>
    </TabsContent>
    <TabsContent value="sectores">
      <ConfigForm title="Sectores de preparación" trabajando={trabajando} guardar={guardar("sector")}>
        <Field label="Nombre"><Input name="nombre" required maxLength={100} placeholder="Cocina, barra, postres…" /></Field>
        <RestauranteBusqueda label="Formato del nuevo sector" name="impresion" value={formatoSector} opciones={[{ id: "", nombre: "Usar configuración general" }, ...formatos]} cambiar={setFormatoSector} disabled={trabajando} />
        <RestauranteGrilla label="Sectores configurados" columnas={[{ titulo: "Sector" }, { titulo: "Formato de comanda" }, { titulo: "Estado" }, { titulo: "Acciones", derecha: true }]} vacia={!data.sectores.length ? "No hay sectores configurados." : undefined}>{data.sectores.map(s => <TableRow key={s.id}><TableCell className="font-medium">{s.nombre}</TableCell><TableCell className="min-w-64"><RestauranteBusqueda label={`Formato de ${s.nombre}`} value={s.impresion || ""} opciones={[{ id: "", nombre: "Usar configuración general" }, ...formatos]} disabled={trabajando} cambiar={id => void operar("sector", { ...s, impresion: id || null })} /></TableCell><TableCell><Badge variant={s.activo ? "secondary" : "outline"}>{s.activo ? "Activo" : "Inactivo"}</Badge></TableCell><TableCell><div className="flex justify-end"><RestauranteAccion icon={Power} variant={s.activo ? "destructive" : "success"} disabled={trabajando} onClick={() => void operar("sector", { ...s, activo: !s.activo })}>{s.activo ? "Desactivar" : "Activar"}</RestauranteAccion></div></TableCell></TableRow>)}</RestauranteGrilla>
      </ConfigForm>
    </TabsContent>
    <TabsContent value="mesas">
      <ConfigForm title="Mesas" trabajando={trabajando} guardar={guardar("mesa")}>
        <Field label="Nombre"><Input name="nombre" required maxLength={100} /></Field>
        <Field label="Capacidad"><Input name="capacidad" type="number" min={1} max={100} defaultValue={4} required /></Field>
        <RestauranteGrilla label="Mesas configuradas" columnas={[{ titulo: "Mesa" }, { titulo: "Capacidad", derecha: true }, { titulo: "Estado" }, { titulo: "Acciones", derecha: true }]} vacia={!data.mesas.length ? "No hay mesas configuradas." : undefined}>{data.mesas.map(m => <TableRow key={m.id}><TableCell className="font-medium">{m.nombre}</TableCell><TableCell className="text-right">{m.capacidad}</TableCell><TableCell><Badge variant={m.activo ? "secondary" : "outline"}>{m.activo ? "Activa" : "Inactiva"}</Badge></TableCell><TableCell><div className="flex justify-end"><RestauranteAccion icon={Power} variant={m.activo ? "destructive" : "success"} disabled={trabajando} onClick={() => void operar("mesa", { ...m, activo: !m.activo })}>{m.activo ? "Desactivar" : "Activar"}</RestauranteAccion></div></TableCell></TableRow>)}</RestauranteGrilla>
      </ConfigForm>
    </TabsContent>
    <TabsContent value="carta">
      <ConfigForm title="Carta desde productos de Vortex" trabajando={trabajando} disabled={!productoCarta || !sectorCarta} guardar={guardar("carta")}>
        <RestauranteBusqueda label="Producto / plato" name="producto_id" value={productoCarta} opciones={productos.filter(p => p.tipo_moneda === "ARS" && Number(p.precio_venta) > 0).map(p => ({ id: p.id, nombre: p.descripcion, detalle: `${p.cod_producto || ""} · ${money(Number(p.precio_venta))}`, buscar: p.cod_barras }))} cambiar={setProductoCarta} disabled={trabajando} />
        <RestauranteBusqueda label="Sector de preparación" name="sector_id" value={sectorCarta} opciones={sectores} cambiar={setSectorCarta} disabled={trabajando} />
        <label className="flex min-h-11 items-center gap-2"><input name="afecta_stock" type="checkbox" />Descontar stock del producto al cerrar</label>
        <p className="text-sm text-muted-foreground">Para bebidas y productos terminados podés descontar unidades. Los platos preparados se registran como conceptos de venta; las recetas e ingredientes quedan para una etapa posterior. Los adicionales usan la alícuota del plato.</p>
        <RestauranteGrilla label="Carta configurada" columnas={[{ titulo: "Producto / plato" }, { titulo: "Sector" }, { titulo: "Precio", derecha: true }, { titulo: "Stock al cierre" }, { titulo: "Estado" }, { titulo: "Acciones", derecha: true }]} vacia={!data.carta.length ? "No hay productos en la carta." : undefined}>{data.carta.map(c => <TableRow key={c.id}><TableCell className="font-medium">{c.descripcion}</TableCell><TableCell>{data.sectores.find(s => s.id === c.sector_id)?.nombre}</TableCell><TableCell className="whitespace-nowrap text-right">{money(c.precio)}</TableCell><TableCell>{c.afecta_stock ? "Descontar unidades" : "Sin descuento"}</TableCell><TableCell><Badge variant={c.activo ? "secondary" : "outline"}>{c.activo ? "Activo" : "Inactivo"}</Badge></TableCell><TableCell><div className="flex justify-end"><RestauranteAccion icon={Power} variant={c.activo ? "destructive" : "success"} disabled={trabajando} onClick={() => void operar("carta", { producto_id: c.producto_id, sector_id: c.sector_id, afecta_stock: c.afecta_stock, activo: !c.activo })}>{c.activo ? "Desactivar" : "Activar"}</RestauranteAccion></div></TableCell></TableRow>)}</RestauranteGrilla>
      </ConfigForm>
    </TabsContent>
    <TabsContent value="adicionales">
      <ConfigForm title="Adicionales" trabajando={trabajando} guardar={guardar("adicional")}>
        <Field label="Nombre"><Input name="nombre" required maxLength={100} /></Field>
        <Field label="Precio por unidad"><Input name="precio" type="number" min={0} step="0.01" required /></Field>
        <RestauranteGrilla label="Adicionales configurados" columnas={[{ titulo: "Adicional" }, { titulo: "Precio", derecha: true }, { titulo: "Estado" }, { titulo: "Acciones", derecha: true }]} vacia={!data.adicionales.length ? "No hay adicionales configurados." : undefined}>{data.adicionales.map(a => <TableRow key={a.id}><TableCell className="font-medium">{a.nombre}</TableCell><TableCell className="whitespace-nowrap text-right">{money(a.precio)}</TableCell><TableCell><Badge variant={a.activo ? "secondary" : "outline"}>{a.activo ? "Activo" : "Inactivo"}</Badge></TableCell><TableCell><div className="flex justify-end"><RestauranteAccion icon={Power} variant={a.activo ? "destructive" : "success"} disabled={trabajando} onClick={() => void operar("adicional", { ...a, activo: !a.activo })}>{a.activo ? "Desactivar" : "Activar"}</RestauranteAccion></div></TableCell></TableRow>)}</RestauranteGrilla>
      </ConfigForm>
    </TabsContent>
    {data.admin && <TabsContent value="usuarios"><RestauranteUsuarios data={data} /></TabsContent>}
  </Tabs>;
}
