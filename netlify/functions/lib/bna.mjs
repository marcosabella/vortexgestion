export const BNA_FUENTE = "https://www.bna.com.ar/Personas";
const texto = value => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
function importe(value) {
  const limpio = texto(value);
  if (!/^\d+(?:\.\d{3})*,\d{2}$/.test(limpio)) throw new Error("Importe BNA inválido.");
  const numero = Number(limpio.replaceAll(".", "").replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) throw new Error("Importe BNA inválido.");
  return numero;
}
export function parsearBilletesBna(html) {
  // Se limita la lectura a Billetes: nunca se usa la tabla Divisas como reemplazo.
  const bloque = html.match(/<div\b[^>]*\bid=["']billetes["'][^>]*>([\s\S]*?)<div\b[^>]*\bid=["']divisas["']/i)?.[1];
  const tabla = bloque?.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  const cabecera = tabla?.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1];
  const titulos = [...(cabecera || "").matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => texto(m[1]));
  if (titulos.length !== 3 || titulos[1] !== "Compra" || titulos[2] !== "Venta") throw new Error("La tabla de billetes BNA cambió de formato.");
  const partes = titulos[0].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!partes) throw new Error("Fecha BNA inválida.");
  const fecha = partes[3]+"-"+partes[2].padStart(2,"0")+"-"+partes[1].padStart(2,"0");
  if (new Date(fecha+"T12:00:00Z").toISOString().slice(0,10) !== fecha) throw new Error("Fecha BNA inválida.");
  const hora = bloque.match(/Hora\s+Actualizaci[oó]n:\s*(\d{2}:\d{2})/i)?.[1];
  if (!hora || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error("Hora BNA inválida.");
  const cuerpo = tabla.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  const detalle = [...cuerpo.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(fila => {
    const celdas = [...fila[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    if (celdas.length !== 3) throw new Error("Fila BNA inválida.");
    const descripcion = texto(celdas[0]);
    const codigoMoneda = /^Dolar U\.S\.A$/i.test(descripcion) ? "USD" : /^Euro$/i.test(descripcion) ? "EUR" : /^Real\s*\*$/i.test(descripcion) ? "BRL" : null;
    if (!codigoMoneda) throw new Error("Moneda BNA inesperada.");
    if (codigoMoneda === "BRL" && !/cotizaci[oó]n cada 100 unidades/i.test(texto(bloque))) throw new Error("Unidad del real BNA no informada.");
    const compra = importe(celdas[1]), venta = importe(celdas[2]);
    if (compra > venta) throw new Error("Cotización BNA inconsistente.");
    return { codigoMoneda, descripcion: codigoMoneda==="USD" ? "Dólar estadounidense" : codigoMoneda==="BRL" ? "Real" : "Euro", unidades: codigoMoneda==="BRL" ? 100 : 1, compra, venta };
  });
  if (detalle.length !== 3 || new Set(detalle.map(item=>item.codigoMoneda)).size !== 3) throw new Error("Billetes BNA incompletos.");
  detalle.sort((a,b)=>["USD","BRL","EUR"].indexOf(a.codigoMoneda)-["USD","BRL","EUR"].indexOf(b.codigoMoneda));
  return { fuente: BNA_FUENTE, fecha, hora, detalle, consultadoEn: new Date().toISOString() };
}
export async function consultarBilletesBna(fetcher = fetch) {
  const response = await fetcher(BNA_FUENTE, { signal: AbortSignal.timeout(12000), redirect: "error", headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error("BNA no disponible.");
  return parsearBilletesBna(await response.text());
}
