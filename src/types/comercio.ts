export interface Comercio {
  id: string;
  activo?: boolean;
  nombre_comercio: string;
  calle: string;
  numero: string;
  codigo_postal: string;
  localidad: string;
  provincia: string;
  telefono?: string;
  cuit: string;
  ingresos_brutos?: string;
  fecha_inicio_actividad: string;
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComercioUsuario {
  id: string;
  comercio_id: string;
  user_id: string;
  rol: "admin" | "operador";
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ComercioFormData {
  nombre_comercio: string;
  calle: string;
  numero: string;
  codigo_postal: string;
  localidad: string;
  provincia: string;
  telefono?: string;
  cuit: string;
  ingresos_brutos?: string;
  fecha_inicio_actividad: string;
  logo_url?: string;
}
