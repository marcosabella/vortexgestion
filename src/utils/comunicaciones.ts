import type { Json } from "@/integrations/supabase/types";

export function avisoCampanaVisible(programa?: { aviso_estado?: string } | null) {
  return Boolean(programa && (!programa.aviso_estado || programa.aviso_estado === "activo"));
}

export const mensajeCampanaPredeterminado = "Si un nuevo comercio contrata Vortex por tu recomendación y abona su primer mes, te bonificamos un mes de licencia.";
export const condicionesCampanaPredeterminadas = [
  "Compartí tu enlace. El interesado debe enviar la consulta con tu código antes de contratar.",
  "Cuando contrate y se confirme su primer pago, la administración validará la recomendación.",
  "Sumamos un mes a tu vencimiento vigente. Si ya venció, se cuenta desde la fecha de aplicación. Los meses pueden acumularse por nuevos comercios distintos.",
  "Un premio por comercio nuevo. No aplica a autorreferencias, altas duplicadas ni comercios existentes.",
  "La bonificación no es canjeable por dinero ni anula comprobantes ya emitidos.",
].join("\n");

export function metadataComunicacion(metadata?: Json): Record<string, Json | undefined> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}
