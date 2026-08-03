import { jsPDF } from "jspdf";

const output = "public/Informe_Factibilidad_Migracion_BDsiagro.pdf";
const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
const W = 210;
const H = 297;
const margin = 18;
const contentW = W - margin * 2;
let y = 20;

const colors = {
  navy: [25, 54, 85],
  blue: [38, 101, 145],
  pale: [235, 243, 248],
  text: [40, 47, 54],
  muted: [95, 105, 115],
  amber: [154, 95, 15],
  amberBg: [255, 247, 224],
};

function header() {
  doc.setFillColor(...colors.navy);
  doc.rect(0, 0, W, 10, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...colors.muted);
  doc.text("Sistema de Ventas Web — Evaluación de migración", margin, 15);
}

function footer() {
  const page = doc.getNumberOfPages();
  doc.setDrawColor(210, 215, 220);
  doc.line(margin, H - 15, W - margin, H - 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...colors.muted);
  doc.text("Documento de factibilidad — sin ejecución de importaciones", margin, H - 10);
  doc.text(`Página ${page}`, W - margin, H - 10, { align: "right" });
}

function newPage() {
  footer();
  doc.addPage();
  header();
  y = 24;
}

function ensure(space = 15) {
  if (y + space > H - 20) newPage();
}

function title(text) {
  ensure(18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...colors.navy);
  doc.text(text, margin, y);
  y += 9;
}

function subtitle(text) {
  ensure(13);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...colors.blue);
  doc.text(text, margin, y);
  y += 6;
}

function paragraph(text, options = {}) {
  const size = options.size ?? 9.5;
  const lines = doc.splitTextToSize(text, options.width ?? contentW);
  ensure(lines.length * 4.5 + 3);
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...(options.color ?? colors.text));
  doc.text(lines, options.x ?? margin, y, { lineHeightFactor: 1.35 });
  y += lines.length * size * 0.48 + (options.after ?? 4);
}

function bullets(items) {
  for (const item of items) {
    const lines = doc.splitTextToSize(item, contentW - 8);
    ensure(lines.length * 4.5 + 2);
    doc.setFillColor(...colors.blue);
    doc.circle(margin + 1.5, y - 1, 0.8, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.3);
    doc.setTextColor(...colors.text);
    doc.text(lines, margin + 6, y, { lineHeightFactor: 1.35 });
    y += lines.length * 4.6 + 2;
  }
  y += 2;
}

function note(text) {
  const lines = doc.splitTextToSize(text, contentW - 12);
  const boxH = lines.length * 4.6 + 9;
  ensure(boxH + 4);
  doc.setFillColor(...colors.amberBg);
  doc.setDrawColor(226, 186, 105);
  doc.roundedRect(margin, y, contentW, boxH, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.2);
  doc.setTextColor(...colors.amber);
  doc.text(lines, margin + 6, y + 6, { lineHeightFactor: 1.35 });
  y += boxH + 6;
}

