import { useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useApicolaOperar } from "@/hooks/useApicola";
import { activaColmena, recursosApicolas, type ApicolaCatalogos, type ApicolaEntidad, type ApicolaFila, type ApicolaFiltro } from "@/types/apicola";

type Opcion = { value: string; label: string };
type Campo = { key: string; label: string; tipo?: "textarea" | "date" | "number" | "select" | "multi"; requerido?: boolean; min?: number; max?: number; paso?: string; opciones?: Opcion[]; ayuda?: string };
const opciones = (values: Record<string, string>): Opcion[] => Object.entries(values).map(([value, label]) => ({ value, label }));
const fechaHoy = () => format(new Date(), "yyyy-MM-dd");
const lista = (text: string) => text.split(/[,\n]/).map(value => value.trim()).filter(Boolean);
const comoTexto = (value: unknown) => value == null ? "" : Array.isArray(value) ? value.join(",") : typeof value === "object" ? "" : String(value);
const tareasVisita = opciones({ revision: "Revisión", alimentacion: "Alimentación", tratamiento: "Tratamiento", reina: "Recambio de reina", nucleo: "Formación de núcleos", enjambre: "Captura de enjambre", division: "División", fusion: "Fusión", alzas: "Agregar/retirar alzas", cosecha: "Cosecha", traslado: "Traslado", mantenimiento: "Mantenimiento", baja: "Bajas" });

function valoresIniciales(entidad: ApicolaEntidad, fila: ApicolaFila | undefined, catalogos: ApicolaCatalogos, filtro: ApicolaFiltro): Record<string, string> {
  const hoy = fechaHoy(), year = hoy.slice(0, 4);
  const result: Record<string, string> = { fecha: hoy, fecha_alta: hoy, fecha_inicio: `${year}-01-01`, fecha_fin: `${year}-12-31`, estado: entidad === "campana" ? "abierta" : "pendiente", activo: "true", uso: "propio", origen: "existente", prioridad: "normal", tipo: "alta", recurso: "colonias", cantidad: entidad === "visita" ? "0" : "1", alcance: "grupo", colmena_ids: "", codigos_nuevos: "", estado_baja: "baja", origen_colonias: "compra", campana_id: filtro.campana || catalogos.campanas.find(c => c.estado === "abierta")?.id || "", apiario_id: filtro.apiario || catalogos.apiarios.find(a => a.activo)?.id || "", origen_apiario_id: filtro.apiario || "", destino_apiario_id: "", detalle_reina: "no_revisado", detalle_fortaleza: "no_revisado", detalle_cria: "no_revisado", detalle_reservas: "no_revisado", detalle_evento: "observacion", detalle_origen: "preparado", detalle_unidad: "kg", detalle_inicio: hoy };
  if (fila) for (const [key, value] of Object.entries(fila)) result[key] = comoTexto(value);
  if (fila?.datos && typeof fila.datos === "object") for (const [key, value] of Object.entries(fila.datos)) result[`detalle_${key}`] = comoTexto(value);
  return result;
}

