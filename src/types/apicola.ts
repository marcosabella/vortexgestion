export type ApicolaEntidad = "campana" | "apiario" | "colmena" | "visita" | "alimentacion" | "sanidad" | "movimiento" | "tarea";
export type ApicolaFila = {
  id: string; comercio_id: string; version: number; creado_por: string; created_at: string; updated_at: string;
  [key: string]: unknown;
};
export type ApicolaCampana = ApicolaFila & { nombre: string; fecha_inicio: string; fecha_fin: string; estado: "abierta" | "cerrada" };
export type ApicolaApiario = ApicolaFila & { codigo: string; nombre: string; activo: boolean; localidad: string; latitud: number | null; longitud: number | null };
export type ApicolaColmena = ApicolaFila & { codigo: string; apiario_id: string; estado: string; material_codigo: string };
export type ApicolaExistencia = { comercio_id: string; apiario_id: string; recurso: string; cantidad: number };
export type ApicolaCatalogos = { campanas: ApicolaCampana[]; apiarios: ApicolaApiario[]; colmenas: ApicolaColmena[]; existencias: ApicolaExistencia[] };
export type ApicolaFiltro = { campana: string; apiario: string; desde: string; hasta: string };
export type ApicolaInforme = {
  visitas: number; revisiones: number; registros_pendientes: number; sanitarios: number;
  alimentacion: { unidad: string; cantidad: number }[];
  existencias: { apiario_id: string; recurso: string; cantidad: number }[];
  tareas_pendientes: number; tareas_vencidas: number;
};
export const recursosApicolas: Record<string, string> = { colonias: "Colonias", piso: "Pisos", camara: "Cámaras", alza: "Alzas", cuadro: "Cuadros", techo: "Techos", otro_material: "Otro material" };
export const vistasApicolas = [
  { vista: "fraccionado", titulo: "Fraccionado" }, { vista: "salidas", titulo: "Salidas comerciales" }, { vista: "devoluciones", titulo: "Devoluciones físicas" }, { vista: "caja", titulo: "Caja de campaña" },
  { vista: "costos", titulo: "Costos de campaña" }, { vista: "ingresos", titulo: "Ingresos asignados" }, { vista: "resultados", titulo: "Resultados económicos" },
  { vista: "salas", titulo: "Salas de extracción" }, { vista: "analisis", titulo: "Análisis y muestras" }, { vista: "stock", titulo: "Stock a granel" },
  { vista: "cosechas", titulo: "Cosechas" }, { vista: "extracciones", titulo: "Extracciones" }, { vista: "lotes", titulo: "Lotes de miel" }, { vista: "tambores", titulo: "Tambores" },
  { vista: "resumen", titulo: "Resumen" }, { vista: "campanas", titulo: "Campañas" }, { vista: "apiarios", titulo: "Apiarios" },
  { vista: "colmenas", titulo: "Colmenas y reinas" }, { vista: "visitas", titulo: "Visitas" }, { vista: "alimentacion", titulo: "Alimentación" },
  { vista: "sanidad", titulo: "Sanidad" }, { vista: "movimientos", titulo: "Existencias y movimientos" }, { vista: "agenda", titulo: "Agenda" }, { vista: "informes", titulo: "Informes" },
] as const;
export type ApicolaVista = typeof vistasApicolas[number]["vista"];
export const activaColmena = (colmena: ApicolaColmena) => ["activa", "nucleo", "huerfana"].includes(colmena.estado);
