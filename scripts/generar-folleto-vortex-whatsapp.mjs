import fs from 'node:fs';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

// Material comercial breve, con texto vectorial y enlaces para compartir por WhatsApp.
const output = 'public/VORTEX_Gestion_y_Taller_Presentacion_Comercial.pdf';
const contact = process.env.VORTEX_CONTACT_PHONE || '5493583430176';
const contactLabel = process.env.VORTEX_CONTACT_LABEL || '3583 430176';
const whatsapp = `https://wa.me/${contact}?text=${encodeURIComponent('Hola Marcos. Me interesa conocer Vortex y coordinar una demostración para evaluar su implementación en mi empresa.')}`;
const pdf = new jsPDF({ unit: 'mm', format: [180, 270], compress: true });
const W = 180, H = 270, M = 14;
const C = { navy: '#071E49', blue: '#0065D9', cyan: '#00B4ED', pale: '#EEF6FC', ink: '#142B47', muted: '#52657A', line: '#D4E4F0', white: '#FFFFFF' };
const logo = fs.readFileSync('public/logo.png').toString('base64');
const qr = await QRCode.toDataURL(whatsapp, { width: 220, margin: 1, color: { dark: C.navy, light: C.white } });
const textRecords = [];
function box(x, y, w, h, color, radius = 0) {
  pdf.setFillColor(color);
  if (radius) pdf.roundedRect(x, y, w, h, radius, radius, 'F');
  else pdf.rect(x, y, w, h, 'F');
}
function text(value, x, y, size = 12, color = C.ink, weight = 'normal', opts = {}) {
  pdf.setFont('helvetica', weight); pdf.setFontSize(size); pdf.setTextColor(color);
  const lines = Array.isArray(value) ? value : [value];
  const lineHeight = size * 0.352778 * (opts.lineHeightFactor || 1.2);
  const bottom = y + (lines.length - 1) * lineHeight;
  if (x < 0 || x > W || y < 0 || bottom > H - 5) throw new Error(`Texto fuera de página: ${lines.join(' ')}`);
  for (const line of lines) {
    if (!opts.align && x + pdf.getTextWidth(line) > W - 8) throw new Error(`Texto demasiado ancho: ${line}`);
  }
  textRecords.push({ page: pdf.getNumberOfPages(), text: lines.join(' '), x, y, bottom });
  pdf.text(value, x, y, opts);
  return bottom;
}
function para(value, x, y, width, size = 11.5, color = C.muted, weight = 'normal') {
  pdf.setFont('helvetica', weight); pdf.setFontSize(size);
  const lines = pdf.splitTextToSize(value, width);
  return text(lines, x, y, size, color, weight, { lineHeightFactor: 1.3 });
}
function brand(x = M, y = 13, width = 78) {
  // Recorta el espacio blanco alrededor del logo sin alterar el archivo original.
  const scale = width / 1250;
  pdf.saveGraphicsState();
  pdf.rect(x, y, width, 465 * scale, null); pdf.clip(); pdf.discardPath();
  pdf.addImage(`data:image/png;base64,${logo}`, 'PNG', x - 149 * scale, y - 248 * scale, 1536 * scale, 1024 * scale, 'vortex-logo', 'FAST');
  pdf.restoreGraphicsState();
}
function footer(page, dark = false) {
  const color = dark ? '#C1D9ED' : C.muted;
  pdf.setDrawColor(dark ? '#254367' : C.line); pdf.setLineWidth(0.3); pdf.line(M, 251, W - M, 251);
  text('VORTEX · Tu negocio en movimiento', M, 260, 8.5, color);
  text(`${page} / 4`, W - M, 260, 8.5, color, 'bold', { align: 'right' });
}
function page(number, eyebrow, headline, intro) {
  pdf.addPage([W, H]); box(0, 0, W, H, C.white);
  brand(M, 11, 60); box(138, 18, 28, 7, C.pale, 3);
  text('GESTIÓN WEB', 152, 22.7, 7.5, C.blue, 'bold', { align: 'center' });
  text(eyebrow, M, 47, 9.5, C.blue, 'bold');
  text(headline, M, 61, 22, C.navy, 'bold', { lineHeightFactor: 1.1 });
  para(intro, M, 83, 152, 11.5);
  footer(number);
}
function feature(y, number, title, description, dark = false) {
  box(M, y, 152, 35, dark ? '#123461' : C.pale, 3);
  box(M + 5, y + 6, 12, 12, dark ? C.cyan : C.blue, 3);
  text(number, M + 11, y + 14.1, 10.5, dark ? C.navy : C.white, 'bold', { align: 'center' });
  text(title, M + 22, y + 10.5, 12.5, dark ? C.white : C.navy, 'bold');
  para(description, M + 22, y + 18, 121, 10.5, dark ? '#D2E4F4' : C.muted);
}

