import type { Database } from "@/integrations/supabase/types";

type EstablecimientoRow = Database["public"]["Tables"]["campo_establecimientos"]["Row"];
type EstablecimientoInsert = Database["public"]["Tables"]["campo_establecimientos"]["Insert"];
type LoteRow = Database["public"]["Tables"]["campo_lotes"]["Row"];
type LoteInsert = Database["public"]["Tables"]["campo_lotes"]["Insert"];
type LoteUpdate = Database["public"]["Tables"]["campo_lotes"]["Update"];
type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];
type OrdenTrabajoRow = Database["public"]["Tables"]["campo_ordenes_trabajo"]["Row"];
type OrdenTrabajoInsert = Database["public"]["Tables"]["campo_ordenes_trabajo"]["Insert"];
type OrdenTrabajoUpdate = Database["public"]["Tables"]["campo_ordenes_trabajo"]["Update"];
type OrdenLaborRow = Database["public"]["Tables"]["campo_orden_labores"]["Row"];
type OrdenLaborInsert = Database["public"]["Tables"]["campo_orden_labores"]["Insert"];
type OrdenLaborUpdate = Database["public"]["Tables"]["campo_orden_labores"]["Update"];
type OrdenLaborLoteRow = Database["public"]["Tables"]["campo_orden_labor_lotes"]["Row"];
type OrdenLaborLoteInsert = Database["public"]["Tables"]["campo_orden_labor_lotes"]["Insert"];
type OrdenLaborLoteUpdate = Database["public"]["Tables"]["campo_orden_labor_lotes"]["Update"];
type OperarioRow = Database["public"]["Tables"]["campo_operarios"]["Row"];
type MaquinariaRow = Database["public"]["Tables"]["campo_maquinarias"]["Row"];
type InsumoRow = Database["public"]["Tables"]["campo_insumos"]["Row"];
type ParteRow = Database["public"]["Tables"]["campo_partes_trabajo"]["Row"];

export type CampoEstablecimientoListItem = Pick<
  EstablecimientoRow,
  | "id"
  | "nombre"
  | "codigo_interno"
  | "cliente_id"
  | "direccion"
  | "localidad"
  | "provincia"
  | "superficie_total_ha"
  | "contacto_nombre"
  | "contacto_telefono"
  | "observaciones"
  | "activo"
> & {
  cliente: Pick<ClienteRow, "nombre" | "apellido"> | null;
};

export type CampoEstadoFilter = "activos" | "inactivos" | "todos";

export type CampoOperario = Pick<OperarioRow, "id" | "nombre" | "codigo_interno" | "documento" | "telefono" | "observaciones" | "activo" | "created_at" | "updated_at">;
export type CampoMaquinaria = Pick<MaquinariaRow, "id" | "nombre" | "codigo_interno" | "tipo" | "marca" | "modelo" | "identificacion" | "anio" | "observaciones" | "activo" | "created_at" | "updated_at">;
export type CampoInsumo = Pick<InsumoRow, "id" | "nombre" | "codigo_interno" | "unidad" | "observaciones" | "activo" | "created_at" | "updated_at">;
export type CampoOperarioFormValues = { nombre: string; codigo_interno: string; documento: string; telefono: string; observaciones: string };
export type CampoMaquinariaFormValues = { nombre: string; codigo_interno: string; tipo: string; marca: string; modelo: string; identificacion: string; anio: string; observaciones: string };
export type CampoInsumUnidad = "litro" | "kilogramo" | "tonelada" | "unidad" | "bolsa" | "metro" | "dosis";
export type CampoInsumoFormValues = { nombre: string; codigo_interno: string; unidad: CampoInsumUnidad; observaciones: string };
export type CampoParteEstado = "borrador" | "enviado" | "rechazado" | "confirmado" | "anulado" | "descartado";
export type CampoParte = Pick<ParteRow, "id"|"orden_id"|"orden_labor_id"|"numero"|"estado"|"fecha_trabajo"|"hora_inicio"|"hora_fin"|"descripcion"|"observaciones"|"condiciones_climaticas"|"propietario_user_id"|"propietario_operario_id"|"enviado_at"|"rechazado_at"|"motivo_rechazo"|"confirmado_at"|"anulado_at"|"motivo_anulacion"|"descartado_at"|"motivo_descarte"|"created_at"|"updated_at"> & {
  estado: CampoParteEstado;
  labor: { nombre:string; codigo_interno:string|null; unidad:string; activo:boolean }|null;
  propietario_operario: { nombre: string; codigo_interno: string | null } | null;
};
export type CampoParteFormValues={orden_labor_id:string;fecha_trabajo:string;hora_inicio:string;hora_fin:string;descripcion:string;observaciones:string;condiciones_climaticas:string};

export type CampoPartePermissions = {
  canEditParte: boolean;
  canSendParte: boolean;
  canReopenParte: boolean;
  canDiscardParte: boolean;
  canConfirmParte: boolean;
  canRejectParte: boolean;
  canAnnulParte: boolean;
};

