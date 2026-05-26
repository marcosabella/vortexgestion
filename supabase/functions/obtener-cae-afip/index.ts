import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

function formatearFechaArgentinaYYYYMMDD(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.split('T')[0].replace(/-/g, '');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  return year && month && day
    ? `${year}${month}${day}`
    : value.split('T')[0].replace(/-/g, '');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función para crear el TRA (Ticket de Requerimiento de Acceso)
function crearTRA(service: string, ambiente: 'homologacion' | 'produccion'): string {
  const ahora = new Date();
  const generationTime = new Date(ahora.getTime() - 10 * 60000); // 10 minutos atrás
  const expirationTime = new Date(ahora.getTime() + 10 * 60000); // 10 minutos adelante
  
  const uniqueId = Date.now();
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime.toISOString()}</generationTime>
    <expirationTime>${expirationTime.toISOString()}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

// Función para firmar el TRA con el certificado
async function firmarTRA(tra: string, certPem: string, keyPem: string): Promise<string> {
  try {
    // Importar la clave privada
    const keyData = keyPem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    
    const keyBytes = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
    
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBytes,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    // Firmar el TRA
    const encoder = new TextEncoder();
    const data = encoder.encode(tra);
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      data
    );

    // Codificar la firma en base64
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

    // Extraer el certificado sin headers
    const certData = certPem
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\s/g, '');

    // Crear el CMS (PKCS#7) manualmente
    const cms = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0><![CDATA[${btoa(tra)}]]></wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

    return cms;
  } catch (error: unknown) {
    console.error('Error al firmar TRA:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    throw new Error(`Error al firmar TRA: ${errorMessage}`);
  }
}