// 1. Captar atención y explicar el beneficio antes que las funciones.
box(0, 0, W, H, C.navy);
box(0, 0, W, 58, C.white); brand(M, 12, 102);
box(144, 0, 36, 3, C.cyan); box(0, 58, 68, 2, C.cyan);
text('VORTEX GESTIÓN', M, 77, 10, C.cyan, 'bold');
text(['Gestión integral.', 'Control operativo.'], M, 97, 29, C.white, 'bold', { lineHeightFactor: 1.12 });
para('Plataforma web para la administración de ventas, inventario, caja y clientes, con un nuevo módulo integrado para talleres.', M, 129, 148, 14, '#D2E4F4');
box(M, 164, 152, 29, C.white, 4);
text('Información centralizada.', M + 8, 176, 15, C.navy, 'bold');
text('Trazabilidad de las operaciones.', M + 8, 186, 13, C.blue, 'bold');
text('NUEVO MÓDULO · VORTEX TALLER', M, 208, 10.5, C.cyan, 'bold');
para('Gestión del circuito de recepción, diagnóstico, presupuesto, facturación y cobranza, con historial por vehículo.', M, 220, 148, 12, C.white);
text('Soluciones para la gestión comercial y operativa.', M, 244, 9, '#D2E4F4');
footer(1, true);

// 2. Funciones reales del núcleo administrativo, agrupadas por uso.
page(2, 'ADMINISTRACIÓN COMERCIAL Y FINANCIERA', ['Gestión comercial', 'con trazabilidad.'], 'Centralización de los procesos administrativos, con registros vinculados e información disponible para el control operativo.');
feature(103, '01', 'Ventas y presupuestos', 'Emisión de presupuestos, conversión a ventas y registro de cobranzas mediante múltiples medios de pago.');
feature(142, '02', 'Inventario, compras y proveedores', 'Administración de existencias, costos y precios. Gestión de proveedores, compras y reposición de mercadería.');
feature(181, '03', 'Caja y cuentas corrientes', 'Registro de ingresos, egresos y cierres de caja. Consulta de saldos e imputación de pagos de clientes y proveedores.');
para('Funciones complementarias: reportes de ventas e inventario, bancos, tarjetas, cheques y facturación electrónica mediante ARCA, previa configuración fiscal.', M, 229, 152, 10.5, C.ink);

// 3. Taller: mostrar el circuito y qué resuelve cada etapa.
page(3, 'NUEVO · VORTEX TALLER', ['Trazabilidad del vehículo', 'y de cada intervención.'], 'Módulo para talleres mecánicos y lubricentros, integrado con la administración comercial.');
feature(103, '01', 'Recepción e identificación', 'Localización por patente o titular. Registro de kilometraje, motivo de ingreso y condiciones de recepción.');
feature(142, '02', 'Diagnóstico y presupuesto', 'Asignación de técnico, detalle de repuestos y mano de obra, y registro de la aprobación del cliente.');
feature(181, '03', 'Facturación y cobranza', 'Seguimiento del estado de la orden, generación de la venta y registro del cobro o del saldo en cuenta corriente.');
para('Incluye agenda de turnos, historial de intervenciones, registro de próximos servicios y orden de trabajo imprimible con espacio para conformidad del cliente.', M, 229, 152, 10.5, C.ink);

// 4. Beneficios de uso, contacto accionable y propuesta sin precios inventados.
page(4, 'PLATAFORMA MODULAR PARA EMPRESAS', ['Administración integrada.', 'Operación centralizada.'], 'Vortex Gestión combina el núcleo administrativo con módulos específicos para Taller, Campo y Extintores.');
text('Acceso desde el navegador', M, 107, 13, C.navy, 'bold');
para('Operación desde computadoras, tablets y dispositivos móviles con conexión a internet y usuarios autorizados.', M, 116, 150, 11.5);
text('Integración de registros', M, 137, 13, C.navy, 'bold');
para('Uso compartido de clientes, productos, presupuestos y ventas entre módulos para reducir la duplicación de datos.', M, 146, 150, 11.5);
box(M, 167, 152, 74, C.navy, 4);
text('Solicite una demostración', M + 7, 180, 18, C.white, 'bold');
para('Evaluación de la operatoria y propuesta de implementación según la actividad y los módulos requeridos.', M + 7, 191, 113, 11, '#D2E4F4');
box(M + 7, 207, 109, 13, C.cyan, 3);
text('SOLICITAR DEMO POR WHATSAPP', M + 61.5, 215.4, 10.5, C.navy, 'bold', { align: 'center' });
pdf.link(M + 7, 207, 109, 13, { url: whatsapp });
pdf.addImage(qr, 'PNG', 140, 207, 21, 21, 'whatsapp-qr', 'FAST');
pdf.link(140, 207, 21, 21, { url: whatsapp });
text(`Marcos Abella · ${contactLabel}`, M + 7, 229, 11, C.white, 'bold');
text('Analista de Sistemas · Jovita, Córdoba', M + 7, 237, 9.5, '#D2E4F4');
text('Funciones y módulos según la configuración contratada.', M, 247, 8, C.muted);

pdf.setProperties({ title: 'VORTEX | Gestión comercial y Taller', subject: 'Presentación comercial para comercios y talleres', author: 'Marcos Abella · VORTEX', creator: 'VORTEX' });
pdf.save(output);
console.log(JSON.stringify({ output, pages: pdf.getNumberOfPages(), bytes: fs.statSync(output).size, textBlocks: textRecords.length, whatsapp }, null, 2));
