export interface Cliente {
  id?: string;
  nombre: string;
  apellido: string;
  cuit: string;
  calle: string;
  numero: string;
  codigo_postal: string;
  localidad: string;
  provincia: string;
  telefono?: string;
  email?: string;
  situacion_afip: string;
  ingresos_brutos?: string;
  tipo_persona: 'fisica' | 'juridica';
  created_at?: string;
  updated_at?: string;
}

export const SITUACIONES_AFIP = [
  'Responsable Inscripto',
  'Monotributista',
  'Exento',
  'No Responsable',
  'Consumidor Final',
  'Responsable No Inscripto',
  'Monotributista Social',
  'Pequeño Contribuyente Eventual',
  'Pequeño Contribuyente Eventual Social'
] as const;

export const PROVINCIAS_ARGENTINA = [
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Ciudad Autónoma de Buenos Aires',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
  'Tucumán'
] as const;

export type SituacionAfip = typeof SITUACIONES_AFIP[number];
export type ProvinciaArgentina = typeof PROVINCIAS_ARGENTINA[number];