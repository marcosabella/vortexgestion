// Lectura de los campos de getPersona_v2 sin depender de prefijos SOAP.
function normalize(xml: string): string {
  return xml.replace(/(<\/?)[\w-]+:/g, '$1');
}

function decode(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) =>
    String.fromCodePoint(code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
}

function section(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1] || '';
}

function value(xml: string, tag: string): string {
  return decode(section(xml, tag));
}

export function soapFaultMessage(xml: string): string {
  return value(normalize(xml), 'faultstring');
}

export function separarDireccion(direccion: string) {
  // ARCA puede incluir los complementos en direccion: "PARAGUAY 776 Piso:08 Dpto:F".
  const complementos = /\b(piso|dpto\.?|depto\.?|departamento)\s*:\s*/gi;
  const etiquetas = [...direccion.matchAll(complementos)];
  let piso = '';
  let departamento = '';
  etiquetas.forEach((etiqueta, index) => {
    const contenido = direccion.slice(etiqueta.index! + etiqueta[0].length, etiquetas[index + 1]?.index ?? direccion.length)
      .trim().replace(/[,;]+$/, '').trim();
    if (etiqueta[1].toLowerCase() === 'piso') piso = contenido;
    else departamento = contenido;
  });
  const principal = direccion.slice(0, etiquetas[0]?.index ?? direccion.length).trim().replace(/[,;]+$/, '').trim();
  const partes = principal.match(/^(.+?)\s+(\d+[a-z]?|s\/?n)$/i);
  return { calle: partes?.[1]?.trim() || principal, numero: partes?.[2] || '', piso, departamento };
}

export function parseConstanciaInscripcion(response: string) {
  const xml = normalize(response);
  const fault = soapFaultMessage(xml);
  if (fault) throw new Error(fault);
  const general = section(xml, 'datosGenerales');
  const nombre = value(general, 'nombre');
  const apellido = value(general, 'apellido');
  const razonSocial = value(general, 'razonSocial');
  if (!general || !(nombre || apellido || razonSocial)) {
    const errores = section(xml, 'errorConstancia');
    throw new Error(value(errores, 'error') || 'ARCA no devolvio datos del contribuyente');
  }

  const domicilio = section(general, 'domicilioFiscal');
  const direccion = value(domicilio, 'direccion');
  const direccionPartes = separarDireccion(direccion);
  const impuestos = [...xml.matchAll(/<impuesto(?:\s[^>]*)?>([\s\S]*?)<\/impuesto>/g)]
    .map((match) => ({ id: value(match[1], 'idImpuesto'), estado: value(match[1], 'estadoImpuesto') || value(match[1], 'estado') }));
  // Algunos esquemas no informan estado; los que lo incluyen deben estar activos.
  const activo = (id: string) => impuestos.some((impuesto) => impuesto.id === id
    && (!impuesto.estado || ['AC', 'ACTIVO'].includes(impuesto.estado.toUpperCase())));
  const situacionAfip = activo('30') ? 'Responsable Inscripto'
    : activo('20') ? 'Monotributista'
    : activo('32') ? 'Exento' : '';
  const fisica = value(general, 'tipoPersona') === 'FISICA';

  return {
    nombre: fisica ? nombre : razonSocial || nombre,
    apellido: fisica ? apellido : '',
    razonSocial,
    tipoPersona: fisica ? 'fisica' : 'juridica',
    situacionAfip,
    domicilioFiscal: {
      ...direccionPartes,
      piso: value(domicilio, 'piso') || direccionPartes.piso,
      departamento: value(domicilio, 'departamento') || direccionPartes.departamento,
      localidad: value(domicilio, 'localidad'),
      provincia: value(domicilio, 'descripcionProvincia'),
      codigoPostal: value(domicilio, 'codPostal'),
    },
    fuente: 'afip_oficial',
  };
}
