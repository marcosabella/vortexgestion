export class CaeRechazado extends Error {}

export function camposAutorizacionCae(puntoVenta: number, numero: number, cae: string, vencimiento: string) {
  if (!Number.isSafeInteger(puntoVenta) || puntoVenta <= 0 || !Number.isSafeInteger(numero) || numero <= 0
      || !/^\d{14}$/.test(cae) || !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)) {
    throw new Error('Datos de autorizacion CAE invalidos');
  }
  return {
    punto_venta: puntoVenta, numero_secuencial: numero,
    numero_comprobante: `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`,
    cae, cae_vencimiento: vencimiento, cae_solicitado_at: new Date().toISOString(), cae_error: null,
  };
}

export function validarComprobanteRecuperado(xml: string, esperado: {
  puntoVenta: number; tipoComprobante: number; numero: number;
  docTipo: number; docNro: number; fecha: string; total: number;
}): { cae: string; caeVencimiento: string } {
  const tag = (name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();
  const cae = tag('CodAutorizacion'); const vencimiento = tag('FchVto');
  if (tag('Resultado') !== 'A' || tag('EmisionTipo') !== 'CAE' || !cae || !/^\d{14}$/.test(cae)
      || !vencimiento || !/^\d{8}$/.test(vencimiento)
      || Number(tag('PtoVta')) !== esperado.puntoVenta || Number(tag('CbteTipo')) !== esperado.tipoComprobante
      || Number(tag('CbteDesde')) !== esperado.numero || Number(tag('CbteHasta')) !== esperado.numero
      || Number(tag('DocTipo')) !== esperado.docTipo || Number(tag('DocNro')) !== esperado.docNro
      || tag('CbteFch') !== esperado.fecha || Math.abs(Number(tag('ImpTotal')) - esperado.total) > 0.01
      || tag('ImpTotal') === undefined || !Number.isFinite(Number(tag('ImpTotal')))) {
    throw new Error('El comprobante consultado no coincide con el intento de esta venta. No se solicitara otro CAE.');
  }
  return { cae, caeVencimiento: vencimiento };
}
