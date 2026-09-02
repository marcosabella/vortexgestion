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