export function getCampoPartePermissions(parte: CampoParte, access: { isAdmin: boolean; isOperador: boolean; operadorVinculado: boolean; userId: string | null }): CampoPartePermissions {
  const propietarioOperador = access.isOperador && access.operadorVinculado && parte.propietario_user_id === access.userId;
  const administrable = access.isAdmin || propietarioOperador;
  return {
    canEditParte: parte.estado === "borrador" && administrable,
    canSendParte: parte.estado === "borrador" && administrable,
    canReopenParte: parte.estado === "rechazado" && administrable,
    canDiscardParte: (parte.estado === "borrador" || parte.estado === "rechazado") && administrable,
    canConfirmParte: parte.estado === "enviado" && access.isAdmin,
    canRejectParte: parte.estado === "enviado" && access.isAdmin,
    canAnnulParte: parte.estado === "confirmado" && access.isAdmin,
  };
}

export const CAMPO_PARTE_ESTADOS: CampoParteEstado[] = ["borrador", "enviado", "rechazado", "confirmado", "anulado", "descartado"];
export const CAMPO_PARTE_ESTADO_LABEL: Record<CampoParteEstado, string> = {
  borrador: "Borrador", enviado: "Enviado", rechazado: "Rechazado",
  confirmado: "Confirmado", anulado: "Anulado", descartado: "Descartado",
};

export type CampoOrdenEstado =
  | "borrador"
  | "planificada"
  | "en_progreso"
  | "finalizada"
  | "cancelada";

export type CampoOrdenEstadoFilter = CampoOrdenEstado | "todas";

export type CampoOrdenListItem = Pick<
  OrdenTrabajoRow,
  | "id"
  | "numero"
  | "codigo_interno"
  | "estado"
  | "fecha_inicio_planificada"
  | "fecha_fin_planificada"
  | "descripcion"
  | "cliente_id"
  | "establecimiento_id"
  | "created_at"
> & {
  cliente: Pick<ClienteRow, "nombre" | "apellido"> | null;
  establecimiento: Pick<EstablecimientoRow, "nombre"> | null;
};

export type CampoOrdenFormValues = {
  cliente_id: string;
  establecimiento_id: string;
  codigo_interno: string;
  fecha_inicio_planificada: string;
  fecha_fin_planificada: string;
  descripcion: string;
  observaciones: string;
};

export type CampoOrdenCreatePayload = Pick<
  OrdenTrabajoInsert,
  | "comercio_id"
  | "cliente_id"
  | "establecimiento_id"
  | "codigo_interno"
  | "fecha_inicio_planificada"
  | "fecha_fin_planificada"
  | "descripcion"
  | "observaciones"
>;

export type CampoOrdenCreateParams = Omit<CampoOrdenCreatePayload, "comercio_id">;

export type CampoOrdenDetail = Pick<
  OrdenTrabajoRow,
  | "id"
  | "numero"
  | "codigo_interno"
  | "estado"
  | "cliente_id"
  | "establecimiento_id"
  | "fecha_inicio_planificada"
  | "fecha_fin_planificada"
  | "descripcion"
  | "observaciones"
  | "iniciada_at"
  | "finalizada_at"
  | "cancelada_at"
  | "created_at"
  | "updated_at"
> & {
  cliente: Pick<ClienteRow, "nombre" | "apellido"> | null;
  establecimiento: Pick<EstablecimientoRow, "nombre" | "activo"> | null;
};

export type CampoOrdenUpdatePayload = Required<Pick<
  OrdenTrabajoUpdate,
  | "cliente_id"
  | "establecimiento_id"
  | "codigo_interno"
  | "fecha_inicio_planificada"
  | "fecha_fin_planificada"
  | "descripcion"
  | "observaciones"
>>;

export type CampoOrdenUpdateParams = {
  ordenId: string;
  payload: CampoOrdenUpdatePayload;
};

export type CampoOrdenTransitionState = "borrador" | "planificada" | "finalizada" | "cancelada";
export type CampoOrdenStatusParams = {
  estadoActual: CampoOrdenEstado;
  nuevoEstado: CampoOrdenTransitionState;
  motivo?: string | null;
};

export type CampoOrdenLaborUnidad = "ha" | "hora" | "km" | "tonelada" | "unidad" | "fijo";

export type CampoOrdenLaborListItem = Pick<
  OrdenLaborRow,
  | "id"
  | "orden_id"
  | "nombre"
  | "codigo_interno"
  | "descripcion"
  | "unidad"
  | "posicion"
  | "activo"
  | "created_at"
  | "updated_at"
>;

export type CampoOrdenLaborFormValues = {
  nombre: string;
  codigo_interno: string;
  descripcion: string;
  unidad: CampoOrdenLaborUnidad;
  posicion: string;
};

export type CampoOrdenLaborCreatePayload = Pick<
  OrdenLaborInsert,
  "comercio_id" | "orden_id" | "nombre" | "codigo_interno" | "descripcion" | "unidad" | "posicion"
