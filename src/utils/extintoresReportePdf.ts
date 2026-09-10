import { Extintor } from "@/hooks/useExtintores";
import { Comercio } from "@/types/comercio";
import { buildReportePdfFile, PrintableSection } from "@/utils/listadoVentasPdf";

const fecha = (valor?: string | null) => valor ? valor.split("-").reverse().join("/") : "-";
export const buildExtintoresReportePdfFile = (extintores: Extintor[], comercio?: Comercio | null) => {
  const columns = [
    { key: "cliente", label: "Cliente", x: 24, width: 190, align: "left" as const },
    { key: "numero", label: "Número / Serie", x: 214, width: 80, align: "left" as const },
    { key: "marca", label: "Marca / Clase", x: 294, width: 100, align: "left" as const },
    { key: "sector", label: "Sector", x: 394, width: 70, align: "left" as const },
    { key: "recarga", label: "Próx. recarga", x: 464, width: 62, align: "center" as const },
    { key: "vencimiento", label: "Vencimiento", x: 526, width: 62, align: "center" as const },
  ];
  const sections: PrintableSection[] = [{ title: "Detalle de extintores", columns, rows: extintores.map((item) => ({ cliente: `${item.cliente?.nombre || ""} ${item.cliente?.apellido || ""}`.trim(), numero: `${item.numero_extintor} / ${item.numero_serie}`, marca: `${item.marca?.nombre || "-"} / ${item.clase?.nombre || "-"}`, sector: item.sector || "-", recarga: fecha(item.fecha_proxima_recarga), vencimiento: fecha(item.fecha_vencimiento) })) }];
  return buildReportePdfFile(sections, { comercio, rango: `${extintores.length} extintores según filtros`, titulo: "REPORTE DE EXTINTORES" });
};
