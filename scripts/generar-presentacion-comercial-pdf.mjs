import { jsPDF } from "jspdf";
import fs from "node:fs";

const output = "public/Presentacion_Comercial_Sistema_Ventas_Web.pdf";
const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const W = 210, H = 297, M = 17;
const C = { navy:[10,24,48], blue:[45,105,255], aqua:[24,194,176], violet:[124,76,240], ink:[26,37,57], muted:[92,107,130], pale:[244,247,251], line:[224,231,240], white:[255,255,255] };
const logoPath = "public/logo.png";
const logo = fs.existsSync(logoPath) ? fs.readFileSync(logoPath).toString("base64") : null;
const fill = c => doc.setFillColor(...c), stroke = c => doc.setDrawColor(...c), tc = c => doc.setTextColor(...c);
function text(v,x,y,s=10,style="normal",color=C.ink,opt={}) { doc.setFont("helvetica",style); doc.setFontSize(s); tc(color); doc.text(v,x,y,opt); }
function para(v,x,y,w,s=9,color=C.muted,lh=1.3) { doc.setFont("helvetica","normal"); doc.setFontSize(s); tc(color); const a=doc.splitTextToSize(v,w); doc.text(a,x,y,{lineHeightFactor:lh}); return y+a.length*s*.36*lh; }
function round(x,y,w,h,r=4,color=C.white) { fill(color); doc.roundedRect(x,y,w,h,r,r,"F"); }
function label(v,x,y,color=C.blue,w=19) { round(x,y,w,8,4,color); text(v,x+w/2,y+5.7,6.8,"bold",C.white,{align:"center"}); }
function header(page,eyebrow,title,intro) {
  fill(C.white); doc.rect(0,0,W,H,"F"); fill(C.navy); doc.rect(0,0,W,7,"F"); fill(C.blue); doc.rect(0,7,70,2,"F"); fill(C.aqua); doc.rect(70,7,30,2,"F");
  text(eyebrow.toUpperCase(),M,23,8,"bold",C.blue);
  const titleLines=doc.splitTextToSize(title,170); doc.setFont("helvetica","bold"); doc.setFontSize(21); tc(C.navy); doc.text(titleLines,M,37,{lineHeightFactor:1.08});
  const titleBottom=37+(titleLines.length-1)*8.2;
  para(intro,M,titleBottom+14,174,10.5,C.muted,1.35);
  stroke(C.line); doc.line(M,276,W-M,276); text("VORTEX · Sistema de Ventas Web",M,285,7.2,"normal",C.muted); text(`${page}/5`,W-M,285,7.2,"bold",C.muted,{align:"right"});
}
function moduleCard(x,y,w,h,code,title,body,accent=C.blue) {
  round(x,y,w,h,4,C.pale); fill(accent); doc.roundedRect(x,y,3,h,1.5,1.5,"F"); label(code,x+8,y+7,accent,code.length>2?23:19);
  text(title,x+8,y+22,10.5,"bold",C.navy); para(body,x+8,y+32,w-16,8.25,C.muted,1.24);
}
function compactBenefit(x,y,w,num,title,body,accent=C.blue) {
  label(num,x,y,accent,17); text(title,x+22,y+5.8,9.2,"bold",C.navy); para(body,x+22,y+13,w-22,7.8,C.muted,1.2);
}
function screenshot(path,x,y,w,h,caption) {
  const data=fs.readFileSync(path).toString("base64");
  round(x-2,y-2,w+4,h+10,4,C.pale);
  fill(C.navy); doc.roundedRect(x-2,y-2,w+4,7,4,4,"F");
  fill([255,95,87]); doc.circle(x+3,y+1.5,1.1,"F"); fill([255,189,46]); doc.circle(x+7,y+1.5,1.1,"F"); fill([39,201,63]); doc.circle(x+11,y+1.5,1.1,"F");
  doc.addImage(`data:image/jpeg;base64,${data}`,"JPEG",x,y+5,w,h);
  text(caption,x,y+h+9,7.2,"bold",C.muted);
}
const next=()=>doc.addPage("a4","portrait");

// 1 · Portada
fill(C.navy); doc.rect(0,0,W,H,"F"); fill(C.blue); doc.circle(190,14,56,"F"); fill(C.aqua); doc.circle(7,292,46,"F");
round(M,20,34,34,8,[17,38,72]); if(logo) doc.addImage(`data:image/png;base64,${logo}`,"PNG",M+5,25,24,24); text("VORTEX",59,42,15,"bold",C.white);
text("SISTEMA DE VENTAS WEB",M,87,9,"bold",C.aqua); text("Gestión inteligente",M,115,27,"bold",C.white); text("para comercios",M,143,27,"bold",C.white);
para("Ventas, stock, caja, cuentas corrientes y reportes integrados en una plataforma web clara, segura y adaptable.",M,166,158,13,[204,214,228],1.4);
round(M,215,176,42,7,C.white); text("UNA SOLUCIÓN INTEGRAL",29,230,8,"bold",C.blue); para("Centralizá la operación diaria, ganá control y convertí los datos de tu negocio en mejores decisiones.",29,242,150,9.3,C.ink,1.28);
text("Marcos Abella · Analista de Sistemas",M,281,8.5,"bold",C.white);