>;

export type CampoOrdenLaborCreateParams = Omit<CampoOrdenLaborCreatePayload, "comercio_id" | "orden_id">;

export type CampoOrdenLaborUpdatePayload = Required<Pick<
  OrdenLaborUpdate,
  "nombre" | "codigo_interno" | "descripcion" | "unidad" | "posicion"
>>;

export type CampoOrdenLaborUpdateParams = { laborId: string; payload: CampoOrdenLaborUpdatePayload };
export type CampoOrdenLaborStatusPayload = Required<Pick<OrdenLaborUpdate, "activo">>;
export type CampoOrdenLaborStatusParams = { laborId: string; nuevoEstado: boolean };

export type CampoOrdenLaborLoteListItem = Pick<
  OrdenLaborLoteRow,
  | "id"
  | "orden_labor_id"
  | "lote_id"
  | "cantidad_planificada"
  | "observaciones"
  | "activo"
  | "created_at"
  | "updated_at"
> & {
  lote: Pick<LoteRow, "nombre" | "codigo_interno" | "superficie_ha" | "activo" | "establecimiento_id"> | null;
};

export type CampoOrdenLaborLoteFormValues = {
  lote_id: string;
  cantidad_planificada: string;
  observaciones: string;
};

export type CampoOrdenLaborLoteCreatePayload = Pick<
  OrdenLaborLoteInsert,
  "comercio_id" | "orden_labor_id" | "lote_id" | "cantidad_planificada" | "observaciones"
>;

export type CampoOrdenLaborLoteCreateParams = Omit<
  CampoOrdenLaborLoteCreatePayload,
  "comercio_id" | "orden_labor_id"
>;

export type CampoOrdenLaborLoteUpdatePayload = Required<Pick<
  OrdenLaborLoteUpdate,
  "cantidad_planificada" | "observaciones"
>>;

export type CampoOrdenLaborLoteUpdateParams = {
  asignacionId: string;
  loteId: string;
  payload: CampoOrdenLaborLoteUpdatePayload;
};

export type CampoOrdenLaborLoteStatusPayload = Required<Pick<OrdenLaborLoteUpdate, "activo">>;
export type CampoOrdenLaborLoteStatusParams = { asignacionId: string; loteId: string; nuevoEstado: boolean };

export type CampoEstablecimientoDetail = Pick<
  EstablecimientoRow,
  "id" | "nombre" | "codigo_interno" | "activo"
> & {
  cliente: Pick<ClienteRow, "nombre" | "apellido"> | null;
};

export type CampoLoteListItem = Pick<
  LoteRow,
  "id" | "nombre" | "codigo_interno" | "superficie_ha" | "observaciones" | "activo"
>;

export type CampoLoteFormValues = {
  nombre: string;
  codigo_interno: string;
  superficie_ha: string;
  observaciones: string;
  activo: boolean;
};

export type CampoLoteCreatePayload = Pick<
  LoteInsert,
  | "comercio_id"
  | "establecimiento_id"
  | "nombre"
  | "codigo_interno"
  | "superficie_ha"
  | "observaciones"
  | "activo"
>;

export type CampoLoteCreateParams = Omit<
  CampoLoteCreatePayload,
  "comercio_id" | "establecimiento_id"
>;

export type CampoLoteEditFormValues = CampoLoteFormValues;

export type CampoLoteUpdatePayload = Required<Pick<
  LoteUpdate,
  "nombre" | "codigo_interno" | "superficie_ha" | "observaciones" | "activo"
>>;

export type CampoLoteUpdateParams = {
  loteId: string;
  payload: CampoLoteUpdatePayload;
};

export type CampoLoteStatusPayload = Required<Pick<LoteUpdate, "activo">>;

export type CampoLoteStatusParams = {
  loteId: string;
  nuevoEstado: boolean;
};

export type CampoClienteOption = Pick<ClienteRow, "id" | "nombre" | "apellido" | "tipo_persona">;

export type CampoEstablecimientoCreatePayload = Pick<
  EstablecimientoInsert,
  | "comercio_id"
  | "cliente_id"
  | "nombre"
  | "codigo_interno"
  | "direccion"
  | "localidad"
  | "provincia"
  | "superficie_total_ha"
  | "contacto_nombre"
  | "contacto_telefono"
  | "observaciones"
  | "activo"
>;

export type CampoEstablecimientoUpdatePayload = Pick<
  EstablecimientoRow,
  | "cliente_id"
  | "nombre"
  | "codigo_interno"
  | "direccion"
  | "localidad"
  | "provincia"
  | "superficie_total_ha"
  | "contacto_nombre"
  | "contacto_telefono"
  | "observaciones"
  | "activo"
>;

export type CampoEstablecimientoUpdateParams = {
  establecimientoId: string;
  payload: CampoEstablecimientoUpdatePayload;
};

export type CampoEstablecimientoStatusParams = {
  establecimientoId: string;
  nuevoEstado: boolean;
};
