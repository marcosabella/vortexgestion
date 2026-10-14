import type { Comercio } from "@/types/comercio";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const ajusteNombreScript = `<script data-vortex-autoajuste>(function () {
  if (window.vortexAjustarNombresComercio) { window.vortexAjustarNombresComercio(); return; }
  function ajustar() {
    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (!ctx) return;
    document.querySelectorAll('.comercio-nombre[data-autoajustar]').forEach(function (el) {
      var style = getComputedStyle(el), base = Number(el.dataset.fontBase) || parseFloat(style.fontSize);
      var disponible = el.getBoundingClientRect().width;
      if (!disponible || !base) return;
      el.dataset.fontBase = String(base);
      ctx.font = style.fontWeight + ' ' + base + 'px ' + style.fontFamily;
      var texto = style.textTransform === 'uppercase' ? el.textContent.toLocaleUpperCase() : el.textContent;
      var ancho = ctx.measureText(texto).width + (parseFloat(style.letterSpacing) || 0) * Math.max(texto.length - 1, 0);
      var size = Math.min(base, base * Math.max(disponible - 2, 1) / Math.max(ancho, 1));
      el.style.fontSize = size.toFixed(2) + 'px';
    });
  }
  window.vortexAjustarNombresComercio = ajustar;
  document.addEventListener('DOMContentLoaded', ajustar);
  window.addEventListener('load', ajustar);
  window.addEventListener('beforeprint', ajustar);
  window.addEventListener('resize', ajustar);
  if (document.fonts) document.fonts.ready.then(ajustar);
  ajustar();
})();</script>`;

export const telefonoComercio = (comercio?: Comercio | null) => {
  const telefono = comercio?.telefono?.trim() || "";
  return /[\p{L}\p{N}]/u.test(telefono) ? telefono : "";
};

export function tamanoNombreComercioPdf(nombre: string, ancho: number, base: number) {
  const context = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (context) context.font = `bold ${base}px Arial`;
  const medida = context ? context.measureText(nombre).width : nombre.length * base * 0.7;
  return Math.min(base, (ancho - 2) * base / Math.max(medida, 1));
}

export function identidadComercioHtml(comercio?: Comercio | null, fallback = "COMERCIO") {
  const nombre = escape(comercio?.nombre_comercio?.trim() || fallback);
  const logo = comercio?.logo_url?.trim();
  const mostrarNombre = !logo || comercio?.mostrar_razon_social_con_logo === true;
  return `<div class="${logo && mostrarNombre ? "comercio-identidad-completa" : "comercio-identidad"}">${logo ? `<img class="comercio-logo" src="${escape(logo)}" alt="Logo de ${nombre}" />` : ""}${mostrarNombre ? `<div class="comercio-nombre" data-autoajustar style="white-space:nowrap;overflow-wrap:normal">${nombre}</div>` : ""}</div>${mostrarNombre ? ajusteNombreScript : ""}`;
}

export function telefonoComercioHtml(comercio?: Comercio | null) {
  const telefono = telefonoComercio(comercio);
  return telefono ? `<div class="info-line">Teléfono: ${escape(telefono)}</div>` : "";
}
