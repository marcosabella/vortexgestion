import type { Incidente } from "@/types/incidente";

export interface IncidenteAgrupado extends Incidente {
  ocurrencias: Incidente[];
  primeraOcurrencia: string;
}

// El seguimiento y el usuario pueden variar entre apariciones del mismo error.
export function agruparIncidentes(incidentes: Incidente[]): IncidenteAgrupado[] {
  const grupos = new Map<string, IncidenteAgrupado>();
  const ordenados = [...incidentes].sort((a, b) =>
    b.creado_en.localeCompare(a.creado_en) || b.id.localeCompare(a.id));
  for (const incidente of ordenados) {
    const clave = JSON.stringify([
      incidente.comercio_id, incidente.modulo, incidente.origen,
      incidente.codigo || "", incidente.mensaje,
    ]);
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.ocurrencias.push(incidente);
      grupo.primeraOcurrencia = incidente.creado_en;
    } else {
      grupos.set(clave, { ...incidente, ocurrencias: [incidente], primeraOcurrencia: incidente.creado_en });
    }
  }
  return [...grupos.values()];
}
