type Asn1Element = {
  tag: number;
  contentStart: number;
  contentEnd: number;
};

const TAG_SEQUENCE = 0x30;
const TAG_UTC_TIME = 0x17;
const TAG_GENERALIZED_TIME = 0x18;
const TAG_VERSION = 0xa0;

function pemToDerBytes(pem: string): Uint8Array {
  const match = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
  const base64 = (match?.[1] ?? pem).replace(/\s+/g, '');

  if (!base64) {
    throw new Error('El certificado esta vacio');
  }

  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function readElement(bytes: Uint8Array, offset: number): Asn1Element {
  if (offset >= bytes.length) {
    throw new Error('Certificado incompleto');
  }

  const tag = bytes[offset];
  const lengthByte = bytes[offset + 1];
  let length = lengthByte;
  let lengthStart = offset + 2;

  if (lengthByte & 0x80) {
    const lengthBytes = lengthByte & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4) {
      throw new Error('Longitud ASN.1 invalida');
    }

    length = 0;
    for (let i = 0; i < lengthBytes; i += 1) {
      length = (length << 8) | bytes[lengthStart + i];
    }
    lengthStart += lengthBytes;
  }

  const contentEnd = lengthStart + length;
  if (contentEnd > bytes.length) {
    throw new Error('Certificado incompleto');
  }

  return { tag, contentStart: lengthStart, contentEnd };
}

function readChildren(bytes: Uint8Array, element: Asn1Element): Asn1Element[] {
  const children: Asn1Element[] = [];
  let offset = element.contentStart;

  while (offset < element.contentEnd) {
    const child = readElement(bytes, offset);
    children.push(child);
    offset = child.contentEnd;
  }

  if (offset !== element.contentEnd) {
    throw new Error('Estructura ASN.1 invalida');
  }

  return children;
}

function readAscii(bytes: Uint8Array, element: Asn1Element): string {
  return String.fromCharCode(...bytes.slice(element.contentStart, element.contentEnd));
}

function parseCertificateTime(value: string, tag: number): string {
  const match = value.match(/^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})?$/);

  if (!match) {
    throw new Error('Formato de fecha del certificado invalido');
  }

  const [, rawYear, month, day] = match;
  let year = rawYear;

  if (tag === TAG_UTC_TIME) {
    const yearNumber = Number(rawYear);
    year = `${yearNumber >= 50 ? 1900 + yearNumber : 2000 + yearNumber}`;
  }

  return `${year}-${month}-${day}`;
}

export function extractCertificateExpirationDate(pem: string): string {
  const bytes = pemToDerBytes(pem);
  const certificate = readElement(bytes, 0);

  if (certificate.tag !== TAG_SEQUENCE) {
    throw new Error('El archivo no contiene un certificado X.509 valido');
  }

  const certificateChildren = readChildren(bytes, certificate);
  const tbsCertificate = certificateChildren[0];

  if (!tbsCertificate || tbsCertificate.tag !== TAG_SEQUENCE) {
    throw new Error('No se pudo leer el certificado');
  }

  const tbsChildren = readChildren(bytes, tbsCertificate);
  const validityIndex = tbsChildren[0]?.tag === TAG_VERSION ? 4 : 3;
  const validity = tbsChildren[validityIndex];

  if (!validity || validity.tag !== TAG_SEQUENCE) {
    throw new Error('No se pudo leer la vigencia del certificado');
  }

  const validityChildren = readChildren(bytes, validity);
  const notAfter = validityChildren[1];

  if (!notAfter || (notAfter.tag !== TAG_UTC_TIME && notAfter.tag !== TAG_GENERALIZED_TIME)) {
    throw new Error('No se pudo leer el vencimiento del certificado');
  }

  return parseCertificateTime(readAscii(bytes, notAfter), notAfter.tag);
}
