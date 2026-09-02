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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
        Relationships: [
          {
            foreignKeyName: "afip_config_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
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
        Relationships: [
          {
            foreignKeyName: "bancos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_movimientos: {
        Row: {
          caja_id: string
          comercio_id: string | null
          concepto: string
          created_at: string
          descripcion: string | null
          fecha_movimiento: string
          id: string
          monto: number
          tipo: string
          updated_at: string
          venta_id: string | null
        }
        Insert: {
          caja_id: string
          comercio_id?: string | null
          concepto: string
          created_at?: string
          descripcion?: string | null
          fecha_movimiento?: string
          id?: string
          monto: number
          tipo: string
          updated_at?: string
          venta_id?: string | null
        }
        Update: {
          caja_id?: string
          comercio_id?: string | null
          concepto?: string
          created_at?: string
          descripcion?: string | null
          fecha_movimiento?: string
          id?: string
          monto?: number
          tipo?: string
          updated_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas_diarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_movimientos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_movimientos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas_diarias: {
        Row: {
          abierto_at: string
          cerrado_at: string | null
          comercio_id: string | null
          created_at: string
          diferencia: number | null
          estado: string
          fecha: string
          id: string
          monto_apertura: number
          monto_cierre_real: number | null
          monto_cierre_sistema: number | null
          observaciones_apertura: string | null
          observaciones_cierre: string | null
          updated_at: string
        }
        Insert: {
          abierto_at?: string
          cerrado_at?: string | null
          comercio_id?: string | null
          created_at?: string
          diferencia?: number | null
          estado?: string
          fecha?: string
          id?: string
          monto_apertura?: number
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          observaciones_apertura?: string | null
          observaciones_cierre?: string | null
          updated_at?: string
        }
        Update: {
          abierto_at?: string
          cerrado_at?: string | null
          comercio_id?: string | null
          created_at?: string
          diferencia?: number | null
          estado?: string
          fecha?: string
          id?: string
          monto_apertura?: number
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          observaciones_apertura?: string | null
          observaciones_cierre?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_diarias_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      campo_establecimientos: {
        Row: {
          activo: boolean
          cliente_id: string
          codigo_interno: string | null
          comercio_id: string
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          direccion: string | null
          id: string
          latitud: number | null
          localidad: string | null
          longitud: number | null
          nombre: string
          observaciones: string | null
          provincia: string | null
          superficie_total_ha: number | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cliente_id: string
          codigo_interno?: string | null
          comercio_id: string
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          direccion?: string | null
          id?: string
          latitud?: number | null
          localidad?: string | null
          longitud?: number | null
          nombre: string
          observaciones?: string | null
          provincia?: string | null
          superficie_total_ha?: number | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cliente_id?: string
          codigo_interno?: string | null
          comercio_id?: string
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          direccion?: string | null
          id?: string
          latitud?: number | null
          localidad?: string | null
          longitud?: number | null
          nombre?: string
          observaciones?: string | null
          provincia?: string | null
          superficie_total_ha?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campo_establecimientos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campo_establecimientos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      campo_lotes: {
        Row: {
          activo: boolean
          codigo_interno: string | null
          comercio_id: string
          created_at: string
          establecimiento_id: string
          id: string
          latitud: number | null
          longitud: number | null
          nombre: string
          observaciones: string | null
          superficie_ha: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo_interno?: string | null
          comercio_id: string
          created_at?: string
          establecimiento_id: string
          id?: string
          latitud?: number | null
          longitud?: number | null
          nombre: string
          observaciones?: string | null
          superficie_ha: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo_interno?: string | null
          comercio_id?: string
          created_at?: string
          establecimiento_id?: string
          id?: string
          latitud?: number | null
          longitud?: number | null
          nombre?: string
          observaciones?: string | null
          superficie_ha?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campo_lotes_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campo_lotes_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "campo_establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      campo_orden_labor_lotes: {
        Row: {
          activo: boolean
          cantidad_planificada: number
          comercio_id: string
          created_at: string
          created_by: string
          id: string
          lote_id: string
          observaciones: string | null
          orden_labor_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          activo?: boolean
          cantidad_planificada: number
          comercio_id: string
          created_at?: string
          created_by?: string
          id?: string
          lote_id: string
          observaciones?: string | null
          orden_labor_id: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          activo?: boolean
          cantidad_planificada?: number
          comercio_id?: string
          created_at?: string
          created_by?: string
          id?: string
          lote_id?: string
          observaciones?: string | null
          orden_labor_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "campo_orden_labor_lotes_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campo_orden_labor_lotes_labor_fkey"
            columns: ["comercio_id", "orden_labor_id"]
            isOneToOne: false
            referencedRelation: "campo_orden_labores"
            referencedColumns: ["comercio_id", "id"]
          },
          {
            foreignKeyName: "campo_orden_labor_lotes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "campo_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      campo_orden_labores: {
        Row: {
          activo: boolean
          codigo_interno: string | null
          comercio_id: string
          created_at: string
          created_by: string
          descripcion: string | null
          id: string
          nombre: string
          orden_id: string
          posicion: number
          unidad: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          activo?: boolean
          codigo_interno?: string | null
          comercio_id: string
          created_at?: string
          created_by?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden_id: string
          posicion?: number
          unidad: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          activo?: boolean
          codigo_interno?: string | null
          comercio_id?: string
          created_at?: string
          created_by?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden_id?: string
          posicion?: number
          unidad?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "campo_orden_labores_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campo_orden_labores_orden_fkey"
            columns: ["comercio_id", "orden_id"]
            isOneToOne: false
            referencedRelation: "campo_ordenes_trabajo"
            referencedColumns: ["comercio_id", "id"]
          },
        ]
      }
      campo_ordenes_trabajo: {
        Row: {
          cancelada_at: string | null
          cliente_id: string
          codigo_interno: string | null
          comercio_id: string
          created_at: string
          created_by: string
          descripcion: string | null
          establecimiento_id: string
          estado: string
          fecha_fin_planificada: string | null
          fecha_inicio_planificada: string | null
          finalizada_at: string | null
          id: string
          iniciada_at: string | null
          numero: number
          observaciones: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          cancelada_at?: string | null
          cliente_id: string
          codigo_interno?: string | null
          comercio_id: string
          created_at?: string
          created_by?: string
          descripcion?: string | null
          establecimiento_id: string
          estado?: string
          fecha_fin_planificada?: string | null
          fecha_inicio_planificada?: string | null
          finalizada_at?: string | null
          id?: string
          iniciada_at?: string | null
          numero?: number
          observaciones?: string | null
          updated_at?: string
          updated_by?: string
        }
        Update: {
          cancelada_at?: string | null
          cliente_id?: string
          codigo_interno?: string | null
          comercio_id?: string
          created_at?: string
          created_by?: string
          descripcion?: string | null
          establecimiento_id?: string
          estado?: string
          fecha_fin_planificada?: string | null
          fecha_inicio_planificada?: string | null
          finalizada_at?: string | null
          id?: string
          iniciada_at?: string | null
          numero?: number
          observaciones?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "campo_ordenes_trabajo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campo_ordenes_trabajo_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campo_ordenes_trabajo_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "campo_establecimientos"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "cheques_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
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
      cliente_usuarios: {
        Row: {
          cliente_id: string
          comercio_id: string
          created_at: string
          id: string
          metodo: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          comercio_id: string
          created_at?: string
          id?: string
          metodo: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          comercio_id?: string
          created_at?: string
          id?: string
          metodo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_usuarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_usuarios_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_vinculaciones_pendientes: {
        Row: {
          coincidencias: number
          comercio_id: string
          created_at: string
          email: string
          id: string
          motivo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coincidencias?: number
          comercio_id: string
          created_at?: string
          email: string
          id?: string
          motivo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coincidencias?: number
          comercio_id?: string
          created_at?: string
          email?: string
          id?: string
          motivo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_vinculaciones_pendientes_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
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
        Relationships: [
          {
            foreignKeyName: "clientes_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
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
          situacion_afip: string | null
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
          situacion_afip?: string | null
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
          situacion_afip?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      comercio_parametrizacion: {
        Row: {
          comercio_id: string
          created_at: string
          id: string
          parametros: Json
          updated_at: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          id?: string
          parametros?: Json
          updated_at?: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          id?: string
          parametros?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comercio_parametrizacion_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: true
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "cuenta_corriente_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
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
      historial_legacy: {
        Row: {
          comercio_id: string
          created_at: string
          datos: Json
          fecha: string | null
          id: string
          migracion_id: string
          source_id: string
          tipo: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          datos: Json
          fecha?: string | null
          id?: string
          migracion_id: string
          source_id: string
          tipo: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          datos?: Json
          fecha?: string | null
          id?: string
          migracion_id?: string
          source_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "historial_legacy_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_legacy_migracion_id_fkey"
            columns: ["migracion_id"]
            isOneToOne: false
            referencedRelation: "migraciones"
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
        Relationships: [
          {
            foreignKeyName: "marcas_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_cajas: {
        Row: {
          activa: boolean
          comercio_id: string
          created_at: string
          external_pos_id: string
          id: string
          mp_pos_id: string | null
          nombre: string
          qr_data: string | null
          sucursal_id: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          comercio_id: string
          created_at?: string
          external_pos_id: string
          id?: string
          mp_pos_id?: string | null
          nombre: string
          qr_data?: string | null
          sucursal_id?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          comercio_id?: string
          created_at?: string
          external_pos_id?: string
          id?: string
          mp_pos_id?: string | null
          nombre?: string
          qr_data?: string | null
          sucursal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_cajas_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercadopago_cajas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "mercadopago_sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_configuraciones: {
        Row: {
          ambiente: string
          checkout_habilitado: boolean
          comercio_id: string
          confirmar_pedido_automaticamente: boolean
          connected: boolean
          convertir_pedido_en_venta: boolean
          created_at: string
          cuenta_email: string | null
          last_error: string | null
          minutos_reserva: number
          modo_qr: string
          mp_user_id: string | null
          qr_habilitado: boolean
          registrar_en_caja: boolean
          reservar_stock: boolean
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          ambiente?: string
          checkout_habilitado?: boolean
          comercio_id: string
          confirmar_pedido_automaticamente?: boolean
          connected?: boolean
          convertir_pedido_en_venta?: boolean
          created_at?: string
          cuenta_email?: string | null
          last_error?: string | null
          minutos_reserva?: number
          modo_qr?: string
          mp_user_id?: string | null
          qr_habilitado?: boolean
          registrar_en_caja?: boolean
          reservar_stock?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string
          checkout_habilitado?: boolean
          comercio_id?: string
          confirmar_pedido_automaticamente?: boolean
          connected?: boolean
          convertir_pedido_en_venta?: boolean
          created_at?: string
          cuenta_email?: string | null
          last_error?: string | null
          minutos_reserva?: number
          modo_qr?: string
          mp_user_id?: string | null
          qr_habilitado?: boolean
          registrar_en_caja?: boolean
          reservar_stock?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_configuraciones_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: true
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_credenciales: {
        Row: {
          access_token: string
          comercio_id: string
          created_at: string
          expires_at: string | null
          mp_user_id: string
          public_key: string | null
          refresh_token: string | null
          scopes: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          comercio_id: string
          created_at?: string
          expires_at?: string | null
          mp_user_id: string
          public_key?: string | null
          refresh_token?: string | null
          scopes?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          comercio_id?: string
          created_at?: string
          expires_at?: string | null
          mp_user_id?: string
          public_key?: string | null
          refresh_token?: string | null
          scopes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_credenciales_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: true
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_oauth_estados: {
        Row: {
          comercio_id: string
          created_at: string
          expires_at: string
          redirect_to: string | null
          state_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          expires_at: string
          redirect_to?: string | null
          state_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          expires_at?: string
          redirect_to?: string | null
          state_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_oauth_estados_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_operaciones: {
        Row: {
          ambiente: string
          approved_at: string | null
          caja_mp_id: string | null
          checkout_url: string | null
          comercio_id: string
          created_at: string
          cuotas: number | null
          estado: string
          estado_detalle: string | null
          expires_at: string | null
          external_reference: string
          id: string
          idempotency_key: string
          importe: number
          importe_reembolsado: number
          medio_pago: string | null
          modalidad: string
          moneda: string
          order_id: string | null
          origen: string
          pago_venta_id: string | null
          payment_id: string | null
          pedido_online_id: string | null
          preference_id: string | null
          qr_data: string | null
          raw_response: Json
          updated_at: string
          venta_id: string | null
        }
        Insert: {
          ambiente: string
          approved_at?: string | null
          caja_mp_id?: string | null
          checkout_url?: string | null
          comercio_id: string
          created_at?: string
          cuotas?: number | null
          estado?: string
          estado_detalle?: string | null
          expires_at?: string | null
          external_reference: string
          id?: string
          idempotency_key?: string
          importe: number
          importe_reembolsado?: number
          medio_pago?: string | null
          modalidad: string
          moneda?: string
          order_id?: string | null
          origen: string
          pago_venta_id?: string | null
          payment_id?: string | null
          pedido_online_id?: string | null
          preference_id?: string | null
          qr_data?: string | null
          raw_response?: Json
          updated_at?: string
          venta_id?: string | null
        }
        Update: {
          ambiente?: string
          approved_at?: string | null
          caja_mp_id?: string | null
          checkout_url?: string | null
          comercio_id?: string
          created_at?: string
          cuotas?: number | null
          estado?: string
          estado_detalle?: string | null
          expires_at?: string | null
          external_reference?: string
          id?: string
          idempotency_key?: string
          importe?: number
          importe_reembolsado?: number
          medio_pago?: string | null
          modalidad?: string
          moneda?: string
          order_id?: string | null
          origen?: string
          pago_venta_id?: string | null
          payment_id?: string | null
          pedido_online_id?: string | null
          preference_id?: string | null
          qr_data?: string | null
          raw_response?: Json
          updated_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_operaciones_caja_mp_id_fkey"
            columns: ["caja_mp_id"]
            isOneToOne: false
            referencedRelation: "mercadopago_cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercadopago_operaciones_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercadopago_operaciones_pago_venta_id_fkey"
            columns: ["pago_venta_id"]
            isOneToOne: false
            referencedRelation: "pagos_venta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercadopago_operaciones_pedido_online_id_fkey"
            columns: ["pedido_online_id"]
            isOneToOne: false
            referencedRelation: "pedidos_online"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercadopago_operaciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_sucursales: {
        Row: {
          activa: boolean
          comercio_id: string
          created_at: string
          direccion: Json
          external_store_id: string
          id: string
          mp_store_id: string | null
          nombre: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          comercio_id: string
          created_at?: string
          direccion?: Json
          external_store_id: string
          id?: string
          mp_store_id?: string | null
          nombre: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          comercio_id?: string
          created_at?: string
          direccion?: Json
          external_store_id?: string
          id?: string
          mp_store_id?: string | null
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_sucursales_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_webhook_eventos: {
        Row: {
          comercio_id: string | null
          created_at: string
          error: string | null
          evento_externo_id: string | null
          firma_valida: boolean
          id: string
          intentos: number
          payload: Json
          procesado_at: string | null
          recurso_id: string | null
          topic: string | null
        }
        Insert: {
          comercio_id?: string | null
          created_at?: string
          error?: string | null
          evento_externo_id?: string | null
          firma_valida?: boolean
          id?: string
          intentos?: number
          payload?: Json
          procesado_at?: string | null
          recurso_id?: string | null
          topic?: string | null
        }
        Update: {
          comercio_id?: string | null
          created_at?: string
          error?: string | null
          evento_externo_id?: string | null
          firma_valida?: boolean
          id?: string
          intentos?: number
          payload?: Json
          procesado_at?: string | null
          recurso_id?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_webhook_eventos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      migracion_id_map: {
        Row: {
          accion: string
          comercio_id: string
          created_at: string
          entidad: string
          id: string
          id_destino: string
          id_origen: string
          migracion_id: string
        }
        Insert: {
          accion?: string
          comercio_id: string
          created_at?: string
          entidad: string
          id?: string
          id_destino: string
          id_origen: string
          migracion_id: string
        }
        Update: {
          accion?: string
          comercio_id?: string
          created_at?: string
          entidad?: string
          id?: string
          id_destino?: string
          id_origen?: string
          migracion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "migracion_id_map_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migracion_id_map_migracion_id_fkey"
            columns: ["migracion_id"]
            isOneToOne: false
            referencedRelation: "migraciones"
            referencedColumns: ["id"]
          },
        ]
      }
      migracion_modulos: {
        Row: {
          actualizados: number
          created_at: string
          dependencias: string[]
          diagnostico: Json
          errores: number
          estado: Database["public"]["Enums"]["migracion_modulo_estado"]
          id: string
          insertados: number
          migracion_id: string
          modulo: string
          omitidos: number
          registros_origen: number
          registros_validos: number
          tabla_destino: string | null
          tabla_origen: string
          updated_at: string
        }
        Insert: {
          actualizados?: number
          created_at?: string
          dependencias?: string[]
          diagnostico?: Json
          errores?: number
          estado?: Database["public"]["Enums"]["migracion_modulo_estado"]
          id?: string
          insertados?: number
          migracion_id: string
          modulo: string
          omitidos?: number
          registros_origen?: number
          registros_validos?: number
          tabla_destino?: string | null
          tabla_origen: string
          updated_at?: string
        }
        Update: {
          actualizados?: number
          created_at?: string
          dependencias?: string[]
          diagnostico?: Json
          errores?: number
          estado?: Database["public"]["Enums"]["migracion_modulo_estado"]
          id?: string
          insertados?: number
          migracion_id?: string
          modulo?: string
          omitidos?: number
          registros_origen?: number
          registros_validos?: number
          tabla_destino?: string | null
          tabla_origen?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migracion_modulos_migracion_id_fkey"
            columns: ["migracion_id"]
            isOneToOne: false
            referencedRelation: "migraciones"
            referencedColumns: ["id"]
          },
        ]
      }
      migracion_staging_maestros: {
        Row: {
          accion: string | null
          comercio_id: string
          created_at: string
          datos: Json
          destino_id: string | null
          errores: string[]
          estado: string
          id: number
          migracion_id: string
          modulo: string
          source_id: string
        }
        Insert: {
          accion?: string | null
          comercio_id: string
          created_at?: string
          datos: Json
          destino_id?: string | null
          errores?: string[]
          estado?: string
          id?: never
          migracion_id: string
          modulo: string
          source_id: string
        }
        Update: {
          accion?: string | null
          comercio_id?: string
          created_at?: string
          datos?: Json
          destino_id?: string | null
          errores?: string[]
          estado?: string
          id?: never
          migracion_id?: string
          modulo?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "migracion_staging_maestros_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migracion_staging_maestros_migracion_id_fkey"
            columns: ["migracion_id"]
            isOneToOne: false
            referencedRelation: "migraciones"
            referencedColumns: ["id"]
          },
        ]
      }
      migracion_staging_operaciones: {
        Row: {
          comercio_id: string
          datos: Json
          destino_id: string | null
          errores: string[]
          estado: string
          id: string
          migracion_id: string
          modulo: string
          source_id: string
        }
        Insert: {
          comercio_id: string
          datos: Json
          destino_id?: string | null
          errores?: string[]
          estado?: string
          id?: string
          migracion_id: string
          modulo: string
          source_id: string
        }
        Update: {
          comercio_id?: string
          datos?: Json
          destino_id?: string | null
          errores?: string[]
          estado?: string
          id?: string
          migracion_id?: string
          modulo?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "migracion_staging_operaciones_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migracion_staging_operaciones_migracion_id_fkey"
            columns: ["migracion_id"]
            isOneToOne: false
            referencedRelation: "migraciones"
            referencedColumns: ["id"]
          },
        ]
      }
      migraciones: {
        Row: {
          archivo_hash: string | null
          archivo_nombre: string
          archivo_tamano: number | null
          comercio_id: string
          creado_por: string
          created_at: string
          estado: Database["public"]["Enums"]["migracion_estado"]
          expires_at: string | null
          id: string
          resumen: Json
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          archivo_hash?: string | null
          archivo_nombre: string
          archivo_tamano?: number | null
          comercio_id: string
          creado_por?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["migracion_estado"]
          expires_at?: string | null
          id?: string
          resumen?: Json
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          archivo_hash?: string | null
          archivo_nombre?: string
          archivo_tamano?: number | null
          comercio_id?: string
          creado_por?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["migracion_estado"]
          expires_at?: string | null
          id?: string
          resumen?: Json
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migraciones_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacion_destinatarios: {
        Row: {
          comercio_id: string
          created_at: string
          id: string
          notificacion_id: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          id?: string
          notificacion_id: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          id?: string
          notificacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacion_destinatarios_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacion_destinatarios_notificacion_id_fkey"
            columns: ["notificacion_id"]
            isOneToOne: false
            referencedRelation: "notificaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacion_lecturas: {
        Row: {
          comercio_id: string | null
          id: string
          notificacion_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          comercio_id?: string | null
          id?: string
          notificacion_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          comercio_id?: string | null
          id?: string
          notificacion_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacion_lecturas_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacion_lecturas_notificacion_id_fkey"
            columns: ["notificacion_id"]
            isOneToOne: false
            referencedRelation: "notificaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          activo: boolean
          categoria: string
          comprobante_fecha: string | null
          comprobante_monto: number | null
          comprobante_numero: string | null
          comprobante_periodo: string | null
          created_at: string
          created_by: string | null
          id: string
          mensaje: string
          metadata: Json
          prioridad: string
          titulo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria?: string
          comprobante_fecha?: string | null
          comprobante_monto?: number | null
          comprobante_numero?: string | null
          comprobante_periodo?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mensaje: string
          metadata?: Json
          prioridad?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          comprobante_fecha?: string | null
          comprobante_monto?: number | null
          comprobante_numero?: string | null
          comprobante_periodo?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mensaje?: string
          metadata?: Json
          prioridad?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      pagos_venta: {
        Row: {
          banco_id: string | null
          cheque_id: string | null
          comercio_id: string | null
          comision_snapshot_at: string | null
          created_at: string
          cuotas: number | null
          estado_conciliacion: string
          fecha_acreditacion: string | null
          id: string
          mercadopago_operacion_id: string | null
          monto: number
          monto_comision_estimado: number
          monto_comision_real: number | null
          monto_neto_acreditado: number | null
          monto_neto_estimado: number
          observaciones_conciliacion: string | null
          porcentaje_comision_aplicado: number
          recargo_cuotas: number | null
          referencia_liquidacion: string | null
          tarjeta_id: string | null
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          updated_at: string
          venta_id: string
        }
        Insert: {
          banco_id?: string | null
          cheque_id?: string | null
          comercio_id?: string | null
          comision_snapshot_at?: string | null
          created_at?: string
          cuotas?: number | null
          estado_conciliacion?: string
          fecha_acreditacion?: string | null
          id?: string
          mercadopago_operacion_id?: string | null
          monto?: number
          monto_comision_estimado?: number
          monto_comision_real?: number | null
          monto_neto_acreditado?: number | null
          monto_neto_estimado?: number
          observaciones_conciliacion?: string | null
          porcentaje_comision_aplicado?: number
          recargo_cuotas?: number | null
          referencia_liquidacion?: string | null
          tarjeta_id?: string | null
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          updated_at?: string
          venta_id: string
        }
        Update: {
          banco_id?: string | null
          cheque_id?: string | null
          comercio_id?: string | null
          comision_snapshot_at?: string | null
          created_at?: string
          cuotas?: number | null
          estado_conciliacion?: string
          fecha_acreditacion?: string | null
          id?: string
          mercadopago_operacion_id?: string | null
          monto?: number
          monto_comision_estimado?: number
          monto_comision_real?: number | null
          monto_neto_acreditado?: number | null
          monto_neto_estimado?: number
          observaciones_conciliacion?: string | null
          porcentaje_comision_aplicado?: number
          recargo_cuotas?: number | null
          referencia_liquidacion?: string | null
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
          {
            foreignKeyName: "pagos_venta_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_venta_mercadopago_operacion_id_fkey"
            columns: ["mercadopago_operacion_id"]
            isOneToOne: false
            referencedRelation: "mercadopago_operaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_online_items: {
        Row: {
          cantidad: number
          descripcion: string
          id: string
          pedido_id: string
          precio_unitario: number
          producto_id: string
          subtotal: number
        }
        Insert: {
          cantidad: number
          descripcion: string
          id?: string
          pedido_id: string
          precio_unitario: number
          producto_id: string
          subtotal: number
        }
        Update: {
          cantidad?: number
          descripcion?: string
          id?: string
          pedido_id?: string
          precio_unitario?: number
          producto_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_online_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_online"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_online_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_online_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "tienda_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_online: {
        Row: {
          cliente_direccion: string
          cliente_email: string
          cliente_id: string | null
          cliente_nombre: string
          cliente_telefono: string
          cliente_user_id: string
          comercio_id: string
          created_at: string
          estado: string
          estado_pago: string
          id: string
          importe_pagado: number
          numero: number
          observaciones: string | null
          total: number
          updated_at: string
          venta_id: string | null
        }
        Insert: {
          cliente_direccion: string
          cliente_email: string
          cliente_id?: string | null
          cliente_nombre: string
          cliente_telefono: string
          cliente_user_id: string
          comercio_id: string
          created_at?: string
          estado?: string
          estado_pago?: string
          id?: string
          importe_pagado?: number
          numero?: never
          observaciones?: string | null
          total: number
          updated_at?: string
          venta_id?: string | null
        }
        Update: {
          cliente_direccion?: string
          cliente_email?: string
          cliente_id?: string | null
          cliente_nombre?: string
          cliente_telefono?: string
          cliente_user_id?: string
          comercio_id?: string
          created_at?: string
          estado?: string
          estado_pago?: string
          id?: string
          importe_pagado?: number
          numero?: never
          observaciones?: string | null
          total?: number
          updated_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_online_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_online_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_online_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_items: {
        Row: {
          cantidad: number
          codigo_manual: string | null
          comercio_id: string
          created_at: string
          descripcion_manual: string | null
          id: string
          monto_descuento: number
          monto_iva: number
          monto_recargo: number
          porcentaje_descuento: number
          porcentaje_iva: number
          porcentaje_recargo: number
          precio_unitario: number
          presupuesto_id: string
          producto_id: string | null
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          cantidad?: number
          codigo_manual?: string | null
          comercio_id: string
          created_at?: string
          descripcion_manual?: string | null
          id?: string
          monto_descuento?: number
          monto_iva?: number
          monto_recargo?: number
          porcentaje_descuento?: number
          porcentaje_iva?: number
          porcentaje_recargo?: number
          precio_unitario: number
          presupuesto_id: string
          producto_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cantidad?: number
          codigo_manual?: string | null
          comercio_id?: string
          created_at?: string
          descripcion_manual?: string | null
          id?: string
          monto_descuento?: number
          monto_iva?: number
          monto_recargo?: number
          porcentaje_descuento?: number
          porcentaje_iva?: number
          porcentaje_recargo?: number
          precio_unitario?: number
          presupuesto_id?: string
          producto_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_items_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_items_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "tienda_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_pagos: {
        Row: {
          banco_id: string | null
          cheque_id: string | null
          comercio_id: string
          created_at: string
          cuotas: number | null
          id: string
          monto: number
          presupuesto_id: string
          recargo_cuotas: number | null
          tarjeta_id: string | null
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          updated_at: string
        }
        Insert: {
          banco_id?: string | null
          cheque_id?: string | null
          comercio_id: string
          created_at?: string
          cuotas?: number | null
          id?: string
          monto?: number
          presupuesto_id: string
          recargo_cuotas?: number | null
          tarjeta_id?: string | null
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          updated_at?: string
        }
        Update: {
          banco_id?: string | null
          cheque_id?: string | null
          comercio_id?: string
          created_at?: string
          cuotas?: number | null
          id?: string
          monto?: number
          presupuesto_id?: string
          recargo_cuotas?: number | null
          tarjeta_id?: string | null
          tipo_pago?: Database["public"]["Enums"]["tipo_pago"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_pagos_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_pagos_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_pagos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_pagos_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_pagos_tarjeta_id_fkey"
            columns: ["tarjeta_id"]
            isOneToOne: false
            referencedRelation: "tarjetas_credito"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          cliente_id: string | null
          cliente_nombre: string | null
          comercio_id: string
          confirmado_at: string | null
          created_at: string
          estado: string
          fecha_venta: string
          id: string
          monto_descuento: number
          monto_recargo: number
          numero_comprobante: string
          observaciones: string | null
          porcentaje_descuento: number
          porcentaje_recargo: number
          subtotal: number
          tipo_comprobante: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_pago: Database["public"]["Enums"]["tipo_pago"]
          total: number
          total_iva: number
          updated_at: string
          venta_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          cliente_nombre?: string | null
          comercio_id: string
          confirmado_at?: string | null
          created_at?: string
          estado?: string
          fecha_venta?: string
          id?: string
          monto_descuento?: number
          monto_recargo?: number
          numero_comprobante: string
          observaciones?: string | null
          porcentaje_descuento?: number
          porcentaje_recargo?: number
          subtotal?: number
          tipo_comprobante?: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_pago?: Database["public"]["Enums"]["tipo_pago"]
          total?: number
          total_iva?: number
          updated_at?: string
          venta_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          cliente_nombre?: string | null
          comercio_id?: string
          confirmado_at?: string | null
          created_at?: string
          estado?: string
          fecha_venta?: string
          id?: string
          monto_descuento?: number
          monto_recargo?: number
          numero_comprobante?: string
          observaciones?: string | null
          porcentaje_descuento?: number
          porcentaje_recargo?: number
          subtotal?: number
          tipo_comprobante?: Database["public"]["Enums"]["tipo_comprobante"]
          tipo_pago?: Database["public"]["Enums"]["tipo_pago"]
          total?: number
          total_iva?: number
          updated_at?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_imagenes: {
        Row: {
          comercio_id: string
          created_at: string
          id: string
          orden: number
          producto_id: string
          storage_path: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          id?: string
          orden: number
          producto_id: string
          storage_path: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          id?: string
          orden?: number
          producto_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_imagenes_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_imagenes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_imagenes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "tienda_productos"
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
          descripcion_tienda_html: string | null
          destacado_en_tienda: boolean
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
          visible_en_tienda: boolean
        }
        Insert: {
          cod_barras?: string | null
          cod_producto: string
          comercio_id?: string | null
          created_at?: string
          descripcion: string
          descripcion_tienda_html?: string | null
          destacado_en_tienda?: boolean
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
          visible_en_tienda?: boolean
        }
        Update: {
          cod_barras?: string | null
          cod_producto?: string
          comercio_id?: string | null
          created_at?: string
          descripcion?: string
          descripcion_tienda_html?: string | null
          destacado_en_tienda?: boolean
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
          visible_en_tienda?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "productos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
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
        Relationships: [
          {
            foreignKeyName: "proveedores_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "rubros_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "subrubros_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "tarjeta_cuotas_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
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
          porcentaje_comision: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          comercio_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          observaciones?: string | null
          porcentaje_comision?: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          comercio_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          observaciones?: string | null
          porcentaje_comision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarjetas_credito_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
      tienda_favoritos: {
        Row: {
          created_at: string
          producto_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          producto_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          producto_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tienda_favoritos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tienda_favoritos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "tienda_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_items: {
        Row: {
          cantidad: number
          codigo_manual: string | null
          comercio_id: string | null
          created_at: string
          descripcion_manual: string | null
          id: string
          monto_descuento: number
          monto_iva: number
          monto_recargo: number
          porcentaje_descuento: number
          porcentaje_iva: number
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
          monto_descuento?: number
          monto_iva?: number
          monto_recargo?: number
          porcentaje_descuento?: number
          porcentaje_iva?: number
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
          monto_descuento?: number
          monto_iva?: number
          monto_recargo?: number
          porcentaje_descuento?: number
          porcentaje_iva?: number
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
            foreignKeyName: "venta_items_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "tienda_productos"
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
          monto_descuento: number
          monto_recargo: number
          numero_comprobante: string
          observaciones: string | null
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
          monto_descuento?: number
          monto_recargo?: number
          numero_comprobante: string
          observaciones?: string | null
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
          monto_descuento?: number
          monto_recargo?: number
          numero_comprobante?: string
          observaciones?: string | null
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
            foreignKeyName: "ventas_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
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
      tienda_productos: {
        Row: {
          cod_producto: string | null
          comercio_id: string | null
          created_at: string | null
          descripcion: string | null
          descripcion_tienda_html: string | null
          destacado_en_tienda: boolean | null
          id: string | null
          imagen_path: string | null
          imagen_paths: string[] | null
          marca_nombre: string | null
          observaciones: string | null
          precio_venta: number | null
          rubro_nombre: string | null
          stock: number | null
          subrubro_nombre: string | null
          tipo_moneda: Database["public"]["Enums"]["tipo_moneda"] | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercio"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      actualizar_estado_pedido_online: {
        Args: { p_estado: string; p_pedido_id: string }
        Returns: {
          cliente_direccion: string
          cliente_email: string
          cliente_id: string | null
          cliente_nombre: string
          cliente_telefono: string
          cliente_user_id: string
          comercio_id: string
          created_at: string
          estado: string
          estado_pago: string
          id: string
          importe_pagado: number
          numero: number
          observaciones: string | null
          total: number
          updated_at: string
          venta_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pedidos_online"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      actualizar_formato_impresion_comercio: {
        Args: { p_comercio_id: string; p_formato: string }
        Returns: Json
      }
      actualizar_mi_cliente_tienda: {
        Args: { p_datos: Json }
        Returns: undefined
      }
      confirmar_presupuesto: {
        Args: { p_presupuesto_id: string }
        Returns: string
      }
      crear_pedido_online: {
        Args: { p_cliente: Json; p_items: Json }
        Returns: Json
      }
      current_comercio_id: { Args: never; Returns: string }
      get_comercio_login: {
        Args: { target_comercio_id: string }
        Returns: {
          id: string
          localidad: string
          logo_url: string
          nombre_comercio: string
          provincia: string
        }[]
      }
      get_estado_pago_pedido: { Args: { p_pedido_id: string }; Returns: Json }
      get_mi_historial_compras: { Args: never; Returns: Json }
      get_tienda_comercio_contacto: {
        Args: { target_comercio_id: string }
        Returns: {
          calle: string
          localidad: string
          numero: string
          provincia: string
          telefono: string
        }[]
      }
      get_tienda_pago_config: {
        Args: { target_comercio_id: string }
        Returns: Json
      }
      is_app_admin: { Args: never; Returns: boolean }
      migracion_aplicar_cierre: {
        Args: {
          p_archivo_hash: string
          p_archivo_nombre: string
          p_archivo_tamano: number
          p_comercio_id: string
          p_payload: Json
        }
        Returns: Json
      }
      migracion_aplicar_maestros: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_aplicar_operaciones: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_aplicar_operaciones_v1: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_assert_admin: { Args: never; Returns: undefined }
      migracion_cargar_staging_maestros: {
        Args: {
          p_filas: Json
          p_migracion_id: string
          p_modulo: string
          p_reemplazar?: boolean
        }
        Returns: number
      }
      migracion_cargar_staging_operaciones: {
        Args: {
          p_filas: Json
          p_migracion_id: string
          p_modulo: string
          p_reemplazar?: boolean
        }
        Returns: number
      }
      migracion_crear_maestros: {
        Args: {
          p_archivo_hash?: string
          p_archivo_nombre: string
          p_archivo_tamano?: number
          p_comercio_id: string
        }
        Returns: string
      }
      migracion_crear_operaciones: {
        Args: {
          p_archivo_hash: string
          p_archivo_nombre: string
          p_archivo_tamano: number
          p_comercio_id: string
        }
        Returns: string
      }
      migracion_revertir_maestros: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_revertir_operaciones: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_revertir_operaciones_v1: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_simular_cierre: {
        Args: { p_comercio_id: string; p_payload: Json }
        Returns: Json
      }
      migracion_simular_maestros: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_simular_maestros_v1: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      migracion_simular_operaciones: {
        Args: { p_migracion_id: string }
        Returns: Json
      }
      notificacion_visible_para_comercio: {
        Args: { target_comercio_id: string; target_notificacion_id: string }
        Returns: boolean
      }
      registrar_pago_mercadopago_aprobado: {
        Args: {
          p_cuotas: number
          p_medio_pago: string
          p_operacion_id: string
          p_payment_id: string
          p_raw: Json
        }
        Returns: undefined
      }
      user_belongs_to_comercio: {
        Args: { target_comercio_id: string }
        Returns: boolean
      }
      user_is_comercio_admin: {
        Args: { target_comercio_id: string }
        Returns: boolean
      }
    }
    Enums: {
      estado_cheque: "en_cartera" | "depositado" | "rechazado" | "endosado"
      migracion_estado:
        | "borrador"
        | "subido"
        | "analizando"
        | "listo"
        | "importando"
        | "completado"
        | "completado_con_errores"
        | "fallido"
        | "cancelado"
      migracion_modulo_estado:
        | "pendiente"
        | "compatible"
        | "requiere_revision"
        | "no_disponible"
        | "listo"
        | "importando"
        | "completado"
        | "completado_con_errores"
        | "fallido"
        | "omitido"
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
        | "recibo_x"
      tipo_cuenta_bancaria:
        | "CA_PESOS"
        | "CA_USD"
        | "CC_PESOS"
        | "CC_USD"
        | "CAJA_AHORRO"
        | "CUENTA_SUELDO"
      tipo_moneda: "ARS" | "USD" | "USD_BLUE"
      tipo_pago:
        | "contado"
        | "transferencia"
        | "tarjeta"
        | "cheque"
        | "cta_cte"
        | "mercado_pago"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      migracion_estado: [
        "borrador",
        "subido",
        "analizando",
        "listo",
        "importando",
        "completado",
        "completado_con_errores",
        "fallido",
        "cancelado",
      ],
      migracion_modulo_estado: [
        "pendiente",
        "compatible",
        "requiere_revision",
        "no_disponible",
        "listo",
        "importando",
        "completado",
        "completado_con_errores",
        "fallido",
        "omitido",
      ],
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
        "recibo_x",
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
      tipo_pago: [
        "contado",
        "transferencia",
        "tarjeta",
        "cheque",
        "cta_cte",
        "mercado_pago",
      ],
    },
  },
} as const
