import { useState } from "react";
import Grilla from "@/components/utilidades/GrillaUtilidades";
import CotizacionesBna from "@/components/utilidades/CotizacionesBna";
import { useForm } from "react-hook-form";
import { NavLink } from "react-router-dom";
import { Calculator, ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useComercio } from "@/hooks/useComercio";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useUtilidadesBcra } from "@/hooks/useUtilidadesBcra";
import { utilidadesSecciones, type VistaUtilidades } from "@/config/utilidadesNavigation";
import { BCRA_FUENTE, consultaBcraUrl, deudaBcraEnPesos, identificacionBcra, type ConsultaBcra, type RespuestaBcra } from "@/utils/bcra";

const pesos = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(value);
const decimal = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 8 }).format(value);
const fecha = (value: string | null | undefined) => value ? (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value) : "No informada";
const periodo = (value: string) => /^\d{6}$/.test(value) ? `${value.slice(4)}/${value.slice(0, 4)}` : value;
const observaciones = (item: { enRevision?: boolean; procesoJud?: boolean; refinanciaciones?: boolean; recategorizacionOblig?: boolean; situacionJuridica?: boolean; irrecDisposicionTecnica?: boolean }) => [
  item.enRevision && "Información en revisión", item.procesoJud && "Información sometida a proceso judicial",
  item.refinanciaciones && "Refinanciación", item.recategorizacionOblig && "Recategorización obligatoria",
  item.situacionJuridica && "Situación jurídica informada", item.irrecDisposicionTecnica && "Irrecuperable por disposición técnica",
].filter(Boolean).join(" · ");
function Importe({ value }: { value: number }) { return <span className="whitespace-nowrap font-medium">{pesos(value)}</span>; }
function Resultados({ data, filtro, identificacion, todas }: { data: RespuestaBcra; filtro: string; identificacion?: string; todas: boolean }) {
  if (data.sinRegistros) return <p className="rounded-lg border p-4" role="status">El BCRA no devolvió registros para la identificación {identificacion}. Esto no constituye una garantía de solvencia ni de pago.</p>;
  if (data.cotizaciones) {
    const principales = ["USD", "BRL", "EUR"];
    const items = data.cotizaciones.detalle.filter(item => (todas || principales.includes(item.codigoMoneda)) && (item.codigoMoneda + " " + item.descripcion).toLocaleLowerCase().includes(filtro.toLocaleLowerCase())).sort((a, b) => todas ? a.codigoMoneda.localeCompare(b.codigoMoneda) : principales.indexOf(a.codigoMoneda) - principales.indexOf(b.codigoMoneda));
    return <section className="space-y-3" aria-label="Cotizaciones"><p className="font-medium">Fecha publicada por el BCRA: {fecha(data.cotizaciones.fecha)}</p><p className="text-sm text-muted-foreground">Cotizaciones de referencia publicadas por el BCRA. No son precios de compra y venta de un banco o una casa de cambio. Se conserva la unidad indicada en la descripción de cada divisa.</p><Grilla titulo="Cotizaciones de divisas" columnas={["Código", "Divisa / unidad", "Cotización en pesos", "Tipo de pase (USD)"]} filas={items.map(item => [item.codigoMoneda, item.descripcion, item.tipoCotizacion > 0 ? <span className="whitespace-nowrap">$ {decimal(item.tipoCotizacion)}</span> : "No informada", item.tipoPase > 0 ? decimal(item.tipoPase) : "No informado"])} vacia={data.cotizaciones.detalle.length ? "No hay divisas que coincidan con la búsqueda." : "No hay cotizaciones publicadas para la fecha consultada."} /></section>;
  }
  if (data.deudores) {
    const meses = [...data.deudores.periodos].sort((a, b) => b.periodo.localeCompare(a.periodo));
    return <section className="space-y-4" aria-label="Informe de deudores">
      <Grilla titulo="Identificación del deudor" columnas={["CUIT / CUIL / CDI", "Denominación"]} filas={[[data.deudores.identificacion, data.deudores.denominacion]]} />
      <p className="text-sm text-muted-foreground">Los montos se muestran en pesos; el BCRA los entrega en miles de pesos. La situación corresponde a la clasificación informada por cada entidad.</p>
      <Grilla titulo="Deudas por entidad y período" columnas={["Período", "Entidad", "Deuda en pesos", "Situación BCRA", "Días de atraso", "Desde situación 1", "Observaciones"]} filas={meses.flatMap(mes => mes.entidades.map(item => [periodo(mes.periodo), item.entidad, <Importe value={deudaBcraEnPesos(item.monto)} />, item.situacion, item.diasAtrasoPago === undefined ? "No informados" : item.diasAtrasoPago === 0 ? "0 / no aplicable" : item.diasAtrasoPago, fecha(item.fechaSit1), observaciones(item) || "Sin observaciones informadas"]))} />
      <Grilla titulo="Totales por período" columnas={["Período", "Total de deuda informado (pesos)"]} filas={meses.map(mes => [periodo(mes.periodo), <Importe value={mes.entidades.reduce((total, item) => total + deudaBcraEnPesos(item.monto), 0)} />])} vacia="No hay períodos informados." />
    </section>;
  }
  if (data.rechazados) {
    const items = data.rechazados.causales.flatMap(causal => causal.entidades.flatMap(entidad => entidad.detalle.map(item => ({ ...item, causal: causal.causal, entidad: entidad.entidad }))));
    return <section className="space-y-4" aria-label="Informe de cheques rechazados">
      <Grilla titulo="Identificación consultada" columnas={["CUIT / CUIL / CDI", "Denominación", "Registros"]} filas={[[data.rechazados.identificacion, data.rechazados.denominacion, items.length]]} />
      <Grilla titulo="Cheques rechazados" columnas={["Cheque", "Causal", "Agrupamiento de entidad BCRA", "Importe en pesos", "Fecha de rechazo", "Pago / levantamiento", "Estado de multa", "Pago de multa", "Cuenta personal", "Persona jurídica vinculada", "Observaciones"]} filas={items.map(item => [item.nroCheque, item.causal, item.entidad, <Importe value={item.monto} />, fecha(item.fechaRechazo), fecha(item.fechaPago), item.estadoMulta || "No informado", fecha(item.fechaPagoMulta), item.ctaPersonal ? "Sí" : "No", item.denomJuridica || "No informada", observaciones(item) || "Sin observaciones informadas"])} vacia="El BCRA no devolvió cheques rechazados para esta identificación." />
    </section>;
  }
  if (data.denunciados) return <section className="space-y-4" aria-label="Informe de cheque denunciado">
    <Grilla titulo="Estado del cheque" columnas={["Cheque", "Entidad bancaria", "Denunciado", "Fecha de procesamiento"]} filas={[[data.denunciados.numeroCheque, data.denunciados.denominacionEntidad, <strong className={data.denunciados.denunciado ? "text-destructive" : ""}>{data.denunciados.denunciado ? "Sí, registra denuncias" : "No registra denuncias"}</strong>, fecha(data.denunciados.fechaProcesamiento)]]} />
    <p className="text-sm text-muted-foreground">La consulta puede devolver varias cuentas o sucursales con el mismo número. Compará los datos con el cheque. La ausencia de denuncia no garantiza fondos ni validez.</p>
    <Grilla titulo="Detalle de denuncias" columnas={["Sucursal", "Cuenta", "Causal"]} filas={data.denunciados.detalles.map(item => [item.sucursal, item.numeroCuenta, item.causal])} vacia="El BCRA no informa denuncias para este banco y número de cheque." />
  </section>;
  return null;
}

