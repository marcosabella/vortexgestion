// Prefijos válidos para CUIT de personas físicas
export const PREFIJOS_PERSONA_FISICA = ['20', '23', '24', '27'];
// Prefijos válidos para CUIT de personas jurídicas
export const PREFIJOS_PERSONA_JURIDICA = ['30', '33', '34'];

// Calcular dígito verificador de CUIT
export function calcularDigitoVerificador(cuitSinDigito: string): number {
  const digits = cuitSinDigito.split('').map(Number);
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => {
    return acc + digit * multipliers[index];
  }, 0);
  
  const remainder = sum % 11;
  return remainder < 2 ? remainder : 11 - remainder;
}

// Generar CUIT a partir de DNI
export function generarCUITsDesdeDNI(dni: string): string[] {
  // Limpiar y padear el DNI a 8 dígitos
  const dniLimpio = dni.replace(/\D/g, '').padStart(8, '0');
  
  if (dniLimpio.length > 8) {
    return [];
  }
  
  const cuits: string[] = [];
  
  // Probar con todos los prefijos de persona física
  for (const prefijo of PREFIJOS_PERSONA_FISICA) {
    const cuitBase = prefijo + dniLimpio;
    const digito = calcularDigitoVerificador(cuitBase);
    const cuit = cuitBase + digito;
    cuits.push(cuit);
  }
  
  return cuits;
}

// Validación de CUIT argentino
export function validateCUIT(cuit: string): boolean {
  // Remover guiones y espacios
  const cleanCuit = cuit.replace(/[-\s]/g, '');
  
  // Verificar que tenga 11 dígitos
  if (!/^\d{11}$/.test(cleanCuit)) {
    return false;
  }
  
  // Algoritmo de validación de CUIT
  const digits = cleanCuit.split('').map(Number);
  const checkDigit = digits[10];
  
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.slice(0, 10).reduce((acc, digit, index) => {
    return acc + digit * multipliers[index];
  }, 0);
  
  const remainder = sum % 11;
  const calculatedCheckDigit = remainder < 2 ? remainder : 11 - remainder;
  
  return checkDigit === calculatedCheckDigit;
}

// Detectar si es DNI o CUIT
export function esDNI(valor: string): boolean {
  const limpio = valor.replace(/[-\s]/g, '');
  // Es DNI si tiene entre 7 y 8 dígitos
  return /^\d{7,8}$/.test(limpio);
}

// Formatear CUIT con guiones
export function formatCUIT(cuit: string): string {
  const cleanCuit = cuit.replace(/[-\s]/g, '');
  if (cleanCuit.length === 11) {
    return `${cleanCuit.slice(0, 2)}-${cleanCuit.slice(2, 10)}-${cleanCuit.slice(10)}`;
  }
  return cuit;
}

// Validación de email
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validación de teléfono argentino
export function validatePhone(phone: string): boolean {
  // Permitir diferentes formatos de teléfono argentino
  const phoneRegex = /^(\+54\s?)?(\d{2,4}[-\s]?)?\d{6,8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}