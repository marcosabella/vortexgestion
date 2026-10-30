export interface PeriodoAsociado { desde: string; hasta: string }

// El período lo declara el usuario: no se deduce de la fecha de la nota.
export function camposPeriodoAsociado(tipo: string, fechaNota: string, periodo: unknown) {
  const esNota = /^nota_(credito|debito)_[abc]$/.test(tipo);
  if (!esNota) {
    if (periodo != null) throw new Error('El período asociado solo corresponde a notas de débito o crédito.');
    return {};
  }
  if (!periodo || typeof periodo !== 'object') {
    throw new Error('Indicá el período de los comprobantes que ajusta esta nota antes de solicitar CAE.');
  }
  const { desde, hasta } = periodo as Partial<PeriodoAsociado>;
  const fechaValida = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!fechaValida(desde) || !fechaValida(hasta) || desde <= '2006-01-01' || hasta < desde
      || hasta.replaceAll('-', '') > fechaNota) {
    throw new Error('El período asociado debe tener fechas válidas posteriores al 01/01/2006, desde menor o igual a hasta, y hasta no posterior a la fecha de la nota.');
  }
  return { PeriodoAsoc: { FchDesde: desde.replaceAll('-', ''), FchHasta: hasta.replaceAll('-', '') } };
}

export function xmlPeriodoAsociado(periodo?: { FchDesde: string; FchHasta: string }) {
  return periodo ? `<ar:PeriodoAsoc><ar:FchDesde>${periodo.FchDesde}</ar:FchDesde><ar:FchHasta>${periodo.FchHasta}</ar:FchHasta></ar:PeriodoAsoc>` : '';
}