type CamposConsulta = { fecha: string; identificacion: string; historico: boolean; entidad: string; cheque: string };
function ConsultaUtilidades({ vista, comercioId }: { vista: VistaUtilidades; comercioId: string }) {
  const [consulta, setConsulta] = useState<ConsultaBcra | null>(() => vista === "cotizaciones" ? { tipo: "cotizaciones", fecha: "" } : null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");
  const [todas, setTodas] = useState(false);
  const { register, handleSubmit, setValue } = useForm<CamposConsulta>({ defaultValues: { fecha: "", identificacion: "", historico: false, entidad: "", cheque: "" } });
  const query = useUtilidadesBcra(comercioId, consulta, true);
  const bancos = useUtilidadesBcra(comercioId, vista === "cheques-denunciados" ? { tipo: "entidades" } : null, true);
  const consultar = (values: CamposConsulta) => {
    try {
      const next: ConsultaBcra = vista === "cotizaciones" ? { tipo: vista, fecha: values.fecha } : vista === "cheques-denunciados" ? { tipo: vista, entidad: values.entidad, cheque: values.cheque } : vista === "deudores" ? { tipo: vista, identificacion: identificacionBcra(values.identificacion), historico: values.historico } : { tipo: vista, identificacion: identificacionBcra(values.identificacion) };
      consultaBcraUrl(next); setError("");
      if (JSON.stringify(next) === JSON.stringify(consulta)) void query.refetch();
      else setConsulta(next);
    } catch (e) { setConsulta(null); setError(e instanceof Error ? e.message : "Revisá los datos de la consulta."); }
  };
  const title = utilidadesSecciones.find(item => item.vista === vista)?.title;
  return <div className="space-y-5">
    <section className={vista === "cotizaciones" ? "flex flex-col gap-3 rounded-lg border p-3 xl:flex-row xl:items-center" : "space-y-4 rounded-lg border p-4"}><h2 className={vista === "cotizaciones" ? "shrink-0 text-lg font-semibold" : "text-xl font-semibold"}>{title}</h2>
      <form className={vista === "cotizaciones" ? "flex min-w-0 flex-1 flex-wrap items-center gap-3" : "space-y-4"} onSubmit={handleSubmit(consultar)} onChange={() => { setConsulta(null); setError(""); }}>
        {vista === "cotizaciones" ? <div className="flex min-w-0 flex-wrap items-center gap-2"><Label htmlFor="bcra-fecha" className="shrink-0">Fecha (opcional)</Label><Input id="bcra-fecha" type="date" className="w-40" aria-describedby="bcra-fecha-ayuda" {...register("fecha")} /><p id="bcra-fecha-ayuda" className="text-xs text-muted-foreground">Sin fecha: última publicada.</p></div> : vista === "cheques-denunciados" ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="bcra-banco">Entidad bancaria</Label><select id="bcra-banco" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" {...register("entidad")} disabled={bancos.isFetching || bancos.isError}><option value="">{bancos.isFetching ? "Cargando bancos…" : "Seleccioná un banco"}</option>{bancos.data?.entidades?.map(banco => <option key={banco.codigoEntidad} value={banco.codigoEntidad}>{banco.codigoEntidad} · {banco.denominacion.trim()}</option>)}</select>{bancos.isError && <div className="space-y-2"><p className="text-sm text-destructive" role="alert">{bancos.error.message}</p><Button type="button" size="sm" variant="outline" onClick={() => void bancos.refetch()}>Volver a cargar bancos</Button></div>}</div><div className="space-y-2"><Label htmlFor="bcra-cheque">Número de cheque</Label><Input id="bcra-cheque" inputMode="numeric" autoComplete="off" maxLength={19} {...register("cheque")} /></div></div> : <div className="space-y-3"><div className="max-w-sm space-y-2"><Label htmlFor="bcra-identificacion">CUIT / CUIL / CDI</Label><Input id="bcra-identificacion" inputMode="numeric" autoComplete="off" placeholder="11 dígitos" maxLength={20} {...register("identificacion")} /></div>{vista === "deudores" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("historico")} />Consultar el historial de los últimos 24 meses</label>}</div>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={query.isFetching || (vista === "cheques-denunciados" && (bancos.isFetching || bancos.isError))}>{query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{query.isFetching ? "Consultando…" : "Consultar BCRA"}</Button>{vista === "cotizaciones" && <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => { setValue("fecha", ""); setError(""); const next: ConsultaBcra = { tipo: "cotizaciones", fecha: "" }; if (consulta?.tipo === "cotizaciones" && !consulta.fecha) void query.refetch(); else setConsulta(next); }}>Última fecha disponible</Button>}</div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </section>
    {consulta && query.isFetching && <p role="status" className="text-sm text-muted-foreground">Consultando la información oficial del BCRA…</p>}
    {consulta && query.isError && <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{query.error.message}</p>}
    {consulta && query.data && !query.isFetching && !query.isError && <>
      <p className="text-xs text-muted-foreground">Consulta realizada: {new Date(query.data.consultadoEn).toLocaleString("es-AR")}</p>
      {vista === "cotizaciones" && <div className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="w-full max-w-md space-y-2"><Label htmlFor="bcra-filtro">Buscar divisa</Label><Input id="bcra-filtro" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="USD, euro, real…" /></div><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={todas} onChange={e => { setTodas(e.target.checked); setFiltro(""); }} />Mostrar todas las divisas</label></div>}
      <Resultados data={query.data} filtro={filtro} todas={todas} identificacion={"identificacion" in consulta ? consulta.identificacion : undefined} />
    </>}
  </div>;
}

export default function Utilidades({ vista }: { vista: VistaUtilidades }) {
  const [fuente, setFuente] = useState<"bna" | "bcra">("bna");
  const { comercio } = useComercio();
  const { data: parametros } = useComercioParametrizacion();
  if (!comercio || !parametros.modulos.utilidades) return <p className="p-6">Utilidades no está habilitado para este comercio.</p>;
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="space-y-2"><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Calculator className="h-7 w-7" />Utilidades</h1><p className="text-sm text-muted-foreground">Consultá billetes del Banco Nación, cotizaciones de divisas, deudores y cheques del BCRA.</p></header>
    <nav aria-label="Consultas de Utilidades" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{utilidadesSecciones.map(item => <Button key={item.vista} asChild variant={vista === item.vista ? "default" : "outline"} className="h-auto min-h-10 justify-start whitespace-normal text-left"><NavLink to={`/utilidades/${item.vista}`}><item.icon className="h-4 w-4 shrink-0" />{item.title}</NavLink></Button>)}</nav>
    {vista === "cotizaciones" && <div className="flex flex-wrap items-center gap-2" aria-label="Fuente de cotizaciones"><Button variant={fuente === "bna" ? "default" : "outline"} aria-pressed={fuente === "bna"} onClick={() => setFuente("bna")}>Banco Nación · Billetes</Button><Button variant={fuente === "bcra" ? "default" : "outline"} aria-pressed={fuente === "bcra"} onClick={() => setFuente("bcra")}>BCRA · Divisas</Button></div>}
    {vista === "cotizaciones" && fuente === "bna" ? <CotizacionesBna key={comercio.id} comercioId={comercio.id} /> : <ConsultaUtilidades key={`${comercio.id}:${vista}`} vista={vista} comercioId={comercio.id} />}
    <footer className="space-y-2 border-t pt-4 text-xs text-muted-foreground"><p>Fuentes: Banco Nación (billetes) y BCRA (divisas e informes). La fecha de publicación o período informado puede ser anterior al día de la consulta. Las consultas de personas se realizan únicamente al presionar Consultar BCRA.</p><p>Los informes se conservan sólo mientras esta consulta está abierta; no se guardan en el comercio ni en el almacenamiento del navegador.</p><a href={BCRA_FUENTE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">APIs, documentación y aviso legal del BCRA<ExternalLink className="h-3 w-3" /></a></footer>
  </div>;
}
