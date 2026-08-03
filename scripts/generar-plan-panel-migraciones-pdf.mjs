import { jsPDF } from "jspdf";

const doc = new jsPDF({ unit: "mm", format: "a4" });
const output = "public/Plan_Panel_Administrador_Migraciones.pdf";
const M = 18, W = 210, H = 297, CW = W - M * 2;
const navy = [25, 54, 85], blue = [38, 101, 145], text = [42, 48, 55], muted = [100, 108, 116];
let y = 22;

function header() {
  doc.setFillColor(...navy); doc.rect(0, 0, W, 10, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted);
  doc.text("Sistema de Ventas Web — Plan de migraciones", M, 15);
}
function footer() {
  doc.setDrawColor(215, 220, 225); doc.line(M, H - 15, W - M, H - 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted);
  doc.text("Migración modular de Access a Supabase", M, H - 10);
  doc.text(`Página ${doc.getNumberOfPages()}`, W - M, H - 10, { align: "right" });
}
function page() { footer(); doc.addPage(); header(); y = 24; }
function ensure(h = 14) { if (y + h > H - 20) page(); }
function h1(s) { ensure(18); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...navy); doc.text(s, M, y); y += 9; }
function h2(s) { ensure(13); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(...blue); doc.text(s, M, y); y += 6; }
function p(s, bold = false) {
  const lines = doc.splitTextToSize(s, CW); ensure(lines.length * 4.7 + 4);
  doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(9.5); doc.setTextColor(...text);
  doc.text(lines, M, y, { lineHeightFactor: 1.35 }); y += lines.length * 4.6 + 4;
}
function list(items) {
  for (const s of items) {
    const lines = doc.splitTextToSize(s, CW - 8); ensure(lines.length * 4.6 + 3);
    doc.setFillColor(...blue); doc.circle(M + 1.5, y - 1, 0.75, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.3); doc.setTextColor(...text);
    doc.text(lines, M + 6, y, { lineHeightFactor: 1.35 }); y += lines.length * 4.5 + 2;
  }
  y += 2;
}
function callout(s) {
  const lines = doc.splitTextToSize(s, CW - 12), bh = lines.length * 4.6 + 9; ensure(bh + 5);
  doc.setFillColor(235, 243, 248); doc.setDrawColor(170, 202, 220); doc.roundedRect(M, y, CW, bh, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.2); doc.setTextColor(...navy);
  doc.text(lines, M + 6, y + 6, { lineHeightFactor: 1.35 }); y += bh + 6;
}
function flow(items) {
  items.forEach((s, i) => {
    ensure(13); doc.setFillColor(...(i === items.length - 1 ? blue : navy)); doc.roundedRect(M + 28, y, CW - 56, 9, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.8); doc.setTextColor(255, 255, 255); doc.text(s, W / 2, y + 5.8, { align: "center" }); y += 11;
    if (i < items.length - 1) { doc.setDrawColor(...blue); doc.line(W / 2, y - 2, W / 2, y + 1); y += 3; }
  }); y += 4;
}

header();
doc.setFillColor(...navy); doc.rect(0, 0, W, 83, "F");
doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(24);
doc.text("Plan del panel administrador", M, 33); doc.setFontSize(17); doc.text("Migraciones por tablas y comercio", M, 47);
doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.text("Carga controlada de bases Access y migración modular", M, 60);
doc.setFontSize(9); doc.text("Documento de arquitectura funcional — 31 de julio de 2026", M, 71);
y = 102;
h1("Conclusión ejecutiva");
p("El enfoque propuesto es correcto y escalable: cada archivo Access se vincula desde el inicio a un comercio registrado y el administrador decide qué módulos migrar. Esto permite incorporar distintos clientes aunque el sistema web no implemente todas las funciones del sistema de escritorio.");
callout("Unidad de control recomendada: archivo + comercio + módulo + ejecución. La selección del comercio debe ser obligatoria antes de cargar o analizar la base.");
h2("Objetivos principales");
list([
  "Migrar únicamente las tablas compatibles con el sistema web.",
  "Reutilizar el procedimiento para distintos comercios.",
  "Evitar cualquier contaminación de datos entre comercios.",
  "Permitir simulaciones, validaciones y reintentos sin duplicados.",
  "Mantener trazabilidad completa de cada operación administrativa.",
]);

