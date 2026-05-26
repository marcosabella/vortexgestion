import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import forge from 'https://esm.sh/node-forge@1.3.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función para formatear fecha en formato AFIP (ISO 8601 con timezone Argentina)
function formatearFechaAFIP(fecha: Date): string {
  // Convertir a hora Argentina (UTC-3)
  const argentinaOffset = -3 * 60 * 60 * 1000; // -3 horas en milisegundos
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

// Función para crear el TRA (Ticket de Requerimiento de Acceso)
function crearTRA(service: string): string {
  const ahora = new Date();
  const generationTime = new Date(ahora.getTime() - 10 * 60000); // 10 minutos antes
  const expirationTime = new Date(ahora.getTime() + 10 * 60000); // 10 minutos después
  const uniqueId = Math.floor(Date.now() / 1000); // Timestamp en segundos
  
  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
<header>
<uniqueId>${uniqueId}</uniqueId>
<generationTime>${formatearFechaAFIP(generationTime)}</generationTime>
<expirationTime>${formatearFechaAFIP(expirationTime)}</expirationTime>
</header>
<service>${service}</service>
</loginTicketRequest>`;
  
  return tra;
}

// Función para firmar el TRA usando PKCS#7/CMS
function firmarTRA(tra: string, certPem: string, keyPem: string): string {
  try {
    console.log('Iniciando firma del TRA...');
    console.log('TRA a firmar:', tra);
    
    // Normalizar los saltos de línea en los certificados
    const certNormalized = certPem.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const keyNormalized = keyPem.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Parsear certificado y clave privada
    const certificate = forge.pki.certificateFromPem(certNormalized);
    const privateKey = forge.pki.privateKeyFromPem(keyNormalized);
    
    console.log('Certificado CN:', certificate.subject.getField('CN')?.value);
    console.log('Certificado válido hasta:', certificate.validity.notAfter);
    
    // Crear el mensaje PKCS#7 firmado
    const p7 = forge.pkcs7.createSignedData();
    
    // Agregar el contenido (TRA como bytes)
    p7.content = forge.util.createBuffer(tra, 'utf8');
    
    // Agregar el certificado del firmante
    p7.addCertificate(certificate);
    
    // Agregar el firmante con SHA-256
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
    
    // Firmar
    p7.sign();
    
    console.log('TRA firmado correctamente');
    
    // Convertir a DER y luego a Base64
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

// Función para obtener token y sign de WSAA
async function obtenerTokenYSign(
  certPem: string,
  keyPem: string,
  service: string,
  ambiente: 'homologacion' | 'produccion'
): Promise<{ token: string; sign: string }> {
  try {
    const tra = crearTRA(service);
    console.log('TRA creado');
    
    const cms = firmarTRA(tra, certPem, keyPem);
    
    const wsaaUrl = ambiente === 'produccion'
      ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
      : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
    
    console.log('Enviando request a WSAA:', wsaaUrl);
    
    // SOAP request para WSAA - el CMS va directamente en in0
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
    console.log('Respuesta WSAA (primeros 500 chars):', responseText.substring(0, 500));
    
    if (!response.ok) {
      console.error('Error WSAA response completa:', responseText);
      throw new Error(`Error en WSAA: ${response.status} - ${responseText}`);
    }

    // Buscar el loginTicketResponse en la respuesta
    // Puede venir como CDATA o directamente
    let xmlContent = responseText;
    
    // Si viene como CDATA, extraerlo
    const cdataMatch = responseText.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdataMatch) {
      xmlContent = cdataMatch[1];
    }
    
    // También puede venir escapado en el return
    const returnMatch = responseText.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/);
    if (returnMatch) {
      // Decodificar entidades HTML si es necesario
      xmlContent = returnMatch[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');
    }

    const tokenMatch = xmlContent.match(/<token>([\s\S]*?)<\/token>/);
    const signMatch = xmlContent.match(/<sign>([\s\S]*?)<\/sign>/);

    if (!tokenMatch || !signMatch) {
      console.error('No se encontró token/sign en:', xmlContent);
      throw new Error('No se pudo extraer token y sign de WSAA');
    }

    console.log('Token y sign obtenidos correctamente');
    
    return {
      token: tokenMatch[1].trim(),
      sign: signMatch[1].trim(),
    };
  } catch (error) {
    console.error('Error en obtenerTokenYSign:', error);
    throw error;
  }
}

// Función para consultar último comprobante autorizado
async function consultarUltimoComprobante(
  token: string,
  sign: string,
  cuit: string,
  puntoVenta: number,
  tipoComprobante: number,
  ambiente: 'homologacion' | 'produccion'
): Promise<number> {
  try {
    const wsfeUrl = ambiente === 'produccion'
      ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
      : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';

    // Limpiar CUIT de guiones
    const cuitLimpio = cuit.replace(/-/g, '');
    
    console.log('Consultando WSFE FECompUltimoAutorizado:', wsfeUrl);
    console.log('CUIT:', cuitLimpio, 'PtoVta:', puntoVenta, 'TipoCbte:', tipoComprobante);

    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
<soap:Header/>
<soap:Body>
<ar:FECompUltimoAutorizado>
<ar:Auth>
<ar:Token>${token}</ar:Token>
<ar:Sign>${sign}</ar:Sign>
<ar:Cuit>${cuitLimpio}</ar:Cuit>
</ar:Auth>
<ar:PtoVta>${puntoVenta}</ar:PtoVta>
<ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
</ar:FECompUltimoAutorizado>
</soap:Body>
</soap:Envelope>`;

    const response = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
      },
      body: soapBody,
    });

    const responseText = await response.text();
    console.log('Respuesta WSFE status:', response.status);
    console.log('Respuesta WSFE (primeros 500 chars):', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('Error WSFE response:', responseText);
      throw new Error(`Error en WSFE: ${response.status}`);
    }

    // Parsear respuesta SOAP
    const cbteNroMatch = responseText.match(/<CbteNro>(\d+)<\/CbteNro>/);
    
    if (!cbteNroMatch) {
      // Verificar si hay errores en la respuesta
      const errorMatch = responseText.match(/<Err>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Err>/);
      if (errorMatch) {
        throw new Error(`Error AFIP: ${errorMatch[1]}`);
      }
      console.error('Respuesta WSFE completa:', responseText);
      throw new Error('No se pudo extraer el número de comprobante de la respuesta');
    }

    return parseInt(cbteNroMatch[1], 10);
  } catch (error) {
    console.error('Error en consultarUltimoComprobante:', error);
    throw error;
  }
}

