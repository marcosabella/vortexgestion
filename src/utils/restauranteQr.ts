import QRCode from "qrcode";
import { printHtml } from "@/utils/documentoPrint";

export const consultaTokenValido = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function restauranteConsultaUrl(qr: string, apertura?: string) {
  const url = new URL(`/carta/mesa/${qr}`, window.location.origin);
  // El secreto no viaja en URL de petición ni en Referer.
  if (apertura) url.hash = `apertura=${apertura}`;
  return url.href;
}
export async function restauranteQrImagen(url: string, comercio: string, mesa: string, apertura = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo generar la imagen del QR.");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827"; ctx.textAlign = "center";
  ctx.font = "bold 48px Arial"; ctx.fillText(comercio, 600, 115, 1080);
  ctx.font = "bold 68px Arial"; ctx.fillText(mesa, 600, 240, 1080);
  const qr = await QRCode.toDataURL(url, { width: 1000, margin: 4, errorCorrectionLevel: "M" });
  const img = new Image(); img.src = qr; await img.decode(); ctx.drawImage(img, 100, 300, 1000, 1000);
  ctx.font = "bold 40px Arial"; ctx.fillText(apertura ? "Consultá la carta y lo pedido" : "Escaneá para ver la carta", 600, 1330, 1080);
  ctx.font = "30px Arial"; ctx.fillText(apertura ? "Válido únicamente para esta apertura" : "Consultá los productos y sus precios", 600, 1400, 1080);
  return canvas.toDataURL("image/png");
}
export function descargarRestauranteQr(imagen: string, mesa: string) {
  const link = document.createElement("a"); link.href = imagen;
  link.download = `qr-${mesa.replace(/[^a-z0-9_-]+/gi, "-")}.png`; link.click();
}
export async function imprimirRestauranteQr(imagen: string) {
  await printHtml(`<!doctype html><html lang="es"><head><title>QR de mesa</title><style>@page{size:A4;margin:15mm}body{margin:0;text-align:center}img{width:100mm;max-width:100%;height:auto}</style></head><body><img src="${imagen}" alt="QR de mesa"></body></html>`);
}
