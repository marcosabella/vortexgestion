export const esVistaPreviaReferidos = (hostname: string) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
export const codigoReferidoValido = (codigo: string) => /^VX-[A-F0-9]{12}$/.test(codigo);
export function enlaceReferido(codigo: string, origen = "https://vortexgestion.netlify.app") {
  const url = new URL("/", origen);
  url.searchParams.set("ref", codigo);
  url.hash = "contacto";
  return url.toString();
}
export function mensajeReferido(enlace: string) {
  return `Te recomiendo Vortex Gestión para organizar ventas, stock y clientes de tu negocio. Conocé el sistema y consultá desde mi enlace: ${enlace}`;
}