page(); h1("1. Flujo desde el panel administrador");
flow(["Seleccionar comercio", "Subir archivo MDB", "Analizar estructura", "Elegir módulos", "Ejecutar simulación", "Confirmar importación", "Emitir informe"]);
p("La pantalla debe mostrar permanentemente el comercio de destino. Para las primeras pruebas, EUFORIA debería estar bloqueado como destino y utilizarse un comercio independiente asociado a demo@demo.com.");
h2("Identidad de la migración");
list([
  "comercio_id de destino y administrador que inició el proceso.",
  "Nombre, tamaño y hash del archivo para detectar repeticiones.",
  "Fecha, estado y vencimiento del archivo temporal.",
  "Identificador único migration_id utilizado en todas las etapas.",
]);
h1("2. Carga privada del archivo");
p("El MDB no debe almacenarse en public ni exponerse mediante una URL. El panel debe cargarlo en almacenamiento privado, separado por comercio y ejecución.");
callout("Ruta sugerida: migraciones/{comercio_id}/{migration_id}/origen.mdb");
list([
  "Acceso exclusivo para administradores autorizados.",
  "Validación de extensión, tamaño y hash.",
  "Eliminación automática después de un período definido.",
  "Prohibición de registrar datos personales en logs.",
]);
h2("Procesamiento");
p("El navegador no debe convertir directamente la base. Se necesita un servicio privado de migraciones: Windows con Microsoft Access Database Engine, o un contenedor compatible con MDB. El servicio extraerá los datos hacia staging y no escribirá directamente en las tablas comerciales.");

page(); h1("3. Migración modular por tablas");
p("El panel mostrará los módulos detectados, su compatibilidad, cantidad de registros, dependencias, errores y estado de importación.");
h2("Primera versión recomendada");
list([
  "Rubros: Rubro → rubros.", "Marcas: Marca → marcas.", "Proveedores: Proveedores → proveedores.",
  "Productos: Articulos → productos.", "Clientes: Clientes → clientes.",
]);
h2("Segunda etapa");
list([
  "Bancos y tarjetas.", "Ventas y detalle de ventas.", "Pagos y cuenta corriente.", "Cheques.", "Stock y saldos iniciales.",
]);
h2("Módulos no disponibles");
p("Las tablas sin funcionalidad equivalente, como determinadas operaciones de compras, deben aparecer como “No disponibles”. Se conservarán en el archivo histórico, pero no se forzará su inserción en un modelo incompatible.");
h1("4. Dependencias y orden");
callout("Rubros + Marcas + Proveedores → Productos | Clientes → Ventas → Detalles | Bancos + Tarjetas → Pagos y Cheques");
p("El sistema debe bloquear un módulo cuando falten sus dependencias o permitir incorporar automáticamente dichas dependencias después de la confirmación del administrador.");

page(); h1("5. Control interno y staging");
h2("Entidades de control");
list([
  "migraciones: proceso general, comercio, archivo, usuario, estado y fechas.",
  "migracion_modulos: resultado individual de cada tabla o módulo.",
  "migracion_id_map: equivalencias entre el ID original de Access y el UUID de Supabase.",
  "staging_*: filas extraídas, validación, source_id y detalle de errores.",
]);
h2("Estados sugeridos");
p("subido → analizando → listo → importando → completado / completado con errores / fallido / cancelado");
h2("Características obligatorias");
list([
  "Modo simulación sin escritura definitiva.", "Errores detallados por fila.", "Importación repetible sin crear duplicados.",
  "Transacciones por módulo.", "Totales de insertados, actualizados, omitidos y rechazados.",
]);
h1("6. Tratamiento de duplicados");
p("La primera versión nunca debe eliminar ni reemplazar masivamente datos existentes. Debe insertar, omitir o presentar casos ambiguos para revisión.");
list([
  "Productos: coincidencia por código dentro del mismo comercio.",
  "Clientes: coincidencia preferente por CUIT; no únicamente por nombre.",
  "Conservar el ID de Access como referencia técnica de migración.",
  "Definir por módulo si las coincidencias se omiten o actualizan.",
]);

page(); h1("7. Protección entre comercios");
p("Cada etapa debe validar simultáneamente la pertenencia de la migración, staging, equivalencias, registros finales y referencias relacionadas al mismo comercio_id.");
callout("La función final debe recibir migration_id, no un comercio_id libre. El servidor obtiene el comercio desde la migración registrada y rechaza cualquier inconsistencia.");
list([
  "Bloqueo explícito de EUFORIA durante las pruebas.",
  "Comprobación de que demo@demo.com pertenece a un comercio independiente.",
  "Validaciones de referencias dentro del mismo comercio.",
  "Comparación de conteos y totales de otros comercios antes y después.",
  "Auditoría del administrador, fecha, módulo y resultado.",
]);
h1("8. Implementación gradual");
h2("Etapa inicial");
p("Construir carga privada, análisis del MDB, staging, simulación y migración de maestros. Esta etapa valida la arquitectura completa con bajo riesgo.");
h2("Etapa operativa");
p("Agregar ventas, detalles, pagos y saldos una vez estabilizadas las equivalencias, dependencias y reglas de conciliación.");
h2("Criterio de aprobación");
p("Un módulo queda completado cuando coinciden los conteos esperados, no existen referencias cruzadas y el informe confirma cero modificaciones en comercios ajenos a la ejecución.");
callout("Próximo paso recomendado: diseñar el modelo de migraciones y una pantalla de análisis sin implementar todavía la escritura en producción.");

footer();
doc.setProperties({ title: "Plan del panel administrador de migraciones", subject: "Migraciones Access por tablas y comercio", author: "Sistema de Ventas Web" });
doc.save(output);
console.log(`PDF generado: ${output} (${doc.getNumberOfPages()} páginas)`);