function campos(entidad: ApicolaEntidad, valores: Record<string, string>, catalogos: ApicolaCatalogos, admin: boolean): Campo[] {
  const campanas = catalogos.campanas.map(c => ({ value: c.id, label: `${c.nombre}${c.estado === "cerrada" ? " · cerrada" : ""}` }));
  const apiarios = catalogos.apiarios.filter(a => a.activo || a.id === valores.apiario_id).map(a => ({ value: a.id, label: `${a.codigo} · ${a.nombre}` }));
  const identificadas = catalogos.colmenas.filter(c => activaColmena(c) && c.apiario_id === (entidad === "movimiento" ? valores.origen_apiario_id : valores.apiario_id)).map(c => ({ value: c.id, label: c.codigo }));
  const base: Campo[] = [{ key: "campana_id", label: "Campaña", tipo: "select", requerido: true, opciones: campanas }, { key: "apiario_id", label: "Apiario", tipo: "select", requerido: true, opciones: apiarios }, { key: "fecha", label: "Fecha", tipo: "date", requerido: true }];
  if (entidad === "campana") return [
    { key: "nombre", label: "Nombre de campaña · ej. 2026/2027", requerido: true }, { key: "fecha_inicio", label: "Inicio", tipo: "date", requerido: true }, { key: "fecha_fin", label: "Fin", tipo: "date", requerido: true },
    { key: "estado", label: "Estado", tipo: "select", opciones: opciones({ abierta: "Abierta", cerrada: "Cerrada" }) }, { key: "observaciones", label: "Observaciones", tipo: "textarea" },
  ];
  if (entidad === "apiario") return [
    { key: "codigo", label: "Código", requerido: true }, { key: "nombre", label: "Nombre", requerido: true }, { key: "establecimiento", label: "Nombre del establecimiento" },
    { key: "direccion", label: "Ubicación / dirección" }, { key: "localidad", label: "Localidad" }, { key: "provincia", label: "Provincia" },
    { key: "latitud", label: "Latitud", tipo: "number", min: -90, max: 90, paso: "any" }, { key: "longitud", label: "Longitud", tipo: "number", min: -180, max: 180, paso: "any" },
    { key: "contacto", label: "Propietario o encargado" }, { key: "telefono", label: "Teléfono de contacto" }, { key: "uso", label: "Condición de uso", tipo: "select", opciones: opciones({ propio: "Propio", prestado: "Prestado", arrendado: "Arrendado", acuerdo: "Por acuerdo" }) },
    { key: "acuerdo", label: "Condiciones del acuerdo", tipo: "textarea" }, { key: "fecha_instalacion", label: "Instalación", tipo: "date" }, { key: "fecha_retiro", label: "Retiro previsto", tipo: "date" },
    { key: "floraciones", label: "Floraciones y calendario estimado", tipo: "textarea" }, { key: "agua_acceso", label: "Agua y accesibilidad", tipo: "textarea" },
    { key: "observaciones", label: "Observaciones", tipo: "textarea" }, { key: "activo", label: "Estado", tipo: "select", opciones: opciones({ true: "Activo", false: "Inactivo" }) },
  ];
  if (entidad === "colmena") return [base[1], { key: "codigo", label: "Identificación de colonia / colmena", requerido: true }, { key: "origen", label: "Origen", tipo: "select", opciones: opciones({ existente: "Existente sin identificar", compra: "Compra", nucleo: "Núcleo", enjambre: "Enjambre", division: "División", fusion: "Fusión" }) },
    { key: "fecha_alta", label: "Fecha de origen", tipo: "date" }, { key: "material_codigo", label: "Identificación del cajón/material", ayuda: "La identidad de la colonia se conserva al cambiar de material." },
    { key: "reina_identificacion", label: "Reina · identificación" }, { key: "reina_origen", label: "Reina · origen" }, { key: "reina_anio", label: "Reina · año", tipo: "number", min: 1900, max: 2200 },
    { key: "reina_marca", label: "Reina · marca" }, { key: "observaciones", label: "Observaciones", tipo: "textarea" }];
  if (entidad === "movimiento") {
    const tipo = valores.tipo, colonias = valores.recurso === "colonias", especiales = ["division", "fusion", "cambio_material"].includes(tipo);
    return [base[0], base[2], { key: "tipo", label: "Movimiento", tipo: "select", requerido: true, opciones: opciones({ alta: "Alta", baja: "Baja", traslado: "Traslado", division: "División", fusion: "Fusión", cambio_material: "Cambio de cajón / material" }) },
      ...(!especiales ? [{ key: "recurso", label: "Recurso", tipo: "select", opciones: opciones(recursosApicolas) } as Campo] : []),
      ...(tipo !== "alta" ? [{ ...base[1], key: "origen_apiario_id", label: "Apiario de origen" }] : []),
      ...(["alta", "traslado"].includes(tipo) ? [{ ...base[1], key: "destino_apiario_id", label: "Apiario de destino" }] : []),
      ...(!especiales ? [{ key: "cantidad", label: "Cantidad", tipo: "number", requerido: true, min: 1 } as Campo] : []),
      ...(colonias && tipo !== "alta" ? [{ key: "colmena_ids", label: "Colmenas identificadas involucradas", tipo: "multi", requerido: especiales, opciones: identificadas, ayuda: "En traslados y bajas, seleccioná las identificadas que participan. El resto de la cantidad se toma de colonias sin identificar." } as Campo] : []),
      ...(colonias && ["alta", "division", "fusion"].includes(tipo) ? [{ key: "codigos_nuevos", label: tipo === "fusion" ? "Código de la colonia resultante" : "Nuevos códigos · uno por línea (opcional en altas)", tipo: "textarea", requerido: tipo !== "alta" } as Campo] : []),
      ...(tipo === "alta" && colonias ? [{ key: "origen_colonias", label: "Origen de las colonias", tipo: "select", opciones: opciones({ compra: "Compra", nucleo: "Núcleos", enjambre: "Captura de enjambre", existente: "Existencias iniciales" }) } as Campo] : []),
      ...(tipo === "baja" && colonias ? [{ key: "estado_baja", label: "Motivo de baja", tipo: "select", opciones: opciones({ muerta: "Muerta", vendida: "Vendida", baja: "Otra baja" }) } as Campo] : []),
      ...(tipo === "cambio_material" ? [{ key: "material_codigo", label: "Identificación del material nuevo", requerido: true }] : []),
      { key: "motivo", label: "Motivo / detalle del movimiento", tipo: "textarea", requerido: true },
    ];
  }
  if (entidad === "tarea") return [...base, { key: "descripcion", label: "Tarea", tipo: "textarea", requerido: true }, { key: "responsable", label: "Responsable", requerido: true },
    { key: "prioridad", label: "Prioridad", tipo: "select", opciones: opciones({ baja: "Baja", normal: "Normal", alta: "Alta" }) }, { key: "estado", label: "Estado", tipo: "select", opciones: opciones({ pendiente: "Pendiente", hecha: "Hecha", cancelada: "Cancelada" }) }];
  const comunes: Campo[] = [...base, { key: "responsable", label: "Responsable", requerido: true }, { key: "alcance", label: "Alcance real del trabajo", tipo: "select", opciones: opciones({ grupo: "Grupo / revisión parcial", apiario: "Apiario completo", colmenas: "Colmenas identificadas" }) },
    ...(valores.alcance === "colmenas" ? [{ key: "colmena_ids", label: "Colmenas revisadas / alcanzadas", tipo: "multi", opciones: identificadas, requerido: true } as Campo] : []),
    { key: "cantidad", label: entidad === "visita" ? "Colonias efectivamente revisadas" : "Colonias alcanzadas", tipo: "number", requerido: true, min: entidad === "visita" ? 0 : 1 }];
  const detalles: Campo[] = entidad === "visita" ? [
    { key: "detalle_fortaleza", label: "Fortaleza", tipo: "select", opciones: opciones({ no_revisado: "No revisado", debil: "Débil", media: "Media", fuerte: "Fuerte" }) },
    { key: "detalle_reina", label: "Reina / indicios de postura", tipo: "select", opciones: opciones({ no_revisado: "No revisado", observada: "Observada", no_observada: "No observada" }) },
    { key: "detalle_cria", label: "Cría", tipo: "select", opciones: opciones({ no_revisado: "No revisado", normal: "Normal", irregular: "Irregular", ausente: "Ausente" }) },
    { key: "detalle_reservas", label: "Reservas de miel y polen", tipo: "select", opciones: opciones({ no_revisado: "No revisado", bajas: "Bajas", medias: "Medias", altas: "Altas" }) },
    { key: "detalle_cuadros", label: "Cuadros ocupados observados", tipo: "number", min: 0 }, { key: "detalle_alzas", label: "Alzas colocadas observadas", tipo: "number", min: 0 },
    { key: "detalle_labores", label: "Trabajos realizados", tipo: "multi", opciones: tareasVisita }, { key: "detalle_signos", label: "Signos sanitarios observados", tipo: "textarea" }, { key: "detalle_incidentes", label: "Enjambrazón, pillaje u otros incidentes", tipo: "textarea" },
  ] : entidad === "alimentacion" ? [
    { key: "detalle_alimento", label: "Alimento", requerido: true }, { key: "detalle_composicion", label: "Composición informada", tipo: "textarea" }, { key: "detalle_origen", label: "Origen", tipo: "select", opciones: opciones({ preparado: "Preparación propia", comprado: "Comprado" }) },
    { key: "detalle_cantidad", label: "Cantidad entregada", tipo: "number", requerido: true, min: 0.001, paso: "0.001" }, { key: "detalle_preparada", label: "Cantidad preparada (misma unidad)", tipo: "number", min: 0, paso: "0.001" },
    { key: "detalle_unidad", label: "Unidad", tipo: "select", opciones: opciones({ kg: "kg", litros: "Litros", unidades: "Unidades" }) }, { key: "detalle_motivo", label: "Motivo de alimentación", tipo: "textarea" },
  ] : [
    { key: "detalle_evento", label: "Evento sanitario", tipo: "select", opciones: opciones({ observacion: "Observación", tratamiento: "Tratamiento informado", seguimiento: "Seguimiento" }) },
    { key: "detalle_problema", label: "Problema observado / diagnóstico informado", requerido: true, tipo: "textarea" }, { key: "detalle_muestreo", label: "Método, fecha, muestra y resultado", tipo: "textarea" },
    { key: "detalle_producto", label: "Producto aplicado", requerido: valores.detalle_evento === "tratamiento" }, { key: "detalle_principio_activo", label: "Principio activo informado" }, { key: "detalle_lote", label: "Lote de producto" },
    { key: "detalle_vencimiento", label: "Vencimiento del producto", tipo: "date" }, { key: "detalle_cantidad", label: "Cantidad total aplicada", tipo: "number", min: 0.001, paso: "0.001", requerido: valores.detalle_evento === "tratamiento" },
    { key: "detalle_unidad", label: "Unidad aplicada", requerido: valores.detalle_evento === "tratamiento" }, { key: "detalle_inicio", label: "Inicio / aplicación", tipo: "date", requerido: valores.detalle_evento === "tratamiento" },
    { key: "detalle_retiro", label: "Retiro / seguimiento indicado", tipo: "date", ayuda: "Esta fecha genera un pendiente de agenda al confirmar el registro." }, { key: "detalle_indicaciones", label: "Indicaciones y restricciones documentadas", tipo: "textarea" },
  ];
  return [...comunes, ...detalles, { key: "observaciones", label: "Notas de la visita / registro", tipo: "textarea" }, { key: "proxima_fecha", label: "Próxima acción · fecha", tipo: "date" }, { key: "proxima_accion", label: "Próxima acción · detalle" },
    ...(admin ? [{ key: "estado", label: "Revisión del registro", tipo: "select", opciones: opciones({ pendiente: "Pendiente de confirmación", confirmado: "Confirmar al guardar" }) } as Campo] : [])];
}

