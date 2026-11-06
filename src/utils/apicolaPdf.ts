import { format } from "date-fns";
import type { Comercio } from "@/types/comercio";
import { recursosApicolas, type ApicolaCatalogos, type ApicolaFiltro, type ApicolaInforme } from "@/types/apicola";
import { buildReportePdfFile, type PrintableSection } from "@/utils/listadoVentasPdf";

const columnasResumen = [
  { key: "concepto", label: "Concepto", x: 24, width: 330, align: "left" as const },
  { key: "valor", label: "Cantidad", x: 354, width: 234, align: "right" as const },
];
const numero = (value: number) => Number(value).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const fecha = (value: string) => value ? format(new Date(`${value}T12:00:00`), "dd/MM/yyyy") : "Sin límite";
// El generador común usa filas de altura fija: dividir los textos evita recortarlos.
const lineas = (text: string, maximo: number): string[] => {
  const resultado: string[] = []; let actual = "";
  for (const palabra of text.split(/\s+/).filter(Boolean)) {
    if (actual && actual.length + palabra.length + 1 > maximo) { resultado.push(actual); actual = ""; }
    let resto = palabra;
    while (resto.length > maximo) { resultado.push(resto.slice(0, maximo)); resto = resto.slice(maximo); }
    actual = actual ? `${actual} ${resto}` : resto;
  }
  if (actual) resultado.push(actual);
  return resultado.length ? resultado : ["—"];
};

export async function informeApicolaPdf(informe: ApicolaInforme, catalogos: ApicolaCatalogos, filtro: ApicolaFiltro, comercio: Comercio) {
  const campana = catalogos.campanas.find(c => c.id === filtro.campana)?.nombre || "Todas las campañas";
  const apiario = catalogos.apiarios.find(a => a.id === filtro.apiario);
  const filtros = [["Campaña", campana], ["Apiario", apiario ? `${apiario.codigo} - ${apiario.nombre}` : "Todos los apiarios"], ["Desde", fecha(filtro.desde)], ["Hasta", fecha(filtro.hasta)]];
  const sections: PrintableSection[] = [
    { title: "Filtros aplicados", columns: [
      { key: "filtro", label: "Filtro", x: 24, width: 126, align: "left" },
      { key: "detalle", label: "Detalle", x: 150, width: 438, align: "left" },
    ], rows: filtros.flatMap(([filtroNombre, value]) => lineas(value, 100).map((detalle, index) => ({ filtro: index ? "" : filtroNombre, detalle }))) },
    { title: "Actividad confirmada del período", columns: columnasResumen, rows: [
      { concepto: "Visitas confirmadas", valor: numero(informe.visitas) },
      { concepto: "Colonias revisadas (acumulado)", valor: numero(informe.revisiones) },
      { concepto: "Registros sanitarios confirmados", valor: numero(informe.sanitarios) },
      { concepto: "Registros pendientes de confirmación", valor: numero(informe.registros_pendientes) },
      { concepto: "Tareas pendientes", valor: numero(informe.tareas_pendientes) },
      { concepto: "Tareas vencidas", valor: numero(informe.tareas_vencidas) },
    ] },
    { title: "Alimentación confirmada", columns: [
      { key: "concepto", label: "Unidad", x: 24, width: 330, align: "left" },
      { key: "valor", label: "Cantidad entregada", x: 354, width: 234, align: "right" },
    ], rows: informe.alimentacion.length ? informe.alimentacion.map(item => ({ concepto: item.unidad, valor: numero(item.cantidad) })) : [{ concepto: "Sin alimentación confirmada en el período", valor: "—" }] },
    { title: "Existencias actuales (todas las campañas)", columns: [
      { key: "apiario", label: "Apiario", x: 24, width: 300, align: "left" },
      { key: "recurso", label: "Recurso", x: 324, width: 150, align: "left" },
      { key: "cantidad", label: "Cantidad", x: 474, width: 114, align: "right" },
    ], rows: informe.existencias.length ? informe.existencias.flatMap(item => {
      const a = catalogos.apiarios.find(row => row.id === item.apiario_id);
      return lineas(a ? `${a.codigo} - ${a.nombre}` : "Apiario", 68).map((apiarioNombre, index) => ({ apiario: apiarioNombre, recurso: index ? "" : recursosApicolas[item.recurso] || item.recurso, cantidad: index ? "" : numero(item.cantidad) }));
    }) : [{ apiario: "Sin existencias registradas", recurso: "—", cantidad: "—" }] },
    { title: "Criterios de lectura", columns: [{ key: "nota", label: "Observaciones", x: 24, width: 564, align: "left" }], rows: [
      "Las revisiones acumuladas pueden incluir varias visitas a una misma colonia; no representan cobertura única.",
      "Las existencias son actuales y abarcan todas las campañas. Los filtros de período afectan la actividad registrada.",
      "La alimentación se totaliza por unidad: no se suman kilogramos con litros.",
    ].flatMap(text => lineas(text, 128).map(nota => ({ nota }))) },
  ];
  const rango = filtro.desde || filtro.hasta ? `${fecha(filtro.desde)} al ${fecha(filtro.hasta)}` : "Todos los períodos";
  const file = await buildReportePdfFile(sections, { comercio, rango, titulo: "INFORME APÍCOLA" });
  return new File([file], `Cuaderno_Apicola_${format(new Date(), "yyyyMMdd")}.pdf`, { type: "application/pdf" });
}