function table(rows) {
  const widths = [62, 34, 78];
  const rowH = 8;
  ensure(rowH * 2);
  doc.setFillColor(...colors.navy);
  doc.rect(margin, y, contentW, rowH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  ["Origen Access", "Registros", "Destino probable"].forEach((v, i) => {
    const x = margin + widths.slice(0, i).reduce((a, b) => a + b, 0) + 3;
    doc.text(v, x, y + 5.3);
  });
  y += rowH;
  rows.forEach((row, index) => {
    ensure(rowH);
    if (index % 2 === 0) {
      doc.setFillColor(...colors.pale);
      doc.rect(margin, y, contentW, rowH, "F");
    }
    doc.setDrawColor(215, 220, 225);
    doc.rect(margin, y, contentW, rowH, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.4);
    doc.setTextColor(...colors.text);
    row.forEach((v, i) => {
      const x = margin + widths.slice(0, i).reduce((a, b) => a + b, 0) + 3;
      doc.text(String(v), x, y + 5.3);
    });
    y += rowH;
  });
  y += 7;
}

header();
doc.setFillColor(...colors.navy);
doc.rect(0, 0, W, 82, "F");
doc.setTextColor(255, 255, 255);
doc.setFont("helvetica", "bold");
doc.setFontSize(25);
doc.text("Informe de factibilidad", margin, 34);
doc.setFontSize(17);
doc.text("Migración de BDsiagro.mdb", margin, 47);
doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.text("Sistema de escritorio Access → Sistema de Ventas Web / Supabase", margin, 59);
doc.setFontSize(9);
doc.text("Evaluación local y de solo lectura — 31 de julio de 2026", margin, 70);
y = 101;
title("Conclusión ejecutiva");
paragraph("La migración es técnicamente factible, con complejidad media. Existe una correspondencia conceptual alta entre las principales entidades de Access y el modelo PostgreSQL/Supabase actual. Se recomienda comenzar por datos maestros y avanzar luego hacia operaciones e historial.");
note("ALCANCE DE ESTA EVALUACIÓN: no se importaron datos, no se consultó ni modificó Supabase y no se alteraron los datos del comercio EUFORIA.");
subtitle("Nivel de factibilidad");
bullets([
  "Alta: clientes, proveedores, marcas, rubros, productos, ventas y detalle de ventas.",
  "Media: pagos, cuenta corriente, comprobantes, IVA, cheques y movimientos históricos.",
  "Requiere definición funcional: compras y entidades del escritorio sin módulo equivalente en el sistema web.",
]);
subtitle("Principio de seguridad");
paragraph("Toda prueba futura debe realizarse en un comercio independiente asociado a demo@demo.com. El usuario no debe usarse como identificador de destino: la importación debe apuntar a un comercio_id explícito, verificado como distinto del comercio EUFORIA.");

newPage();
title("1. Inventario y correspondencias");
paragraph("El archivo Access contiene 47 tablas. Los volúmenes principales son manejables para una migración controlada:");
table([
  ["Clientes", "2.330", "clientes"],
  ["Proveedores", "39", "proveedores"],
  ["Marca", "47", "marcas"],
  ["Rubro", "28", "rubros"],
  ["Articulos", "4.810", "productos"],
  ["Ventas", "1.397", "ventas"],
  ["Detalle_Venta", "4.237", "venta_items"],
  ["Pagos", "785", "cuenta_corriente / pagos"],
  ["Cheques", "13", "cheques"],
  ["Tarjetas", "1", "tarjetas_credito"],
]);
subtitle("Diferencias que deben resolverse");
bullets([
  "Identificadores numéricos de Access frente a UUID en PostgreSQL.",
  "Nombres de campos, tipos de datos y campos obligatorios diferentes.",
  "Fechas almacenadas como texto y descuentos o recargos con formatos no normalizados.",
  "Representación distinta de pagos, cuenta corriente, IVA y comprobantes.",
  "Posibles referencias históricas a clientes o productos eliminados.",
  "Operaciones de compras sin una equivalencia completa en el sistema actual.",
]);

title("2. Aislamiento del comercio EUFORIA");
paragraph("El sistema posee comercio_id en las tablas comerciales, relación comercio_usuarios, políticas RLS por comercio y validaciones para impedir referencias cruzadas. Esta base es adecuada, pero una herramienta administrativa podría utilizar credenciales capaces de omitir RLS.");
note("El importador debe exigir un único comercio_id de destino y rechazar expresamente el UUID de EUFORIA. No debe depender solamente de RLS.");
paragraph("Antes de una prueba se debe confirmar que demo@demo.com tiene un comercio independiente, que no pertenece a EUFORIA y que todas las filas de la ejecución reciben exclusivamente ese comercio_id.");

title("3. Riesgo inmediato del archivo MDB");
paragraph("El archivo está ubicado en public. En una aplicación Vite, los archivos de esa carpeta pueden copiarse al sitio compilado y quedar disponibles mediante una URL. La base contiene datos personales, ventas, pagos y una tabla de usuarios con un campo de contraseña.");
note("Recomendación urgente: sacar BDsiagro.mdb de public antes del próximo despliegue. Las contraseñas del sistema anterior no deben migrarse; los accesos deberán gestionarse mediante Supabase Auth.");

newPage();
title("4. Plan gradual recomendado");
subtitle("Fase 0 — Seguridad y entorno aislado");
bullets([
  "Retirar el MDB del árbol público y trabajar siempre sobre una copia.",
  "Usar Supabase local o un proyecto de staging, no producción.",
  "Crear un comercio exclusivo de migración asociado a demo@demo.com.",
  "Registrar los UUID de DEMO y EUFORIA y bloquear EUFORIA como destino.",
]);
subtitle("Fase 1 — Perfilado sin importar");
paragraph("Generar un informe de tablas, columnas, nulos, duplicados, relaciones rotas, fechas y números inválidos, ventas sin referencias y diferencias entre totales almacenados y calculados.");
subtitle("Fase 2 — Mapeo funcional");
paragraph("Clasificar cada campo como migración directa, transformación, valor predeterminado, no migrable o pendiente de una decisión comercial. Definir el alcance entre maestros, saldos vigentes, historial e información sin módulo equivalente.");
subtitle("Fase 3 — Área intermedia y simulación");
paragraph("No insertar directamente desde Access en las tablas definitivas. El flujo recomendado es: Access → extracción → staging → validaciones → tablas finales.");
bullets([
  "Identificador de ejecución migration_run_id.",
  "Conservación del ID original de Access y mapa hacia UUID.",
  "Registro de errores por fila y modo simulación.",
  "Ejecución repetible sin duplicados y transacciones por etapa.",
]);
subtitle("Fase 4 — Prueba con demo@demo.com");
paragraph("Orden sugerido: rubros, marcas y proveedores; productos; clientes; bancos y tarjetas; ventas; detalles; pagos, cuenta corriente y cheques; y finalmente stock o saldos iniciales.");
paragraph("Después de cada bloque se compararán conteos y relaciones, se revisarán muestras desde la aplicación y se comprobará que EUFORIA conserve exactamente sus conteos y totales previos.");

newPage();
title("5. Validación y puesta en marcha");
subtitle("Fase 5 — Ensayo completo y conciliación");
bullets([
  "Cantidad de registros por tabla y comercio.",
  "Total de ventas por período y conciliación con sus detalles.",
  "Stock por producto y saldos por cliente.",
  "Registros rechazados con su motivo.",
  "Confirmación verificable de cero modificaciones en EUFORIA.",
]);
subtitle("Fase 6 — Migración real por cliente");
bullets([
  "Copia de seguridad de Access y Supabase.",
  "Cierre controlado del sistema de escritorio y extracción final.",
  "Simulación, revisión y aprobación del informe.",
  "Importación transaccional y conciliación posterior.",
  "Período de convivencia con el sistema anterior en modo consulta.",
]);
title("6. Próximo paso recomendado");
paragraph("Construir únicamente el informe detallado de compatibilidad y el diccionario de mapeo Access → Supabase. Esta próxima etapa todavía debe ejecutarse sin conectarse a producción y sin insertar datos.");
note("DECISIÓN RECOMENDADA: avanzar con una prueba de concepto aislada. La arquitectura actual permite la migración, siempre que el comercio de destino sea explícito, exista staging y se implementen controles independientes para proteger EUFORIA.");

footer();
const pages = doc.getNumberOfPages();
for (let i = 1; i <= pages; i++) {
  doc.setPage(i);
  doc.setProperties({
    title: "Informe de factibilidad - Migración BDsiagro",
    subject: "Evaluación gradual de migración Access a Supabase",
    author: "Sistema de Ventas Web",
  });
}
doc.save(output);
console.log(`PDF generado: ${output} (${pages} páginas)`);
