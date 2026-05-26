// VERSION: 2026-01-06-v6 - Add detailed logging for official WS
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import forge from 'https://esm.sh/node-forge@1.3.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función para formatear fecha en formato AFIP (ISO 8601 con timezone Argentina)
function formatearFechaAFIP(fecha: Date): string {
  const argentinaOffset = -3 * 60 * 60 * 1000;
  const utcTime = fecha.getTime();
  const argentinaTime = new Date(utcTime + argentinaOffset);
  
  const year = argentinaTime.getUTCFullYear();
  const month = String(argentinaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(argentinaTime.getUTCDate()).padStart(2, '0');
  const hours = String(argentinaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(argentinaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(argentinaTime.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
}

// Crear TRA (Ticket de Requerimiento de Acceso) para el servicio ws_sr_padron_a5
function crearTRA(service: string): string {
  const ahora = new Date();
  const generationTime = new Date(ahora.getTime() - 10 * 60000);
  const expirationTime = new Date(ahora.getTime() + 10 * 60000);
  const uniqueId = Math.floor(Date.now() / 1000);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
<header>
<uniqueId>${uniqueId}</uniqueId>
<generationTime>${formatearFechaAFIP(generationTime)}</generationTime>
<expirationTime>${formatearFechaAFIP(expirationTime)}</expirationTime>
</header>
<service>${service}</service>
</loginTicketRequest>`;
}

// Firmar TRA usando PKCS#7/CMS con node-forge
function firmarTRA(tra: string, certPem: string, keyPem: string): string {
  try {
    console.log('Iniciando firma del TRA...');
    
    const certNormalized = certPem.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const keyNormalized = keyPem.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    const certificate = forge.pki.certificateFromPem(certNormalized);
    const privateKey = forge.pki.privateKeyFromPem(keyNormalized);
    
    console.log('Certificado CN:', certificate.subject.getField('CN')?.value);
    console.log('Certificado válido hasta:', certificate.validity.notAfter);
    
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(certificate);
    
    p7.addSigner({
      key: privateKey,
      certificate: certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data
        },
        {
          type: forge.pki.oids.messageDigest
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date()
        }
      ]
    });
    
    p7.sign();
    
    console.log('TRA firmado correctamente');
    
    const asn1 = p7.toAsn1();
    const der = forge.asn1.toDer(asn1);
    const cms = forge.util.encode64(der.getBytes());
    
    console.log('CMS generado, longitud:', cms.length);
    
    return cms;
  } catch (error: unknown) {
    console.error('Error al firmar TRA:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    throw new Error(`Error al firmar TRA: ${errorMessage}`);
  }
}

// Obtener token y sign de WSAA
async function obtenerTokenYSign(
  certPem: string,
  keyPem: string,
  service: string,
  ambiente: 'homologacion' | 'produccion'
): Promise<{ token: string; sign: string }> {
  const tra = crearTRA(service);
  console.log('TRA creado');
  
  const cms = firmarTRA(tra, certPem, keyPem);
  
  const wsaaUrl = ambiente === 'produccion'
    ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
    : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
  
  console.log('Enviando request a WSAA:', wsaaUrl);
  
  const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
<soapenv:Header/>
<soapenv:Body>
<wsaa:loginCms>
<wsaa:in0>${cms}</wsaa:in0>
</wsaa:loginCms>
</soapenv:Body>
</soapenv:Envelope>`;
  
  const response = await fetch(wsaaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '',
    },
    body: soapRequest,
  });

  const responseText = await response.text();
  console.log('Respuesta WSAA status:', response.status);
  
  if (!response.ok) {
    console.error('Error WSAA:', responseText.substring(0, 500));
    throw new Error(`Error en WSAA: ${response.status} - IP no autorizada`);
  }

  let xmlContent = responseText;
  
  const cdataMatch = responseText.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdataMatch) {
    xmlContent = cdataMatch[1];
  }
  
  const returnMatch = responseText.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/);
  if (returnMatch) {
    xmlContent = returnMatch[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  }

  const tokenMatch = xmlContent.match(/<token>([\s\S]*?)<\/token>/);
  const signMatch = xmlContent.match(/<sign>([\s\S]*?)<\/sign>/);

  if (!tokenMatch || !signMatch) {
    throw new Error('No se pudo extraer token y sign de WSAA');
  }

  console.log('Token y sign obtenidos correctamente');
  
  return {
    token: tokenMatch[1].trim(),
    sign: signMatch[1].trim(),
  };
}

// ==========================================
// FALLBACK: APIs Públicas
// ==========================================

// Consultar API pública de AFIP (cuitonline.com)
async function consultarAPIsPublicas(cuit: string): Promise<any> {
  console.log('=== Intentando APIs públicas como fallback ===');
  
  // Intentar múltiples fuentes
  const apis = [
    { name: 'cuitonline', fn: () => consultarCuitOnline(cuit) },
    { name: 'afip.tangofactura', fn: () => consultarTangoFactura(cuit) },
  ];

  for (const api of apis) {
    try {
      console.log(`Intentando ${api.name}...`);
      const resultado = await api.fn();
      if (resultado && (resultado.nombre || resultado.razonSocial)) {
        console.log(`${api.name} retornó datos válidos`);
        return resultado;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.log(`${api.name} falló:`, errorMessage);
    }
  }

  return null;
}

// Consultar cuitonline.com - VERSION 5 - 2026-01-06
async function consultarCuitOnline(cuit: string): Promise<any> {
  console.log('=== [V5] Consultando cuitonline.com ===');
  const response = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  console.log('=== [V5] HTML recibido, longitud:', html.length);
  
  return parseCuitOnlineHTML(html, cuit);
}

// Parsear HTML de cuitonline - VERSION 5
function parseCuitOnlineHTML(html: string, cuit: string): any {
  const tipoPersona = detectarTipoPersona(cuit);
  
  // Buscar nombre/razón social
  const nombreMatch = html.match(/<h2[^>]*class="denominacion"[^>]*>([^<]+)<\/h2>/i) 
    || html.match(/<div[^>]*class="denominacion"[^>]*>([^<]+)<\/div>/i)
    || html.match(/<td[^>]*>Denominaci[oó]n[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  
  const nombreCompleto = nombreMatch ? nombreMatch[1].trim() : '';
  
  // NUEVA LÓGICA V5: Extraer condición IVA del campo específico
  let situacionAfip = '';
  
  console.log('=== [V5] PARSING IVA ===');
  
  // Buscar el patrón "IVA:" seguido del valor - MÚLTIPLES PATRONES
  // Patrón 1: IVA:&nbsp;Iva Exento<br
  // Patrón 2: IVA: Responsable Inscripto</span>
  // Patrón 3: <td>IVA</td><td>valor</td>
  
  const ivaPatterns = [
    /IVA:(?:&nbsp;|\s)*([A-Za-záéíóúÁÉÍÓÚñÑ\s]+?)(?:<br|<\/span|<\/td|<\/div|\n|$)/gi,
    /<td[^>]*>IVA[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
    /condici[oó]n\s*(?:frente\s*al\s*)?IVA[:\s]*([^<\n]+)/i,
  ];
  
  for (const pattern of ivaPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const valorIva = match[1].trim().replace(/&nbsp;/g, ' ');
      console.log('[V5] Valor IVA encontrado con patrón:', valorIva);
      
      const valorUpper = valorIva.toUpperCase();
      
      // Mapear el valor - ORDEN ESPECÍFICO
      if (valorUpper.includes('EXENTO') || valorUpper.includes('IVA EXENTO')) {
        situacionAfip = 'Exento';
        console.log('[V5] Detectado: Exento');
        break;
      } else if (valorUpper.includes('RESPONSABLE INSCRIPTO') || valorUpper.includes('RESP. INSCRIPTO') || valorUpper.includes('R.I.')) {
        situacionAfip = 'Responsable Inscripto';
        console.log('[V5] Detectado: Responsable Inscripto');
        break;
      } else if (valorUpper.includes('MONOTRIBUTO') || valorUpper.includes('MONOTRIBUTISTA')) {
        situacionAfip = 'Monotributista';
        console.log('[V5] Detectado: Monotributista');
        break;
      } else if (valorUpper.includes('NO RESPONSABLE')) {
        situacionAfip = 'No Responsable';
        console.log('[V5] Detectado: No Responsable');
        break;
      } else if (valorUpper.includes('CONSUMIDOR FINAL')) {
        situacionAfip = 'Consumidor Final';
        console.log('[V5] Detectado: Consumidor Final');
        break;
      }
    }
  }

  console.log('[V5] Situación AFIP final:', situacionAfip);

  // Buscar dirección
  const direccionMatch = html.match(/<td[^>]*>Direcci[oó]n[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  const localidadMatch = html.match(/<td[^>]*>Localidad[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  const provinciaMatch = html.match(/<td[^>]*>Provincia[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  const cpMatch = html.match(/<td[^>]*>C[oó]digo\s*Postal[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);

  if (!nombreCompleto) {
    throw new Error('No se encontró información en cuitonline');
  }

  let nombre = '';
  let apellido = '';
  
  if (tipoPersona === 'fisica') {
    const partes = nombreCompleto.split(/\s+/);
    if (partes.length >= 2) {
      apellido = partes[0];
      nombre = partes.slice(1).join(' ');
    } else {
      nombre = nombreCompleto;
    }
  }

  return {
    nombre: tipoPersona === 'fisica' ? nombre : nombreCompleto,
    apellido: tipoPersona === 'fisica' ? apellido : '',
    razonSocial: tipoPersona === 'juridica' ? nombreCompleto : '',
    tipoPersona,
    situacionAfip,
    domicilioFiscal: {
      calle: direccionMatch ? direccionMatch[1].trim() : '',
      numero: '',
      localidad: localidadMatch ? localidadMatch[1].trim() : '',
      provincia: provinciaMatch ? provinciaMatch[1].trim() : '',
      codigoPostal: cpMatch ? cpMatch[1].trim() : '',
    },
    fuente: 'cuitonline',
  };
}

// Consultar tangofactura API (alternativa)
async function consultarTangoFactura(cuit: string): Promise<any> {
  const response = await fetch(`https://afip.tangofactura.com/Rest/GetContribuyente?cuit=${cuit}`, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  
  if (!data || data.error || !data.Contribuyente) {
    throw new Error('No se encontró información');
  }

  const contrib = data.Contribuyente;
  const tipoPersona = detectarTipoPersona(cuit);

  let nombre = '';
  let apellido = '';
  const razonSocial = contrib.RazonSocial || contrib.razonSocial || '';

  if (tipoPersona === 'fisica' && razonSocial) {
    const partes = razonSocial.split(/\s+/);
    if (partes.length >= 2) {
      apellido = partes[0];
      nombre = partes.slice(1).join(' ');
    } else {
      nombre = razonSocial;
    }
  }

  return {
    nombre: tipoPersona === 'fisica' ? nombre : razonSocial,
    apellido: tipoPersona === 'fisica' ? apellido : '',
    razonSocial: tipoPersona === 'juridica' ? razonSocial : '',
    tipoPersona,
    situacionAfip: mapearCondicionIVA(contrib.TipoResponsable || contrib.tipoResponsable || ''),
    domicilioFiscal: {
      calle: contrib.Domicilio || contrib.domicilio || '',
      numero: '',
      localidad: contrib.Localidad || contrib.localidad || '',
      provincia: contrib.Provincia || contrib.provincia || '',
      codigoPostal: contrib.CodigoPostal || contrib.codigoPostal || '',
    },
    fuente: 'tangofactura',
  };
}

function mapearCondicionIVA(condicion: string): string {
  const upper = (condicion || '').toUpperCase().trim();
  console.log('Mapeando condición IVA:', upper);
  
  // Mapeo más preciso
  if (upper.includes('RESPONSABLE INSCRIPTO') || upper === 'RI' || upper === '1') {
    return 'Responsable Inscripto';
  }
  if (upper.includes('MONOTRIBUTO') || upper.includes('MONOTRIBUTISTA') || upper === 'MT' || upper === '6') {
    return 'Monotributista';
  }
  if (upper.includes('EXENTO') || upper === 'EX' || upper === '4') {
    return 'Exento';
  }
  if (upper.includes('NO RESPONSABLE') || upper === 'NR' || upper === '3') {
    return 'No Responsable';
  }
  if (upper.includes('CONSUMIDOR FINAL') || upper === 'CF' || upper === '5') {
    return 'Consumidor Final';
  }
  
  // Si no coincide pero tiene valor, devolverlo formateado
  if (upper) {
    // Capitalizar primera letra de cada palabra
    return condicion.trim().split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  return '';  // Dejar vacío para que el usuario complete
}

// ==========================================
// Consultar padrón AFIP oficial (ws_sr_padron_a5)
// ==========================================

async function consultarPadron(
  token: string,
  sign: string,
  cuitEmisor: string,
  cuitConsultar: string,
  ambiente: 'homologacion' | 'produccion'
): Promise<any> {
  const wsPadronUrl = ambiente === 'produccion'
    ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5'
    : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5';

  const cuitEmisorLimpio = cuitEmisor.replace(/-/g, '');

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:per="http://a5.soap.ws.server.puc.sr/">
<soap:Header/>
<soap:Body>
<per:getPersona>
<token>${token}</token>
<sign>${sign}</sign>
<cuitRepresentada>${cuitEmisorLimpio}</cuitRepresentada>
<idPersona>${cuitConsultar}</idPersona>
</per:getPersona>
</soap:Body>
</soap:Envelope>`;

  console.log('Consultando padrón AFIP:', wsPadronUrl);

  const response = await fetch(wsPadronUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '',
    },
    body: soapBody,
  });

  const responseText = await response.text();
  console.log('Respuesta padrón status:', response.status);

  if (!response.ok) {
    throw new Error(`Error en padrón AFIP: ${response.status}`);
  }

  return parseRespuestaPadron(responseText);
}

function parseRespuestaPadron(xml: string): any {
  const tipoPersonaMatch = xml.match(/<tipoPersona>(.*?)<\/tipoPersona>/);
  const nombreMatch = xml.match(/<nombre>(.*?)<\/nombre>/);
  const apellidoMatch = xml.match(/<apellido>(.*?)<\/apellido>/);
  const razonSocialMatch = xml.match(/<razonSocial>(.*?)<\/razonSocial>/);
  
  const domicilioSection = xml.match(/<domicilioFiscal>(.*?)<\/domicilioFiscal>/s);
  let domicilio: any = {};
  
  if (domicilioSection) {
    const domXml = domicilioSection[1];
    const calleMatch = domXml.match(/<direccion>(.*?)<\/direccion>/);
    const localidadMatch = domXml.match(/<localidad>(.*?)<\/localidad>/);
    const provinciaMatch = domXml.match(/<descripcionProvincia>(.*?)<\/descripcionProvincia>/);
    const cpMatch = domXml.match(/<codPostal>(.*?)<\/codPostal>/);
    
    domicilio = {
      calle: calleMatch ? calleMatch[1] : '',
      numero: '',
      localidad: localidadMatch ? localidadMatch[1] : '',
      provincia: provinciaMatch ? mapearProvincia(provinciaMatch[1]) : '',
      codigoPostal: cpMatch ? cpMatch[1] : '',
    };
    
    if (calleMatch) {
      const direccion = calleMatch[1];
      const match = direccion.match(/^(.+?)\s+(\d+)$/);
      if (match) {
        domicilio.calle = match[1].trim();
        domicilio.numero = match[2];
      } else {
        domicilio.calle = direccion;
        domicilio.numero = 'S/N';
      }
    }
  }

  const impuestosSection = xml.match(/<impuesto>(.*?)<\/impuesto>/gs);
  let situacionAfip = 'Consumidor Final';
  
  if (impuestosSection) {
    for (const imp of impuestosSection) {
      const idImpMatch = imp.match(/<idImpuesto>(\d+)<\/idImpuesto>/);
      const estadoMatch = imp.match(/<estado>(\w+)<\/estado>/);
      
      if (idImpMatch && estadoMatch && estadoMatch[1] === 'ACTIVO') {
        const idImpuesto = parseInt(idImpMatch[1]);
        if (idImpuesto === 32 || idImpuesto === 30) {
          situacionAfip = 'Responsable Inscripto';
          break;
        }
        if (idImpuesto === 20) {
          situacionAfip = 'Monotributista';
        }
        if (idImpuesto === 34) {
          situacionAfip = 'Exento';
        }
      }
    }
  }

  const categoriaMonoMatch = xml.match(/<categoriaMonotributo>(.*?)<\/categoriaMonotributo>/);
  if (categoriaMonoMatch && situacionAfip === 'Monotributista') {
    situacionAfip = `Monotributista Cat. ${categoriaMonoMatch[1]}`;
  }

  const tipoPersona = tipoPersonaMatch?.[1] || '';
  const esPersonaFisica = tipoPersona === 'FISICA';

  return {
    nombre: esPersonaFisica 
      ? (nombreMatch?.[1] || '') 
      : (razonSocialMatch?.[1] || nombreMatch?.[1] || ''),
    apellido: esPersonaFisica ? (apellidoMatch?.[1] || '') : '',
    razonSocial: razonSocialMatch?.[1] || '',
    tipoPersona: esPersonaFisica ? 'fisica' : 'juridica',
    situacionAfip,
    domicilioFiscal: domicilio,
    fuente: 'afip_oficial',
  };
}

function mapearProvincia(provinciaAfip: string): string {
  const mapeo: Record<string, string> = {
    'CIUDAD AUTONOMA BUENOS AIRES': 'Ciudad Autónoma de Buenos Aires',
    'BUENOS AIRES': 'Buenos Aires',
    'CATAMARCA': 'Catamarca',
    'CHACO': 'Chaco',
    'CHUBUT': 'Chubut',
    'CORDOBA': 'Córdoba',
    'CORRIENTES': 'Corrientes',
    'ENTRE RIOS': 'Entre Ríos',
    'FORMOSA': 'Formosa',
    'JUJUY': 'Jujuy',
    'LA PAMPA': 'La Pampa',
    'LA RIOJA': 'La Rioja',
    'MENDOZA': 'Mendoza',
    'MISIONES': 'Misiones',
    'NEUQUEN': 'Neuquén',
    'RIO NEGRO': 'Río Negro',
    'SALTA': 'Salta',
    'SAN JUAN': 'San Juan',
    'SAN LUIS': 'San Luis',
    'SANTA CRUZ': 'Santa Cruz',
    'SANTA FE': 'Santa Fe',
    'SANTIAGO DEL ESTERO': 'Santiago del Estero',
    'TIERRA DEL FUEGO': 'Tierra del Fuego',
    'TUCUMAN': 'Tucumán',
  };
  
  const upper = provinciaAfip.toUpperCase();
  return mapeo[upper] || provinciaAfip;
}

function detectarTipoPersona(cuit: string): 'fisica' | 'juridica' {
  const prefijo = cuit.substring(0, 2);
  return ['30', '33', '34'].includes(prefijo) ? 'juridica' : 'fisica';
}

async function getAuthorizedComercioId(req: Request, supabase: any, requestedComercioId?: string): Promise<string> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    throw new Error('Usuario no autenticado');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Error('Sesion invalida');
  }

  let query = supabase
    .from('comercio_usuarios')
    .select('comercio_id')
    .eq('user_id', userData.user.id)
    .eq('activo', true);

  if (requestedComercioId) {
    query = query.eq('comercio_id', requestedComercioId);
  }

  const { data, error } = await query;
  if (error || !data?.length) {
    throw new Error('No tiene acceso al comercio solicitado');
  }

  if (!requestedComercioId && data.length > 1) {
    throw new Error('Debe indicar el comercio para esta consulta');
  }

  return data[0].comercio_id;
}

// ==========================================
// Handler principal
// ==========================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { cuit, comercioId } = await req.json();
    const authorizedComercioId = await getAuthorizedComercioId(req, supabase, comercioId);

    if (!cuit) {
      throw new Error('CUIT es requerido');
    }

    const cuitLimpio = cuit.replace(/[-\s]/g, '');
    
    if (cuitLimpio.length !== 11) {
      throw new Error('El CUIT debe tener 11 dígitos');
    }

    console.log('=== INICIO CONSULTA PADRON ===');
    console.log('CUIT a consultar:', cuitLimpio);

    // Obtener configuración AFIP
    const { data: afipConfig } = await supabase
      .from('afip_config')
      .select('*')
      .eq('activo', true)
      .eq('comercio_id', authorizedComercioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let usarAPIOficial = false;
    let errorOficial = '';

    // Intentar webservice oficial si hay configuración
    if (afipConfig?.certificado_crt && afipConfig?.certificado_key) {
      console.log('=== INTENTANDO WEBSERVICE OFICIAL AFIP ===');
      console.log('CUIT Emisor:', afipConfig.cuit_emisor);
      console.log('Ambiente:', afipConfig.ambiente);
      console.log('Certificado CRT presente:', !!afipConfig.certificado_crt);
      console.log('Certificado KEY presente:', !!afipConfig.certificado_key);
      
      try {
        console.log('Obteniendo token y sign para ws_sr_padron_a5...');
        const { token, sign } = await obtenerTokenYSign(
          afipConfig.certificado_crt,
          afipConfig.certificado_key,
          'ws_sr_padron_a5',
          afipConfig.ambiente
        );
        console.log('Token obtenido OK, longitud:', token.length);

        console.log('Consultando padrón oficial para CUIT:', cuitLimpio);
        const datosPersona = await consultarPadron(
          token,
          sign,
          afipConfig.cuit_emisor,
          cuitLimpio,
          afipConfig.ambiente
        );

        console.log('=== DATOS OBTENIDOS DE AFIP OFICIAL ===');
        console.log('Situación AFIP:', datosPersona.situacionAfip);
        console.log('Nombre:', datosPersona.nombre);
        
        return new Response(
          JSON.stringify({
            success: true,
            data: datosPersona,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('=== ERROR EN WEBSERVICE OFICIAL ===');
        console.error('Error:', errorMessage);
        errorOficial = errorMessage;
        // Continuar con fallback
      }
    } else {
      console.log('=== SIN CONFIGURACIÓN AFIP ===');
      console.log('certificado_crt presente:', !!afipConfig?.certificado_crt);
      console.log('certificado_key presente:', !!afipConfig?.certificado_key);
      console.log('Usando APIs públicas directamente');
    }

    // Fallback: APIs públicas
    console.log('=== USANDO APIs PÚBLICAS COMO FALLBACK ===');
    const datosPublicos = await consultarAPIsPublicas(cuitLimpio);

    if (datosPublicos) {
      console.log('Datos obtenidos de API pública:', datosPublicos.fuente);
      return new Response(
        JSON.stringify({
          success: true,
          data: datosPublicos,
          advertencia: errorOficial 
            ? 'El webservice oficial no está disponible. Datos obtenidos de fuente alternativa.' 
            : 'Datos obtenidos de fuente alternativa (sin certificado AFIP configurado).',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Si todo falla, retornar tipo de persona detectado
    const tipoPersona = detectarTipoPersona(cuitLimpio);
    console.log('No se pudieron obtener datos, tipo detectado:', tipoPersona);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'No se pudieron obtener datos del contribuyente. Complete los datos manualmente.',
        tipoPersona,
        data: {
          nombre: '',
          apellido: '',
          tipoPersona,
          situacionAfip: '',
        },
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error en consultar-padron-afip:', error);
    
    let tipoPersona: 'fisica' | 'juridica' = 'fisica';
    try {
      const body = await req.clone().json();
      if (body.cuit) {
        const cuitLimpio = body.cuit.replace(/[-\s]/g, '');
        tipoPersona = detectarTipoPersona(cuitLimpio);
      }
    } catch {}

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Error al consultar',
        tipoPersona,
        data: {
          nombre: '',
          apellido: '',
          tipoPersona,
          situacionAfip: '',
        },
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
