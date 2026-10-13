const entidades: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  Ntilde: "Ñ", ntilde: "ñ", Aacute: "Á", aacute: "á", Eacute: "É", eacute: "é",
  Iacute: "Í", iacute: "í", Oacute: "Ó", oacute: "ó", Uacute: "Ú", uacute: "ú",
  Uuml: "Ü", uuml: "ü",
};

export function decodificarTextoArca(texto: string): string {
  let resultado = texto;
  // Algunas fuentes devuelven entidades escapadas una segunda vez (&amp;#209;).
  for (let paso = 0; paso < 3; paso++) {
    const siguiente = resultado.replace(/&(#(?:[xX][\da-fA-F]+|\d+)|[a-zA-Z]+);/g, (entidad, codigo: string) => {
      if (!codigo.startsWith("#")) return entidades[codigo] ?? entidad;
      const hexadecimal = codigo[1]?.toLowerCase() === "x";
      const numero = parseInt(codigo.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isSafeInteger(numero) || numero <= 0 || numero > 0x10ffff || (numero >= 0xd800 && numero <= 0xdfff)) return entidad;
      return String.fromCodePoint(numero);
    });
    if (siguiente === resultado) break;
    resultado = siguiente;
  }
  return resultado;
}

// Normaliza texto al recibir el informe, antes de completar nombres o domicilios.
// Las entidades se convierten a texto plano; nunca se interpreta ni inserta HTML.
export function normalizarTextosArca<T>(datos: T): T {
  if (typeof datos === "string") return decodificarTextoArca(datos) as T;
  if (Array.isArray(datos)) return datos.map(normalizarTextosArca) as T;
  if (datos && typeof datos === "object") return Object.fromEntries(Object.entries(datos).map(([clave, valor]) => [clave, normalizarTextosArca(valor)])) as T;
  return datos;
}