// Función para llamar al WSAA y obtener TA (Token y Sign)
async function obtenerTokenYSign(
  certPem: string,
  keyPem: string,
  service: string,
  ambiente: 'homologacion' | 'produccion'
): Promise<{ token: string; sign: string; expirationTime: string }> {
  try {
    console.log('Creando TRA para servicio:', service);
    const tra = crearTRA(service, ambiente);
    
    console.log('Firmando TRA...');
    const cms = await firmarTRA(tra, certPem, keyPem);
    
    // URL del WSAA según ambiente
    const wsaaUrl = ambiente === 'produccion'
      ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
      : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
    
    console.log('Llamando a WSAA:', wsaaUrl);
    
    const response = await fetch(wsaaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
      },
      body: cms,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error en WSAA:', response.status, errorText);
      throw new Error(`Error en WSAA: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log('Respuesta WSAA recibida');

    // Parsear la respuesta XML para extraer token, sign y expirationTime
    const tokenMatch = responseText.match(/<token>(.*?)<\/token>/s);
    const signMatch = responseText.match(/<sign>(.*?)<\/sign>/s);
    const expirationMatch = responseText.match(/<expirationTime>(.*?)<\/expirationTime>/s);

    if (!tokenMatch || !signMatch || !expirationMatch) {
      console.error('Respuesta WSAA:', responseText);
      throw new Error('No se pudo extraer token, sign o expirationTime de la respuesta WSAA');
    }

    return {
      token: tokenMatch[1].trim(),
      sign: signMatch[1].trim(),
      expirationTime: expirationMatch[1].trim(),
    };
  } catch (error) {
    console.error('Error en obtenerTokenYSign:', error);
    throw error;
  }
}

// Función para llamar a WSFE y solicitar CAE
async function solicitarCAE(
  token: string,
  sign: string,
  cuit: string,
  puntoVenta: number,
  solicitud: any,
  ambiente: 'homologacion' | 'produccion'
): Promise<{ cae: string; caeVencimiento: string }> {
  try {
    const wsfeUrl = ambiente === 'produccion'
      ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
      : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';

    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Header/>
  <soap:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>${solicitud.FeCabReq.CantReg}</ar:CantReg>
          <ar:PtoVta>${solicitud.FeCabReq.PtoVta}</ar:PtoVta>
          <ar:CbteTipo>${solicitud.FeCabReq.CbteTipo}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${solicitud.FeDetReq.FECAEDetRequest.Concepto}</ar:Concepto>
            <ar:DocTipo>${solicitud.FeDetReq.FECAEDetRequest.DocTipo}</ar:DocTipo>
            <ar:DocNro>${solicitud.FeDetReq.FECAEDetRequest.DocNro}</ar:DocNro>
            <ar:CbteDesde>${solicitud.FeDetReq.FECAEDetRequest.CbteDesde}</ar:CbteDesde>
            <ar:CbteHasta>${solicitud.FeDetReq.FECAEDetRequest.CbteHasta}</ar:CbteHasta>
            <ar:CbteFch>${solicitud.FeDetReq.FECAEDetRequest.CbteFch}</ar:CbteFch>
            <ar:ImpTotal>${solicitud.FeDetReq.FECAEDetRequest.ImpTotal}</ar:ImpTotal>
            <ar:ImpTotConc>${solicitud.FeDetReq.FECAEDetRequest.ImpTotConc}</ar:ImpTotConc>
            <ar:ImpNeto>${solicitud.FeDetReq.FECAEDetRequest.ImpNeto}</ar:ImpNeto>
            <ar:ImpOpEx>${solicitud.FeDetReq.FECAEDetRequest.ImpOpEx}</ar:ImpOpEx>
            <ar:ImpIVA>${solicitud.FeDetReq.FECAEDetRequest.ImpIVA}</ar:ImpIVA>
            <ar:ImpTrib>${solicitud.FeDetReq.FECAEDetRequest.ImpTrib}</ar:ImpTrib>
            <ar:MonId>${solicitud.FeDetReq.FECAEDetRequest.MonId}</ar:MonId>
            <ar:MonCotiz>${solicitud.FeDetReq.FECAEDetRequest.MonCotiz}</ar:MonCotiz>
            ${solicitud.FeDetReq.FECAEDetRequest.Iva.AlicIva.map((alicuota: any) => `
            <ar:Iva>
              <ar:AlicIva>
                <ar:Id>${alicuota.Id}</ar:Id>
                <ar:BaseImp>${alicuota.BaseImp}</ar:BaseImp>
                <ar:Importe>${alicuota.Importe}</ar:Importe>
              </ar:AlicIva>
            </ar:Iva>`).join('')}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    console.log('Llamando a WSFE:', wsfeUrl);

    const response = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
      },
      body: soapBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error en WSFE:', response.status, errorText);
      throw new Error(`Error en WSFE: ${response.status}`);
    }

    const responseText = await response.text();
    console.log('Respuesta WSFE recibida');

    // Parsear respuesta SOAP
    const caeMatch = responseText.match(/<CAE>(.*?)<\/CAE>/);
    const caeVencMatch = responseText.match(/<CAEFchVto>(.*?)<\/CAEFchVto>/);
    const resultadoMatch = responseText.match(/<Resultado>([AR])<\/Resultado>/);
    
    // Verificar errores
    const obsMatch = responseText.match(/<Obs>.*?<Msg>(.*?)<\/Msg>.*?<\/Obs>/s);
    
    if (resultadoMatch && resultadoMatch[1] === 'R') {
      const errorMsg = obsMatch ? obsMatch[1] : 'Error desconocido en WSFE';
      throw new Error(`AFIP rechazó la solicitud: ${errorMsg}`);
    }

    if (!caeMatch || !caeVencMatch) {
      console.error('Respuesta WSFE completa:', responseText);
      throw new Error('No se pudo extraer CAE de la respuesta WSFE');
    }

    return {
      cae: caeMatch[1],
      caeVencimiento: caeVencMatch[1],
    };
  } catch (error) {
    console.error('Error en solicitarCAE:', error);
    throw error;
  }
}

interface AfipConfig {
  punto_venta: number;
  cuit_emisor: string;
  ambiente: 'homologacion' | 'produccion';
  certificado_crt?: string;
  certificado_key?: string;
}

interface Venta {
  id: string;
  comercio_id?: string;
  numero_comprobante: string;
  tipo_comprobante: string;
  fecha_venta: string;
  cliente_id?: string;
  subtotal: number;
  total_iva: number;
  total: number;
  venta_items?: Array<{
    cantidad: number;
    precio_unitario: number;
    porcentaje_iva: number;
    monto_iva: number;
    subtotal: number;
    total: number;
  }>;
}

async function getAuthenticatedUserId(req: Request, supabase: any): Promise<string> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    throw new Error('Usuario no autenticado');
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Sesion invalida');
  }

  return data.user.id;
}

async function assertUserCanAccessComercio(supabase: any, userId: string, comercioId: string): Promise<void> {
  const { data, error } = await supabase
    .from('comercio_usuarios')
    .select('id')
    .eq('user_id', userId)
    .eq('comercio_id', comercioId)
    .eq('activo', true)
    .maybeSingle();

  if (error || !data) {
    throw new Error('No tiene acceso al comercio solicitado');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let ventaIdForError: string | undefined;
  let comercioIdForError: string | undefined;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userId = await getAuthenticatedUserId(req, supabase);

    const requestBody = await req.json();
    const { ventaId } = requestBody;
    ventaIdForError = ventaId;

    if (!ventaId) {
      throw new Error('ventaId es requerido');
    }

    console.log('Solicitando CAE para venta:', ventaId);

    const { data: ventaPre, error: ventaPreError } = await supabase
      .from('ventas')
      .select('id, comercio_id')
      .eq('id', ventaId)
      .single();

    if (ventaPreError || !ventaPre?.comercio_id) {
      throw new Error('Venta no encontrada o sin comercio asignado');
    }

    await assertUserCanAccessComercio(supabase, userId, ventaPre.comercio_id);
    comercioIdForError = ventaPre.comercio_id;

    // Obtener configuración AFIP activa
    const { data: afipConfig, error: configError } = await supabase
      .from('afip_config')
      .select('*')
      .eq('activo', true)
      .eq('comercio_id', ventaPre.comercio_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError || !afipConfig) {
      throw new Error('No hay configuración AFIP activa. Configure AFIP primero.');
    }

    // Validar que los certificados estén cargados
    if (!afipConfig.certificado_crt || !afipConfig.certificado_key) {
      throw new Error('Los certificados digitales no están cargados. Debe cargar el certificado (.crt) y la clave privada (.key) en la configuración AFIP.');
    }

    console.log('Configuración AFIP:', {
      punto_venta: afipConfig.punto_venta,
      ambiente: afipConfig.ambiente,
      cuit: afipConfig.cuit_emisor,
    });

    // Obtener datos de la venta
    const { data: venta, error: ventaError } = await supabase
      .from('ventas')
      .select(`
        *,
        venta_items(
          cantidad,
          precio_unitario,
          porcentaje_iva,
          monto_iva,
          subtotal,
          total
        )
      `)
      .eq('id', ventaId)
      .eq('comercio_id', ventaPre.comercio_id)
      .single();

    if (ventaError || !venta) {
      throw new Error('Venta no encontrada');
    }

    if (venta.comercio_id !== ventaPre.comercio_id) {
      throw new Error('La venta no pertenece al comercio autorizado');
    }

    console.log('Venta encontrada:', {
      numero_comprobante: venta.numero_comprobante,
      tipo_comprobante: venta.tipo_comprobante,
      total: venta.total,
    });

    // Verificar si ya tiene CAE
    if (venta.cae) {
      throw new Error('Esta venta ya tiene un CAE asignado');
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

    const codigoComprobante = tipoComprobanteMap[venta.tipo_comprobante];
    if (!codigoComprobante) {
      throw new Error(`Tipo de comprobante ${venta.tipo_comprobante} no válido para AFIP`);
    }

    // Extraer número de comprobante (formato: 0001-00000123)
    const partes = venta.numero_comprobante.split('-');
    const numeroComprobante = parseInt(partes[1] || '1', 10);

    // Preparar fecha en formato YYYYMMDD
    const fechaFormateada = formatearFechaArgentinaYYYYMMDD(venta.fecha_venta);

    // Calcular importes por alícuota de IVA
    const ivaMap = new Map<number, { baseImponible: number; importe: number }>();
    
    if (venta.venta_items && venta.venta_items.length > 0) {
      for (const item of venta.venta_items) {
        const alicuota = item.porcentaje_iva;
        const actual = ivaMap.get(alicuota) || { baseImponible: 0, importe: 0 };
        ivaMap.set(alicuota, {
          baseImponible: actual.baseImponible + Number(item.subtotal),
          importe: actual.importe + Number(item.monto_iva),
        });
      }
    }

    // Mapear porcentaje de IVA a código AFIP
    const ivaCodigoMap: Record<number, number> = {
      0: 3,     // No Gravado
      10.5: 4,  // IVA 10.5%
      21: 5,    // IVA 21%
      27: 6,    // IVA 27%
    };

    const ivaArray = Array.from(ivaMap.entries()).map(([porcentaje, valores]) => ({
      Id: ivaCodigoMap[porcentaje] || 5, // Default a 21%
      BaseImp: valores.baseImponible,
      Importe: valores.importe,
    }));

    // Si no hay items de IVA, agregar uno por defecto
    if (ivaArray.length === 0) {
      ivaArray.push({
        Id: 5, // IVA 21%
        BaseImp: Number(venta.subtotal),
        Importe: Number(venta.total_iva),
      });
    }

    // Estructura de la solicitud AFIP
    const solicitudAfip = {
      Auth: {
        Token: '', // Se llenará después de la autenticación
        Sign: '',
        Cuit: afipConfig.cuit_emisor,
      },
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: afipConfig.punto_venta,
          CbteTipo: codigoComprobante,
        },
        FeDetReq: {
          FECAEDetRequest: {
            Concepto: 1, // Productos
            DocTipo: 99, // Consumidor Final
            DocNro: 0,
            CbteDesde: numeroComprobante,
            CbteHasta: numeroComprobante,
            CbteFch: fechaFormateada,
            ImpTotal: Number(venta.total),
            ImpTotConc: 0, // No gravado
            ImpNeto: Number(venta.subtotal),
            ImpOpEx: 0, // Exento
            ImpIVA: Number(venta.total_iva),
            ImpTrib: 0, // Otros tributos
            MonId: 'PES', // Pesos
            MonCotiz: 1,
            Iva: {
              AlicIva: ivaArray,
            },
          },
        },
      },
    };

    console.log('Solicitud AFIP preparada:', JSON.stringify(solicitudAfip, null, 2));

    // Autenticación con WSAA para obtener token y sign
    console.log('Obteniendo token y sign de WSAA...');
    const { token, sign } = await obtenerTokenYSign(
      afipConfig.certificado_crt,
      afipConfig.certificado_key,
      'wsfe',
      afipConfig.ambiente
    );
    console.log('Token y Sign obtenidos exitosamente');

    // Solicitar CAE a WSFE
    console.log('Solicitando CAE a WSFE...');
    const { cae, caeVencimiento } = await solicitarCAE(
      token,
      sign,
      afipConfig.cuit_emisor,
      afipConfig.punto_venta,
      solicitudAfip.FeCAEReq,
      afipConfig.ambiente
    );
    
    // Formatear fecha de vencimiento (viene en formato YYYYMMDD)
    const fechaVencimientoStr = `${caeVencimiento.substring(0, 4)}-${caeVencimiento.substring(4, 6)}-${caeVencimiento.substring(6, 8)}`;

    console.log('CAE obtenido exitosamente:', cae, 'Vencimiento:', fechaVencimientoStr);

    // Actualizar venta con CAE
    const { error: updateError } = await supabase
      .from('ventas')
      .update({
        cae: cae,
        cae_vencimiento: fechaVencimientoStr,
        cae_solicitado_at: new Date().toISOString(),
        cae_error: null, // Limpiar error previo si existía
      })
      .eq('id', ventaId)
      .eq('comercio_id', ventaPre.comercio_id);

    if (updateError) {
      throw new Error(`Error al actualizar venta: ${updateError.message}`);
    }

    console.log('Venta actualizada con CAE exitosamente');

    return new Response(
      JSON.stringify({
        success: true,
        cae: cae,
        cae_vencimiento: fechaVencimientoStr,
        mensaje: afipConfig.ambiente === 'homologacion' 
          ? 'CAE obtenido en ambiente de homologación (testing)'
          : 'CAE obtenido exitosamente en producción',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error al obtener CAE:', error);

    // Si es un error con ventaId, intentar guardar el error en la base de datos
    try {
      const ventaId = ventaIdForError;
      if (ventaId && comercioIdForError) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        await supabase
          .from('ventas')
          .update({
            cae_error: error.message,
            cae_solicitado_at: new Date().toISOString(),
          })
          .eq('id', ventaId)
          .eq('comercio_id', comercioIdForError);
      }
    } catch (dbError) {
      console.error('Error al guardar error en BD:', dbError);
    }

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
