export interface Producto {
  id: string;
  cod_producto: string;
  cod_barras?: string;
  descripcion: string;
  proveedor_id: string | null;
  marca_id: string | null;
  rubro_id: string | null;
  subrubro_id: string | null;
  precio_costo: number;
  porcentaje_iva: number;
  porcentaje_utilidad: number;
  porcentaje_descuento: number;
  precio_venta: number;
  stock: number;
  tipo_moneda: 'ARS' | 'USD' | 'USD_BLUE';
  observaciones?: string;
  created_at: string;
  updated_at: string;
  // Relations
  proveedor?: {
    nombre: string;
    apellido?: string;
    razon_social?: string;
  };
  marca?: {
    nombre: string;
  };
  rubro?: {
    nombre: string;
  };
  subrubro?: {
    nombre: string;
  };
}

export interface Marca {
  id: string;
  nombre: string;
  descripcion?: string;
  created_at: string;
  updated_at: string;
}

export interface Rubro {
  id: string;
  nombre: string;
  descripcion?: string;
  created_at: string;
  updated_at: string;
}

export interface SubRubro {
  id: string;
  nombre: string;
  descripcion?: string;
  rubro_id: string;
  created_at: string;
  updated_at: string;
  rubro?: {
    nombre: string;
  };
}
