export class CaeRechazado extends Error {}

export function validarFechaContraUltimo(xml: string, puntoVenta: number, tipo: number, numero: number, fecha: string) {
  const tag = (name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();
  const ultimaFecha = tag('CbteFch');
  if (tag('Resultado') !== 'A' || Number(tag('PtoVta')) !== puntoVenta || Number(tag('CbteTipo')) !== tipo
      || Number(tag('CbteDesde')) !== numero || Number(tag('CbteHasta')) !== numero
      || !ultimaFecha || !/^\d{8}$/.test(ultimaFecha)) {
    throw new Error('No se pudo verificar la fecha del ultimo comprobante en ARCA. No se solicito CAE.');
  }
  if (fecha < ultimaFecha) {
    const mostrar = (value: string) => `${value.slice(6,8)}/${value.slice(4,6)}/${value.slice(0,4)}`;
    throw new Error(`La fecha del comprobante (${mostrar(fecha)}) es anterior a la del ultimo autorizado por ARCA (${mostrar(ultimaFecha)}, numero ${numero}, punto de venta ${puntoVenta}). Revise la fecha del comprobante. No se solicito CAE.`);
  }
}

export function camposServicioArca(venta: {
  concepto_arca?: number; servicio_desde?: string | null; servicio_hasta?: string | null; servicio_vencimiento_pago?: string | null;
}): { Concepto: number; FchServDesde?: string; FchServHasta?: string; FchVtoPago?: string } {
  const concepto = Number(venta.concepto_arca ?? 1);
  if (![1,2,3].includes(concepto)) throw new Error('Concepto ARCA inválido');
  if (concepto === 1) return { Concepto: 1 };
  const fecha = (value?: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Completá las fechas del servicio y el vencimiento de pago');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new Error('Fecha de servicio inválida');
    return value.replace(/-/g,'');
  };
  const desde = fecha(venta.servicio_desde), hasta = fecha(venta.servicio_hasta), vencimiento = fecha(venta.servicio_vencimiento_pago);
  if (hasta < desde) throw new Error('El fin del servicio no puede ser anterior a su inicio');
  return { Concepto: concepto, FchServDesde: desde, FchServHasta: hasta, FchVtoPago: vencimiento };
}

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
  concepto?: number; servicioDesde?: string; servicioHasta?: string; vencimientoPago?: string;
}): { cae: string; caeVencimiento: string } {
  const tag = (name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();
  const cae = tag('CodAutorizacion'); const vencimiento = tag('FchVto');
  if (tag('Resultado') !== 'A' || tag('EmisionTipo') !== 'CAE' || !cae || !/^\d{14}$/.test(cae)
      || !vencimiento || !/^\d{8}$/.test(vencimiento)
      || Number(tag('PtoVta')) !== esperado.puntoVenta || Number(tag('CbteTipo')) !== esperado.tipoComprobante
      || Number(tag('CbteDesde')) !== esperado.numero || Number(tag('CbteHasta')) !== esperado.numero
      || Number(tag('DocTipo')) !== esperado.docTipo || Number(tag('DocNro')) !== esperado.docNro
      || tag('CbteFch') !== esperado.fecha || Math.abs(Number(tag('ImpTotal')) - esperado.total) > 0.01
      || tag('ImpTotal') === undefined || !Number.isFinite(Number(tag('ImpTotal')))
      || ((esperado.concepto ?? 1) > 1 && (Number(tag('Concepto')) !== esperado.concepto
        || tag('FchServDesde') !== esperado.servicioDesde || tag('FchServHasta') !== esperado.servicioHasta || tag('FchVtoPago') !== esperado.vencimientoPago))) {
    throw new Error('El comprobante consultado no coincide con el intento de esta venta. No se solicitara otro CAE.');
  }
  return { cae, caeVencimiento: vencimiento };
}
