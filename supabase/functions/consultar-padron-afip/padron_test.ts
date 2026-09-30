import { parseConstanciaInscripcion, separarDireccion } from './padron.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('Domicilio ARCA: separa numero, piso y departamento del ejemplo recibido', () => {
  const data = parseConstanciaInscripcion('<datosGenerales><nombre>Ana</nombre><tipoPersona>FISICA</tipoPersona><domicilioFiscal><direccion>PARAGUAY 776 Piso:08 Dpto:F</direccion></domicilioFiscal></datosGenerales>');
  const dom = data.domicilioFiscal;
  assert(dom.calle === 'PARAGUAY' && dom.numero === '776' && dom.piso === '08' && dom.departamento === 'F', 'Los campos del domicilio no se separaron');
});

Deno.test('Domicilio ARCA: mantiene calles numericas y complementos con otros formatos', () => {
  const dom = separarDireccion('9 DE JULIO 123, Depto.: B; Piso: PB');
  assert(dom.calle === '9 DE JULIO' && dom.numero === '123' && dom.piso === 'PB' && dom.departamento === 'B', 'Formato alternativo incorrecto');
  const sinNumero = separarDireccion('CAMINO RURAL');
  assert(sinNumero.calle === 'CAMINO RURAL' && sinNumero.numero === '' && sinNumero.piso === '', 'No debe inventar datos');
  assert(separarDireccion('MITRE S/N Piso:1').numero === 'S/N', 'Se perdio S/N');
});

Deno.test('Constancia: usa datos generales y decodifica razon social y domicilio', () => {
  const data = parseConstanciaInscripcion(`<soap:Envelope><a5:personaReturn>
    <datosGenerales><tipoPersona>JURIDICA</tipoPersona><razonSocial>Uno &amp; Dos SA</razonSocial>
      <domicilioFiscal><direccion>MITRE 123</direccion><localidad>ROSARIO</localidad><descripcionProvincia>SANTA FE</descripcionProvincia><codPostal>2000</codPostal></domicilioFiscal>
    </datosGenerales><datosRegimenGeneral><actividad><nombre>Actividad ajena</nombre></actividad><impuesto><idImpuesto>30</idImpuesto><estadoImpuesto>AC</estadoImpuesto></impuesto></datosRegimenGeneral>
    </a5:personaReturn></soap:Envelope>`);
  assert(data.nombre === 'Uno & Dos SA' && data.tipoPersona === 'juridica', 'Razon social incorrecta');
  assert(data.domicilioFiscal.calle === 'MITRE' && data.domicilioFiscal.numero === '123', 'Domicilio incorrecto');
  assert(data.situacionAfip === 'Responsable Inscripto', 'IVA incorrecto');
});

Deno.test('Constancia: IVA exento no se confunde con responsable inscripto', () => {
  const data = parseConstanciaInscripcion('<datosGenerales><tipoPersona>FISICA</tipoPersona><nombre>Ana</nombre><apellido>Perez</apellido></datosGenerales><impuesto><idImpuesto>32</idImpuesto></impuesto>');
  assert(data.situacionAfip === 'Exento' && data.apellido === 'Perez', 'Condicion o persona incorrecta');
});

Deno.test('Constancia: monotributo activo y sin inventar condicion de consumidor final', () => {
  const general = '<datosGenerales><tipoPersona>FISICA</tipoPersona><nombre>Ana</nombre></datosGenerales>';
  assert(parseConstanciaInscripcion(general + '<datosMonotributo><impuesto><idImpuesto>20</idImpuesto><estadoImpuesto>AC</estadoImpuesto></impuesto></datosMonotributo>').situacionAfip === 'Monotributista', 'Monotributo incorrecto');
  assert(parseConstanciaInscripcion(general + '<impuesto><idImpuesto>30</idImpuesto><estadoImpuesto>BA</estadoImpuesto></impuesto>').situacionAfip === '', 'No debe atribuir IVA activo');
});

Deno.test('Constancia: fault o respuesta sin datos nunca es un resultado exitoso', () => {
  for (const xml of ['<soap:Fault><faultstring>No autorizado</faultstring></soap:Fault>', '<personaReturn><errorConstancia><error>CUIT inexistente</error></errorConstancia></personaReturn>']) {
    let failed = false;
    try { parseConstanciaInscripcion(xml); } catch { failed = true; }
    assert(failed, 'Se acepto una respuesta sin datos');
  }
});
