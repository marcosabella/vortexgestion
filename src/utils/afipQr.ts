import QRCode from 'qrcode';

interface AfipQRData {
  ver: number; // Versión (siempre 1)
  fecha: string; // Fecha en formato YYYY-MM-DD
  cuit: number; // CUIT del emisor
  ptoVta: number; // Punto de venta
  tipoCmp: number; // Tipo de comprobante
  nroCmp: number; // Número del comprobante
  importe: number; // Importe total
  moneda: string; // Moneda (PES para pesos)
  ctz: number; // Cotización (1 para pesos)
  tipoDocRec?: number; // Tipo de documento del receptor (opcional)
  nroDocRec?: number; // Número de documento del receptor (opcional)
  tipoCodAut: string; // "E" para CAE, "A" para CAEA
  codAut: number; // Código de autorización (CAE)
}

const TIPO_COMPROBANTE_MAP: Record<string, number> = {
  'factura_a': 1,
  'factura_b': 6,
  'factura_c': 11,
  'nota_credito_a': 3,
  'nota_credito_b': 8,
  'nota_credito_c': 13,
  'nota_debito_a': 2,
  'nota_debito_b': 7,
  'nota_debito_c': 12,
  'recibo_a': 4,
  'recibo_b': 9,
  'recibo_c': 15,
};

const formatArgentinaDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.split('T')[0] || value;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : value.split('T')[0] || value;
};

export async function generarQRAfip(params: {
  fecha: string; // ISO date string
  cuit: string; // CUIT del comercio
  puntoVenta: number;
  tipoComprobante: string;
  numeroComprobante: string; // Formato: 0001-00000123
  importe: number;
  cae?: string;
}): Promise<string> {
  // Si no hay CAE, retornar string vacío
  if (!params.cae) {
    return '';
  }

  // Extraer número de comprobante (sin el punto de venta)
  const partes = params.numeroComprobante.split('-');
  const nroCmp = parseInt(partes[1] || '1', 10);

  // Obtener código de tipo de comprobante
  const tipoCmp = TIPO_COMPROBANTE_MAP[params.tipoComprobante];
  if (!tipoCmp) {
    throw new Error(`Tipo de comprobante ${params.tipoComprobante} no válido para QR AFIP`);
  }

  // Formatear fecha (YYYY-MM-DD)
  const fecha = formatArgentinaDate(params.fecha);

  // Construir objeto de datos según especificación AFIP
  const qrData: AfipQRData = {
    ver: 1,
    fecha,
    cuit: parseInt(params.cuit.replace(/-/g, ''), 10),
    ptoVta: params.puntoVenta,
    tipoCmp,
    nroCmp,
    importe: params.importe,
    moneda: 'PES', // Pesos argentinos
    ctz: 1, // Cotización 1 para pesos
    tipoCodAut: 'E', // CAE
    codAut: parseInt(params.cae, 10),
  };

  // Convertir a JSON y codificar en Base64
  const jsonString = JSON.stringify(qrData);
  const base64Data = btoa(jsonString);

  // Construir URL según especificación AFIP
  const url = `https://www.arca.gob.ar/fe/qr/?p=${base64Data}`;

  // Generar QR code
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      width: 200,
      margin: 1,
    });
    return qrDataUrl;
  } catch (error) {
    console.error('Error generando QR:', error);
    throw error;
  }
}