// 2 · Núcleo comercial
next(); header(2,"Operación comercial","Del presupuesto a la venta, con todo conectado","Un circuito simple para cotizar, vender, cobrar y consultar cada operación.");
screenshot("public/capturas-presentacion/02-ventas.jpg",M,76,176,98,"Vista real · Gestión de ventas");
moduleCard(M,190,55,72,"01","Ventas","Detalle completo de productos, precios, impuestos, descuentos y formas de pago.");
moduleCard(77.5,190,55,72,"02","Presupuestos","Propuestas editables que pueden convertirse en ventas sin recargar datos.",C.aqua);
moduleCard(138,190,55,72,"03","Comprobantes","Consulta, edición e impresión con una presentación profesional.",C.violet);

// 3 · Gestión y finanzas
next(); header(3,"Gestión y control","Stock, clientes y finanzas en una misma plataforma","La información comercial se conecta con caja, cobranzas y medios de pago para ofrecer una visión completa.");
screenshot("public/capturas-presentacion/03-productos.jpg",M,76,84,47,"Productos y stock");
screenshot("public/capturas-presentacion/04-cuenta-corriente.jpg",109,76,84,47,"Cuenta corriente");
moduleCard(M,144,86,52,"01","Productos y stock","Costos, precios, moneda, IVA, utilidad, rubros, marcas, proveedores y existencias.");
moduleCard(107,144,86,52,"02","Clientes y saldos","Datos fiscales, historial, débitos, créditos, pagos y estados de cuenta.",C.aqua);
moduleCard(M,204,86,52,"03","Caja diaria","Aperturas, ingresos, egresos, cierres y control de diferencias.",C.violet);
moduleCard(107,204,86,52,"04","Medios de pago","Efectivo, tarjetas, cuotas, cheques, bancos y pagos combinados.");

// 4 · Información, seguridad y continuidad
next(); header(4,"Información para decidir","Reportes claros y una plataforma adaptable","Indicadores visuales para comprender el negocio, acompañados por seguridad y continuidad operativa.");
screenshot("public/capturas-presentacion/05-reporte-ventas.jpg",M,76,176,98,"Vista real · Reporte de ventas e indicadores");
moduleCard(M,190,55,72,"01","Indicadores","Ventas, ticket promedio, rankings, stock, caja y saldos.");
moduleCard(77.5,190,55,72,"02","Seguridad","Usuarios autenticados, datos separados y módulos configurables.",C.aqua);
moduleCard(138,190,55,72,"03","Migración","Análisis, simulación y carga controlada desde bases Access.",C.violet);

// 5 · Beneficios + propuesta + contacto
next(); header(5,"Una inversión en organización","Beneficios concretos para tu comercio","Una herramienta pensada para reducir tareas administrativas, mejorar la atención y disponer de información confiable cuando se necesita.");
text("VALOR PARA EL NEGOCIO",M,82,8,"bold",C.blue);
compactBenefit(M,91,84,"01","Menos tareas repetitivas","Información centralizada y sin controles dispersos.");
compactBenefit(107,91,86,"02","Más trazabilidad","Ventas, cobros y movimientos siempre registrados.",C.aqua);
compactBenefit(M,120,84,"03","Decisiones informadas","Indicadores claros sobre ventas, stock y saldos.",C.violet);
compactBenefit(107,120,86,"04","Imagen profesional","Comprobantes y reportes listos para compartir.");
compactBenefit(M,149,84,"05","Acceso web","Información disponible desde equipos autorizados.",C.aqua);
compactBenefit(107,149,86,"06","Crecimiento ordenado","Módulos que acompañan nuevas necesidades.",C.violet);
round(M,184,176,37,6,C.navy); text("IMPLEMENTACIÓN ACOMPAÑADA",28,198,8,"bold",C.aqua); para("Relevamiento inicial, configuración según el comercio, carga o migración de datos y acompañamiento para comenzar a operar.",28,209,154,9,C.white,1.25);
round(M,232,176,36,6,C.pale);
fill(C.blue); doc.roundedRect(M,232,5,36,3,3,"F");
text("HABLEMOS DE TU COMERCIO",M+13,243,7.5,"bold",C.blue);
text("Marcos Abella",M+13,256,13,"bold",C.navy);
text("Analista de Sistemas",M+13,264,8.2,"normal",C.muted);
round(126,240,58,10,5,C.white); stroke(C.line); doc.roundedRect(126,240,58,10,5,5,"S");
text("Cel. 3583 - 430176",155,246.5,8.7,"bold",C.blue,{align:"center"});
round(126,253,58,9,4.5,C.navy);
text("Jovita  Córdoba",155,259,8,"bold",C.white,{align:"center"});

doc.setProperties({title:"Presentación comercial — VORTEX",subject:"Sistema de Ventas Web",author:"Marcos Abella — Analista de Sistemas",creator:"VORTEX"});
doc.save(output); console.log(`PDF comercial generado: ${output} (${doc.getNumberOfPages()} páginas)`);
