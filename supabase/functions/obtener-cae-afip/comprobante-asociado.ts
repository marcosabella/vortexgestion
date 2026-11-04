export interface ComprobanteAsociado { Tipo: number; PtoVta: number; Nro: number; Cuit: string; CbteFch: string }

export function asociarFacturaOriginal(tipoNota: string, original: { tipo: string; puntoVenta: number; numero: number; fecha: string; cuit: string }) {
  const tipos: Record<string, number> = { factura_a: 1, factura_b: 6, factura_c: 11 };
  if (tipoNota !== original.tipo.replace('factura_', 'nota_credito_') || !tipos[original.tipo]
    || !Number.isInteger(original.puntoVenta) || original.puntoVenta < 1 || !Number.isInteger(original.numero) || original.numero < 1
    || !/^\d{11}$/.test(original.cuit) || !/^\d{8}$/.test(original.fecha)) throw new Error('Factura original incompatible con la nota de credito');
  return { CbtesAsoc: { CbteAsoc: [{ Tipo: tipos[original.tipo], PtoVta: original.puntoVenta, Nro: original.numero, Cuit: original.cuit, CbteFch: original.fecha }] } };
}

export function xmlComprobantesAsociados(asociados?: { CbteAsoc: ComprobanteAsociado[] }) {
  return asociados ? `<ar:CbtesAsoc>${asociados.CbteAsoc.map(c => `<ar:CbteAsoc><ar:Tipo>${c.Tipo}</ar:Tipo><ar:PtoVta>${c.PtoVta}</ar:PtoVta><ar:Nro>${c.Nro}</ar:Nro><ar:Cuit>${c.Cuit}</ar:Cuit><ar:CbteFch>${c.CbteFch}</ar:CbteAsoc>`).join('')}</ar:CbtesAsoc>` : '';
}
