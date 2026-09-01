import type { Database } from "@/integrations/supabase/types";

type EstablecimientoRow = Database["public"]["Tables"]["campo_establecimientos"]["Row"];
type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

export type CampoEstablecimientoListItem = Pick<
  EstablecimientoRow,
  "id" | "nombre" | "codigo_interno" | "cliente_id" | "localidad" | "superficie_total_ha" | "activo"
> & {
  cliente: Pick<ClienteRow, "nombre" | "apellido"> | null;
};

export type CampoEstadoFilter = "activos" | "inactivos" | "todos";