export function ApicolaFormulario({ entidad, fila, catalogos, filtro, comercioId, admin, onGuardado }: {
  entidad: ApicolaEntidad; fila?: ApicolaFila; catalogos: ApicolaCatalogos; filtro: ApicolaFiltro; comercioId: string; admin: boolean; onGuardado: () => void;
}) {
  const defaults = valoresIniciales(entidad, fila, catalogos, filtro);
  const schema = z.record(z.string()).superRefine((values, ctx) => {
    for (const campo of campos(entidad, values, catalogos, admin)) {
      const value = values[campo.key]?.trim() || "";
      if (campo.requerido && !value) ctx.addIssue({ code: "custom", path: [campo.key], message: "Completá este dato" });
      if (value.length > 5000) ctx.addIssue({ code: "custom", path: [campo.key], message: "Máximo 5000 caracteres" });
      if (campo.tipo === "number" && value && (!Number.isFinite(Number(value)) || (campo.min !== undefined && Number(value) < campo.min) || (campo.max !== undefined && Number(value) > campo.max) || (!campo.paso && !Number.isInteger(Number(value))))) ctx.addIssue({ code: "custom", path: [campo.key], message: "Ingresá una cantidad válida" });
    }
  });
  const form = useForm<Record<string, string>>({ defaultValues: defaults, resolver: zodResolver(schema) });
  const valores = form.watch(), fields = campos(entidad, valores, catalogos, admin);
  const operacion = useApicolaOperar(comercioId);
  const intento = useRef<{ cuerpo: string; clave: string } | null>(null);
  const guardar = (values: Record<string, string>) => {
    const datos: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.key.startsWith("detalle_")) continue;
      datos[field.key] = field.tipo === "number" ? values[field.key] === "" || values[field.key] == null ? null : Number(values[field.key]) : values[field.key] || "";
    }
    if (fila) { datos.id = fila.id; datos.version = fila.version; }
    if (entidad === "apiario") datos.activo = values.activo === "true";
    if (entidad === "movimiento") {
      datos.colmena_ids = lista(values.colmena_ids || ""); datos.codigos_nuevos = lista(values.codigos_nuevos || "");
      datos.recurso = ["division", "fusion", "cambio_material"].includes(values.tipo) ? "colonias" : values.recurso;
    }
    if (["visita", "alimentacion", "sanidad"].includes(entidad)) {
      datos.tipo = entidad; datos.estado = admin ? values.estado : "pendiente"; datos.colmena_ids = values.alcance === "colmenas" ? lista(values.colmena_ids || "") : [];
      datos.datos = Object.fromEntries(fields.filter(field => field.key.startsWith("detalle_")).map(field => [field.key.slice(8), field.tipo === "multi" ? lista(values[field.key] || "") : values[field.key] || ""]));
    }
    const accion = ["visita", "alimentacion", "sanidad"].includes(entidad) ? "registro" : entidad;
    const cuerpo = JSON.stringify({ accion, datos });
    if (intento.current?.cuerpo !== cuerpo) intento.current = { cuerpo, clave: crypto.randomUUID() };
    operacion.mutate({ accion, datos, clave: intento.current.clave }, { onSuccess: onGuardado });
  };
  return <form onSubmit={form.handleSubmit(guardar)} className="space-y-5">
    {entidad === "colmena" && <p className="rounded-md bg-muted p-3 text-sm">Identificar una colonia existente no agrega existencias. Las altas, traslados, bajas y cambios de material se registran en Movimientos.</p>}
    {entidad === "visita" && <p className="rounded-md bg-muted p-3 text-sm">Indicá cuántas colonias revisaste realmente. Anotar trabajos no modifica existencias: los traslados, divisiones y bajas se registran por separado.</p>}
    <fieldset disabled={operacion.isPending} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {fields.map(field => {
        const id = `apicola-${field.key}`;
        return <div key={field.key} className={`min-w-0 space-y-2 ${["textarea", "multi"].includes(field.tipo || "") ? "sm:col-span-2" : ""}`}>
          <Label htmlFor={id}>{field.label}{field.requerido ? " *" : ""}</Label>
          {field.tipo === "multi" ? <div id={id} className="grid max-h-48 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">{field.opciones?.map(option => <label key={option.value} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={lista(valores[field.key] || "").includes(option.value)} onChange={event => {
            const seleccion = new Set(lista(valores[field.key] || "")); if (event.target.checked) seleccion.add(option.value); else seleccion.delete(option.value);
            form.setValue(field.key, [...seleccion].join(","), { shouldValidate: true }); if (field.key === "colmena_ids" && valores.alcance === "colmenas") form.setValue("cantidad", String(seleccion.size));
          }} />{option.label}</label>)}{!field.opciones?.length && <p className="text-sm text-muted-foreground">No hay colmenas identificadas disponibles en este apiario.</p>}</div>
            : field.tipo === "select" ? <select id={id} className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" {...form.register(field.key, { onChange: () => {
              if (["apiario_id", "origen_apiario_id", "alcance", "recurso"].includes(field.key)) form.setValue("colmena_ids", "");
              if (field.key === "tipo" && ["division", "fusion", "cambio_material"].includes(form.getValues("tipo"))) form.setValue("recurso", "colonias");
            } })}><option value="">Seleccionar...</option>{field.opciones?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
              : field.tipo === "textarea" ? <Textarea id={id} rows={3} maxLength={5000} {...form.register(field.key)} />
                : <Input id={id} className="h-11" type={field.tipo || "text"} min={field.min} max={field.max} step={field.tipo === "number" ? field.paso || "1" : undefined} {...form.register(field.key)} />}
          {field.ayuda && <p className="text-xs text-muted-foreground">{field.ayuda}</p>}
          {form.formState.errors[field.key] && <p role="alert" className="text-sm text-destructive">{form.formState.errors[field.key]?.message}</p>}
        </div>;
      })}
    </fieldset>
    {operacion.isError && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{operacion.error.message}</p>}
    <Button type="submit" disabled={operacion.isPending} className="min-h-11 w-full sm:w-auto">{operacion.isPending ? "Guardando..." : "Guardar registro"}</Button>
  </form>;
}
