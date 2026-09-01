import type { Database } from "@/integrations/supabase/types";

type EstablecimientoRow = Database["public"]["Tables"]["campo_establecimientos"]["Row"];
type EstablecimientoInsert = Database["public"]["Tables"]["campo_establecimientos"]["Insert"];
type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

export type CampoEstablecimientoListItem = Pick<
  EstablecimientoRow,
  "id" | "nombre" | "codigo_interno" | "cliente_id" | "localidad" | "superficie_total_ha" | "activo"
> & {
  cliente: Pick<ClienteRow, "nombre" | "apellido"> | null;
};

export type CampoEstadoFilter = "activos" | "inactivos" | "todos";

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