// Interfaz para los detalles del comprobante
interface DetallesComprobante {
  fechaEmision?: string;
  importeTotal?: number;
  importeNeto?: number;
  importeIVA?: number;
  cuitReceptor?: string;
  tipoDocReceptor?: number;
  cae?: string;
  caeVencimiento?: string;
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

// Función para consultar detalles de un comprobante específico
async function consultarDetalleComprobante(
  token: string,
  sign: string,
  cuit: string,
  puntoVenta: number,
  tipoComprobante: number,
  numeroComprobante: number,
  ambiente: 'homologacion' | 'produccion'
): Promise<DetallesComprobante> {
  try {
    // Si el número es 0, no hay comprobantes emitidos
    if (numeroComprobante === 0) {
      console.log('No hay comprobantes emitidos para consultar detalles');
      return {};
    }

    const wsfeUrl = ambiente === 'produccion'
      ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
      : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';

    // Limpiar CUIT de guiones
    const cuitLimpio = cuit.replace(/-/g, '');
    
    console.log('Consultando WSFE FECompConsultar:', wsfeUrl);
    console.log('CUIT:', cuitLimpio, 'PtoVta:', puntoVenta, 'TipoCbte:', tipoComprobante, 'CbteNro:', numeroComprobante);

    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
<soap:Header/>
<soap:Body>
<ar:FECompConsultar>
<ar:Auth>
<ar:Token>${token}</ar:Token>
<ar:Sign>${sign}</ar:Sign>
<ar:Cuit>${cuitLimpio}</ar:Cuit>
</ar:Auth>
<ar:FeCompConsReq>
<ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
<ar:CbteNro>${numeroComprobante}</ar:CbteNro>
<ar:PtoVta>${puntoVenta}</ar:PtoVta>
</ar:FeCompConsReq>
</ar:FECompConsultar>
</soap:Body>
</soap:Envelope>`;

    const response = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompConsultar',
      },
      body: soapBody,
    });

    const responseText = await response.text();
    console.log('Respuesta FECompConsultar status:', response.status);
    console.log('Respuesta FECompConsultar (primeros 1000 chars):', responseText.substring(0, 1000));

    if (!response.ok) {
      console.error('Error FECompConsultar response:', responseText);
      throw new Error(`Error en FECompConsultar: ${response.status}`);
    }

    // Parsear los diferentes campos de la respuesta
    const detalles: DetallesComprobante = {};

    // Fecha de emisión (formato YYYYMMDD)
    const fechaMatch = responseText.match(/<CbteFch>(\d+)<\/CbteFch>/);
    if (fechaMatch) {
      const fecha = fechaMatch[1];
      detalles.fechaEmision = `${fecha.substring(0, 4)}-${fecha.substring(4, 6)}-${fecha.substring(6, 8)}`;
    }

    // Importe total
    const importeTotalMatch = responseText.match(/<ImpTotal>([\d.]+)<\/ImpTotal>/);
    if (importeTotalMatch) {
      detalles.importeTotal = parseFloat(importeTotalMatch[1]);
    }

    // Importe neto
    const importeNetoMatch = responseText.match(/<ImpNeto>([\d.]+)<\/ImpNeto>/);
    if (importeNetoMatch) {
      detalles.importeNeto = parseFloat(importeNetoMatch[1]);
    }

    // Importe IVA
    const importeIVAMatch = responseText.match(/<ImpIVA>([\d.]+)<\/ImpIVA>/);
    if (importeIVAMatch) {
      detalles.importeIVA = parseFloat(importeIVAMatch[1]);
    }

    // CUIT/DNI del receptor
    const docNroMatch = responseText.match(/<DocNro>(\d+)<\/DocNro>/);
    if (docNroMatch) {
      detalles.cuitReceptor = docNroMatch[1];
    }

    // Tipo de documento del receptor
    const docTipoMatch = responseText.match(/<DocTipo>(\d+)<\/DocTipo>/);
    if (docTipoMatch) {
      detalles.tipoDocReceptor = parseInt(docTipoMatch[1], 10);
    }

    // CAE
    const caeMatch = responseText.match(/<CodAutorizacion>(\d+)<\/CodAutorizacion>/);
    if (caeMatch) {
      detalles.cae = caeMatch[1];
    }

    // CAE Vencimiento
    const caeVtoMatch = responseText.match(/<FchVto>(\d+)<\/FchVto>/);
    if (caeVtoMatch) {
      const fecha = caeVtoMatch[1];
      detalles.caeVencimiento = `${fecha.substring(0, 4)}-${fecha.substring(4, 6)}-${fecha.substring(6, 8)}`;
    }

    console.log('Detalles extraídos:', detalles);
    return detalles;
  } catch (error) {
    console.error('Error en consultarDetalleComprobante:', error);
    // No lanzamos el error, solo retornamos vacío para que no falle la consulta principal
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tipoComprobante, comercioId } = await req.json();
    const authorizedComercioId = await getAuthorizedComercioId(req, supabase, comercioId);

    if (!tipoComprobante) {
      throw new Error('tipoComprobante es requerido');
    }

    console.log('=== INICIO CONSULTA ULTIMO COMPROBANTE ===');
    console.log('Tipo comprobante:', tipoComprobante);

    // Obtener configuración AFIP activa
    const { data: afipConfig, error: configError } = await supabase
      .from('afip_config')
      .select('*')
      .eq('activo', true)
      .eq('comercio_id', authorizedComercioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError || !afipConfig) {
      throw new Error('No hay configuración AFIP activa');
    }

    console.log('Config AFIP encontrada, ambiente:', afipConfig.ambiente);
    console.log('Punto de venta:', afipConfig.punto_venta);
    console.log('CUIT:', afipConfig.cuit_emisor);

    if (!afipConfig.certificado_crt || !afipConfig.certificado_key) {
      throw new Error('Los certificados no están configurados');
    }

    // Mapear tipo de comprobante a código AFIP
    const tipoComprobanteMap: Record<string, number> = {
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

    const codigoComprobante = tipoComprobanteMap[tipoComprobante];
    if (!codigoComprobante) {
      throw new Error(`Tipo de comprobante no válido: ${tipoComprobante}`);
    }

    console.log('Código comprobante AFIP:', codigoComprobante);

    // Obtener token y sign
    console.log('Obteniendo token y sign de WSAA...');
    const { token, sign } = await obtenerTokenYSign(
      afipConfig.certificado_crt,
      afipConfig.certificado_key,
      'wsfe',
      afipConfig.ambiente as 'homologacion' | 'produccion'
    );

    // Consultar último comprobante
    console.log('Consultando último comprobante en WSFE...');
    const ultimoNumero = await consultarUltimoComprobante(
      token,
      sign,
      afipConfig.cuit_emisor,
      afipConfig.punto_venta,
      codigoComprobante,
      afipConfig.ambiente as 'homologacion' | 'produccion'
    );

    console.log('Último número autorizado:', ultimoNumero);

    // Consultar detalles del último comprobante
    console.log('Consultando detalles del comprobante...');
    const detalles = await consultarDetalleComprobante(
      token,
      sign,
      afipConfig.cuit_emisor,
      afipConfig.punto_venta,
      codigoComprobante,
      ultimoNumero,
      afipConfig.ambiente as 'homologacion' | 'produccion'
    );

    console.log('=== FIN CONSULTA ULTIMO COMPROBANTE ===');

    return new Response(
      JSON.stringify({
        success: true,
        ultimoNumero,
        puntoVenta: afipConfig.punto_venta,
        tipoComprobante,
        ambiente: afipConfig.ambiente,
        // Detalles del comprobante
        fechaEmision: detalles.fechaEmision,
        importeTotal: detalles.importeTotal,
        importeNeto: detalles.importeNeto,
        importeIVA: detalles.importeIVA,
        cuitReceptor: detalles.cuitReceptor,
        tipoDocReceptor: detalles.tipoDocReceptor,
        cae: detalles.cae,
        caeVencimiento: detalles.caeVencimiento,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error al consultar último comprobante:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
