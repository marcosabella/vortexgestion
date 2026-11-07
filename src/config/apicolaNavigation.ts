import { Activity, ArrowLeftRight, CalendarDays, ClipboardList, FileText, Hexagon, LayoutDashboard, MapPin, Sprout } from "lucide-react";
import { vistasApicolas, type ApicolaEntidad, type ApicolaVista } from "@/types/apicola";

type GrupoApicola = { key: string; titulo: string; etapa: number; vistas: ApicolaVista[] };
const grupos: GrupoApicola[] = [
  { key: "resumen", titulo: "Resumen", etapa: 1, vistas: ["resumen"] },
  { key: "base", titulo: "Base productiva", etapa: 1, vistas: ["campanas", "apiarios", "colmenas"] },
  { key: "cuaderno", titulo: "Cuaderno de campo", etapa: 1, vistas: ["visitas", "alimentacion", "sanidad"] },
  { key: "existencias", titulo: "Existencias y movimientos", etapa: 1, vistas: ["movimientos"] },
  { key: "agenda", titulo: "Agenda", etapa: 1, vistas: ["agenda"] },
  // Se incorporan rutas a estos grupos a medida que existan las funciones.
  { key: "produccion", titulo: "Producción y trazabilidad", etapa: 2, vistas: ["cosechas", "salas", "extracciones", "lotes", "tambores", "analisis", "fraccionado", "salidas", "devoluciones", "stock"] },
  { key: "economia", titulo: "Gestión económica", etapa: 3, vistas: ["costos", "ingresos", "caja", "resultados"] },
  { key: "especializaciones", titulo: "Especializaciones", etapa: 4, vistas: [] },
  { key: "informes", titulo: "Informes", etapa: 1, vistas: ["informes"] },
];
const iconos = { resumen: LayoutDashboard, campanas: CalendarDays, apiarios: MapPin, colmenas: Hexagon, visitas: ClipboardList, alimentacion: Sprout, sanidad: Activity, movimientos: ArrowLeftRight, agenda: CalendarDays, informes: FileText, cosechas: Sprout, extracciones: Activity, lotes: ClipboardList, tambores: Hexagon, salas: MapPin, analisis: Activity, stock: Hexagon, costos: ClipboardList, ingresos: ArrowLeftRight, resultados: LayoutDashboard, fraccionado: Hexagon, salidas: ArrowLeftRight, devoluciones: ArrowLeftRight, caja: LayoutDashboard };

export const apicolaGruposDisponibles = grupos.filter(grupo => grupo.vistas.length > 0).map(grupo => ({
  ...grupo,
  opciones: grupo.vistas.map(vista => ({ vista, titulo: vistasApicolas.find(item => item.vista === vista)!.titulo, url: `/apicola/${vista}`, icon: iconos[vista] })),
}));

export const apicolaAccionesRapidas: { entidad: ApicolaEntidad; vista: ApicolaVista; titulo: string; soloAdmin?: boolean }[] = [
  { entidad: "visita", vista: "visitas", titulo: "Registrar visita" },
  { entidad: "alimentacion", vista: "alimentacion", titulo: "Alimentación" },
  { entidad: "sanidad", vista: "sanidad", titulo: "Sanidad" },
  { entidad: "movimiento", vista: "movimientos", titulo: "Movimiento", soloAdmin: true },
  { entidad: "tarea", vista: "agenda", titulo: "Nueva tarea" },
];
