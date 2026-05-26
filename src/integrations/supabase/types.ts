export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      app_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      afip_config: {
        Row: {
          activo: boolean | null
          ambiente: string | null
          certificado_crt: string | null
          certificado_key: string | null
          certificado_vencimiento: string | null
          certificado_vigente: boolean | null
          comercio_id: string | null
          created_at: string | null
          cuit_emisor: string | null
          id: string
          nombre_certificado_crt: string | null
          nombre_certificado_key: string | null
          punto_venta: number
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          ambiente?: string | null
          certificado_crt?: string | null
          certificado_key?: string | null
          certificado_vencimiento?: string | null
          certificado_vigente?: boolean | null
          comercio_id?: string | null
          created_at?: string | null
          cuit_emisor?: string | null
          id?: string
          nombre_certificado_crt?: string | null
          nombre_certificado_key?: string | null
          punto_venta: number
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          ambiente?: string | null
          certificado_crt?: string | null
          certificado_key?: string | null
          certificado_vencimiento?: string | null
          certificado_vigente?: boolean | null
          comercio_id?: string | null
          created_at?: string | null
          cuit_emisor?: string | null
          id?: string
          nombre_certificado_crt?: string | null
          nombre_certificado_key?: string | null
          punto_venta?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      bancos: {
        Row: {
          activo: boolean
          cbu: string
          comercio_id: string | null
          created_at: string
          id: string
          nombre_banco: string
          numero_cuenta: string
          observaciones: string | null
          sucursal: string
          tipo_cuenta: Database["public"]["Enums"]["tipo_cuenta_bancaria"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cbu: string
          comercio_id?: string | null
          created_at?: string
          id?: string
          nombre_banco: string
          numero_cuenta: string
          observaciones?: string | null
          sucursal: string
          tipo_cuenta?: Database["public"]["Enums"]["tipo_cuenta_bancaria"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cbu?: string
          comercio_id?: string | null
          created_at?: string
          id?: string
          nombre_banco?: string
          numero_cuenta?: string
          observaciones?: string | null
          sucursal?: string
          tipo_cuenta?: Database["public"]["Enums"]["tipo_cuenta_bancaria"]
          updated_at?: string
        }
        Relationships: []
      }
      cheques: {
        Row: {
          banco_emisor: string
          cliente_id: string | null
          comercio_id: string | null
          created_at: string
          cuenta_corriente_id: string | null
          emisor_cuit: string | null
          emisor_nombre: string
          estado: Database["public"]["Enums"]["estado_cheque"]
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          monto: number
          numero_cheque: string
          observaciones: string | null
          updated_at: string
          venta_id: string | null
        }
        Insert: {
          banco_emisor: string
          cliente_id?: string | null
          comercio_id?: string | null
          created_at?: string
          cuenta_corriente_id?: string | null
          emisor_cuit?: string | null
          emisor_nombre: string
          estado?: Database["public"]["Enums"]["estado_cheque"]
          fecha_emision: string
          fecha_vencimiento: string
          id?: string
          monto?: number
          numero_cheque: string
          observaciones?: string | null
          updated_at?: string
          venta_id?: string | null
        }
        Update: {
          banco_emisor?: string
          cliente_id?: string | null
          comercio_id?: string | null
          created_at?: string
          cuenta_corriente_id?: string | null
          emisor_cuit?: string | null
          emisor_nombre?: string
          estado?: Database["public"]["Enums"]["estado_cheque"]
          fecha_emision?: string
          fecha_vencimiento?: string
          id?: string
          monto?: number
          numero_cheque?: string
          observaciones?: string | null
          updated_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cheques_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cheques_cuenta_corriente"
            columns: ["cuenta_corriente_id"]
            isOneToOne: false
            referencedRelation: "cuenta_corriente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cheques_venta"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          apellido: string
          calle: string
          codigo_postal: string
          comercio_id: string | null
          created_at: string
          cuit: string
          email: string | null
          id: string
          ingresos_brutos: string | null
          localidad: string
          nombre: string
          numero: string
          provincia: string
          situacion_afip: string
          telefono: string | null
          tipo_persona: string
          updated_at: string
        }
        Insert: {
          apellido: string
          calle: string
          codigo_postal: string
          comercio_id?: string | null
          created_at?: string
          cuit: string
          email?: string | null
          id?: string
          ingresos_brutos?: string | null
          localidad: string
          nombre: string
          numero: string
          provincia: string
          situacion_afip: string
          telefono?: string | null
          tipo_persona: string
          updated_at?: string
        }
        Update: {
          apellido?: string
          calle?: string
          codigo_postal?: string
          comercio_id?: string | null
          created_at?: string
          cuit?: string
          email?: string | null
          id?: string
          ingresos_brutos?: string | null
          localidad?: string
          nombre?: string
          numero?: string
          provincia?: string
          situacion_afip?: string
          telefono?: string | null
          tipo_persona?: string
          updated_at?: string
        }
        Relationships: []
      }
      comercio: {
        Row: {
          activo: boolean
          calle: string
          codigo_postal: string
          created_at: string
          cuit: string
          fecha_inicio_actividad: string
          id: string
          ingresos_brutos: string | null
          localidad: string
          logo_url: string | null
          nombre_comercio: string
          numero: string
          provincia: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          calle: string
          codigo_postal: string
          created_at?: string
          cuit: string
          fecha_inicio_actividad: string
          id?: string
          ingresos_brutos?: string | null
          localidad: string
          logo_url?: string | null
          nombre_comercio: string
          numero: string
          provincia: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          calle?: string
          codigo_postal?: string
          created_at?: string
          cuit?: string
          fecha_inicio_actividad?: string
          id?: string
          ingresos_brutos?: string | null
          localidad?: string
          logo_url?: string | null
          nombre_comercio?: string
          numero?: string
          provincia?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      comercio_usuarios: {
        Row: {
          activo: boolean
          comercio_id: string
          created_at: string
          id: string
          rol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activo?: boolean
          comercio_id: string
          created_at?: string
          id?: string
          rol?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activo?: boolean
          comercio_id?: string
          created_at?: string
          id?: string
          rol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comercio_usuarios_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      cuenta_corriente: {
        Row: {
          cliente_id: string
          comercio_id: string | null
          concepto: string
          created_at: string
          cuotas: number | null
          fecha_movimiento: string
          id: string
          monto: number
          observaciones: string | null
          tarjeta_id: string | null
          tipo_movimiento: string
          updated_at: string
          venta_id: string | null
        }
        Insert: {
          cliente_id: string
          comercio_id?: string | null
          concepto: string
          created_at?: string
          cuotas?: number | null
          fecha_movimiento?: string
          id?: string
          monto?: number
          observaciones?: string | null
          tarjeta_id?: string | null
          tipo_movimiento: string
          updated_at?: string
          venta_id?: string | null
        }
        Update: {
          cliente_id?: string
          comercio_id?: string | null
          concepto?: string
          created_at?: string
          cuotas?: number | null
          fecha_movimiento?: string
          id?: string
          monto?: number
          observaciones?: string | null
          tarjeta_id?: string | null
          tipo_movimiento?: string
          updated_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_corriente_tarjeta_id_fkey"
            columns: ["tarjeta_id"]
            isOneToOne: false
            referencedRelation: "tarjetas_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cuenta_corriente_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cuenta_corriente_venta"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas: {
        Row: {
          comercio_id: string | null
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          comercio_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          comercio_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      pagos_venta: {
        Row: {
          banco_id: string | null
          cheque_id: string | null
          comercio_id: string | null
          created_at: string
          cuotas: number | null
          id: string
          monto: number
          recargo_cuotas: number | null
          tarjeta_id: string | null
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          updated_at: string
          venta_id: string
        }
        Insert: {
          banco_id?: string | null
          cheque_id?: string | null
          comercio_id?: string | null
          created_at?: string
          cuotas?: number | null
          id?: string
          monto?: number
          recargo_cuotas?: number | null
          tarjeta_id?: string | null
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          updated_at?: string
          venta_id: string
        }
        Update: {
          banco_id?: string | null
          cheque_id?: string | null
          comercio_id?: string | null
          created_at?: string
          cuotas?: number | null
          id?: string
          monto?: number
          recargo_cuotas?: number | null
          tarjeta_id?: string | null
          tipo_pago?: Database["public"]["Enums"]["tipo_pago"]
          updated_at?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pagos_venta_banco"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pagos_venta_cheque"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pagos_venta_tarjeta"
            columns: ["tarjeta_id"]
            isOneToOne: false
            referencedRelation: "tarjetas_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pagos_venta_venta"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          cod_barras: string | null
          cod_producto: string
          comercio_id: string | null
          created_at: string
          descripcion: string
          id: string
          marca_id: string | null
          observaciones: string | null
          porcentaje_descuento: number
          porcentaje_iva: number
          porcentaje_utilidad: number
          precio_costo: number
          precio_venta: number | null
          proveedor_id: string | null
          rubro_id: string | null
          stock: number
          subrubro_id: string | null
          tipo_moneda: Database["public"]["Enums"]["tipo_moneda"]
          updated_at: string
        }
        Insert: {
          cod_barras?: string | null
          cod_producto: string
          comercio_id?: string | null
          created_at?: string
          descripcion: string
          id?: string
          marca_id?: string | null
          observaciones?: string | null
          porcentaje_descuento?: number
          porcentaje_iva?: number
          porcentaje_utilidad?: number
          precio_costo?: number
          precio_venta?: number | null
          proveedor_id?: string | null
          rubro_id?: string | null
          stock?: number
          subrubro_id?: string | null
          tipo_moneda?: Database["public"]["Enums"]["tipo_moneda"]
          updated_at?: string
        }
        Update: {
          cod_barras?: string | null
          cod_producto?: string
          comercio_id?: string | null
          created_at?: string
          descripcion?: string
          id?: string
          marca_id?: string | null
          observaciones?: string | null
          porcentaje_descuento?: number
          porcentaje_iva?: number
          porcentaje_utilidad?: number
          precio_costo?: number
          precio_venta?: number | null
          proveedor_id?: string | null
          rubro_id?: string | null
          stock?: number
          subrubro_id?: string | null
          tipo_moneda?: Database["public"]["Enums"]["tipo_moneda"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_rubro_id_fkey"
            columns: ["rubro_id"]
            isOneToOne: false
            referencedRelation: "rubros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_subrubro_id_fkey"
            columns: ["subrubro_id"]
            isOneToOne: false
            referencedRelation: "subrubros"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          apellido: string | null
          calle: string
          codigo_postal: string
          comercio_id: string | null
          created_at: string
          cuit: string
          email: string | null
          id: string
          ingresos_brutos: string | null
          localidad: string
          nombre: string
          numero: string
          provincia: string
          razon_social: string | null
          situacion_afip: string
          telefono: string | null
          tipo_persona: string
          updated_at: string
        }
        Insert: {
          apellido?: string | null
          calle: string
          codigo_postal: string
          comercio_id?: string | null
          created_at?: string
          cuit: string
          email?: string | null
          id?: string
          ingresos_brutos?: string | null
          localidad: string
          nombre: string
          numero: string
          provincia: string
          razon_social?: string | null
          situacion_afip: string
          telefono?: string | null
          tipo_persona: string
          updated_at?: string
        }
        Update: {
          apellido?: string | null
          calle?: string
          codigo_postal?: string
          comercio_id?: string | null
          created_at?: string
          cuit?: string
          email?: string | null
          id?: string
          ingresos_brutos?: string | null
          localidad?: string
          nombre?: string
          numero?: string
          provincia?: string
          razon_social?: string | null
          situacion_afip?: string
          telefono?: string | null
          tipo_persona?: string
          updated_at?: string
        }
        Relationships: []
      }
      rubros: {
        Row: {
          comercio_id: string | null
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          comercio_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          comercio_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      subrubros: {
        Row: {
          comercio_id: string | null
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          rubro_id: string
          updated_at: string
        }
        Insert: {
          comercio_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          rubro_id: string
          updated_at?: string
        }
        Update: {
          comercio_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          rubro_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subrubros_rubro_id_fkey"
            columns: ["rubro_id"]
            isOneToOne: false
            referencedRelation: "rubros"
            referencedColumns: ["id"]
          },
        ]
      }
      tarjeta_cuotas: {
        Row: {
          activa: boolean
          cantidad_cuotas: number
          comercio_id: string | null
          created_at: string
          id: string
          porcentaje_recargo: number
          tarjeta_id: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          cantidad_cuotas: number
          comercio_id?: string | null
          created_at?: string
          id?: string
          porcentaje_recargo?: number
          tarjeta_id: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          cantidad_cuotas?: number
          comercio_id?: string | null
          created_at?: string
          id?: string
          porcentaje_recargo?: number
          tarjeta_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarjeta_cuotas_tarjeta_id_fkey"
            columns: ["tarjeta_id"]
            isOneToOne: false
            referencedRelation: "tarjetas_credito"
            referencedColumns: ["id"]
          },
        ]
      }
      tarjetas_credito: {
        Row: {
          activa: boolean
          comercio_id: string | null
          created_at: string
          id: string
          nombre: string
          observaciones: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          comercio_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          observaciones?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          comercio_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          observaciones?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      venta_items: {
        Row: {
          cantidad: number
          codigo_manual: string | null
          comercio_id: string | null
          created_at: string
          descripcion_manual: string | null
          id: string
          monto_iva: number
          monto_descuento: number
          monto_recargo: number
          porcentaje_iva: number
          porcentaje_descuento: number
          porcentaje_recargo: number
          precio_unitario: number
          producto_id: string | null
          subtotal: number
          total: number
          updated_at: string
          venta_id: string
        }
        Insert: {
          cantidad?: number
          codigo_manual?: string | null
          comercio_id?: string | null
          created_at?: string
          descripcion_manual?: string | null
          id?: string
          monto_iva?: number
          monto_descuento?: number
          monto_recargo?: number
          porcentaje_iva?: number
          porcentaje_descuento?: number
          porcentaje_recargo?: number
          precio_unitario: number
          producto_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          venta_id: string
        }
        Update: {
          cantidad?: number
          codigo_manual?: string | null
          comercio_id?: string | null
          created_at?: string
          descripcion_manual?: string | null
          id?: string
          monto_iva?: number
          monto_descuento?: number
          monto_recargo?: number
          porcentaje_iva?: number
          porcentaje_descuento?: number
          porcentaje_recargo?: number
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          banco_id: string | null
          cae: string | null
          cae_error: string | null
          cae_solicitado_at: string | null
          cae_vencimiento: string | null
          cliente_id: string | null
          cliente_nombre: string | null
          comercio_id: string | null
          created_at: string
          cuotas: number | null
          fecha_venta: string
          id: string
          numero_comprobante: string
          observaciones: string | null
          monto_descuento: number
          monto_recargo: number
          porcentaje_descuento: number
          porcentaje_recargo: number
          recargo_cuotas: number | null
          subtotal: number
          tarjeta_id: string | null
          tipo_comprobante: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          total: number
          total_iva: number
          updated_at: string
        }
        Insert: {
          banco_id?: string | null
          cae?: string | null
          cae_error?: string | null
          cae_solicitado_at?: string | null
          cae_vencimiento?: string | null
          cliente_id?: string | null
          cliente_nombre?: string | null
          comercio_id?: string | null
          created_at?: string
          cuotas?: number | null
          fecha_venta?: string
          id?: string
          numero_comprobante: string
          observaciones?: string | null
          monto_descuento?: number
          monto_recargo?: number
          porcentaje_descuento?: number
          porcentaje_recargo?: number
          recargo_cuotas?: number | null
          subtotal?: number
          tarjeta_id?: string | null
          tipo_comprobante?: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_pago?: Database["public"]["Enums"]["tipo_pago"]
          total?: number
          total_iva?: number
          updated_at?: string
        }
        Update: {
          banco_id?: string | null
          cae?: string | null
          cae_error?: string | null
          cae_solicitado_at?: string | null
          cae_vencimiento?: string | null
          cliente_id?: string | null
          cliente_nombre?: string | null
          comercio_id?: string | null
          created_at?: string
          cuotas?: number | null
          fecha_venta?: string
          id?: string
          numero_comprobante?: string
          observaciones?: string | null
          monto_descuento?: number
          monto_recargo?: number
          porcentaje_descuento?: number
          porcentaje_recargo?: number
          recargo_cuotas?: number | null
          subtotal?: number
          tarjeta_id?: string | null
          tipo_comprobante?: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_pago?: Database["public"]["Enums"]["tipo_pago"]
          total?: number
          total_iva?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_tarjeta_id_fkey"
            columns: ["tarjeta_id"]
            isOneToOne: false
            referencedRelation: "tarjetas_credito"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_comercio_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_comercio_login: {
        Args: { target_comercio_id: string }
        Returns: {
          id: string
          nombre_comercio: string
          localidad: string
          provincia: string
          logo_url: string | null
        }[]
      }
      user_belongs_to_comercio: {
        Args: { target_comercio_id: string }
        Returns: boolean
      }
      user_is_comercio_admin: {
        Args: { target_comercio_id: string }
        Returns: boolean
      }
      is_app_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      estado_cheque: "en_cartera" | "depositado" | "rechazado" | "endosado"
      tipo_comprobante:
        | "factura_a"
        | "factura_b"
        | "factura_c"
        | "nota_credito_a"
        | "nota_credito_b"
        | "nota_credito_c"
        | "nota_debito_a"
        | "nota_debito_b"
        | "nota_debito_c"
        | "recibo_a"
        | "recibo_b"
        | "recibo_c"
        | "ticket_fiscal"
        | "factura_exportacion"
      tipo_cuenta_bancaria:
        | "CA_PESOS"
        | "CA_USD"
        | "CC_PESOS"
        | "CC_USD"
        | "CAJA_AHORRO"
        | "CUENTA_SUELDO"
      tipo_moneda: "ARS" | "USD" | "USD_BLUE"
      tipo_pago: "contado" | "transferencia" | "tarjeta" | "cheque" | "cta_cte"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_cheque: ["en_cartera", "depositado", "rechazado", "endosado"],
      tipo_comprobante: [
        "factura_a",
        "factura_b",
        "factura_c",
        "nota_credito_a",
        "nota_credito_b",
        "nota_credito_c",
        "nota_debito_a",
        "nota_debito_b",
        "nota_debito_c",
        "recibo_a",
        "recibo_b",
        "recibo_c",
        "ticket_fiscal",
        "factura_exportacion",
      ],
      tipo_cuenta_bancaria: [
        "CA_PESOS",
        "CA_USD",
        "CC_PESOS",
        "CC_USD",
        "CAJA_AHORRO",
        "CUENTA_SUELDO",
      ],
      tipo_moneda: ["ARS", "USD", "USD_BLUE"],
      tipo_pago: ["contado", "transferencia", "tarjeta", "cheque", "cta_cte"],
    },
  },
} as const
