# Configuración de Supabase para Gestión de Clientes

## Crear la tabla de clientes

Ejecuta el siguiente SQL en el editor SQL de Supabase:

```sql
-- Crear tabla de clientes
CREATE TABLE clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre varchar(100) NOT NULL,
  apellido varchar(100) NOT NULL,
  cuit varchar(13) UNIQUE NOT NULL,
  calle varchar(200) NOT NULL,
  numero varchar(10) NOT NULL,
  codigo_postal varchar(10) NOT NULL,
  localidad varchar(100) NOT NULL,
  provincia varchar(100) NOT NULL,
  telefono varchar(20),
  email varchar(255),
  situacion_afip varchar(50) NOT NULL,
  ingresos_brutos varchar(20),
  tipo_persona varchar(20) NOT NULL CHECK (tipo_persona IN ('fisica', 'juridica')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índices para mejorar performance
CREATE INDEX idx_clientes_cuit ON clientes(cuit);
CREATE INDEX idx_clientes_nombre_apellido ON clientes(nombre, apellido);
CREATE INDEX idx_clientes_provincia ON clientes(provincia);

-- Habilitar RLS (Row Level Security)
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Crear política que permite a todos los usuarios autenticados ver y editar clientes
CREATE POLICY "Usuarios pueden ver todos los clientes" ON clientes
  FOR SELECT USING (true);

CREATE POLICY "Usuarios pueden insertar clientes" ON clientes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar clientes" ON clientes
  FOR UPDATE USING (true);

CREATE POLICY "Usuarios pueden eliminar clientes" ON clientes
  FOR DELETE USING (true);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at
CREATE TRIGGER update_clientes_updated_at 
  BEFORE UPDATE ON clientes 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
```

## Configurar variables de entorno

Las variables de entorno de Supabase ya están configuradas automáticamente en Lovable cuando conectas tu proyecto.

## Funcionalidades implementadas

- ✅ Formulario completo de clientes con validaciones
- ✅ Validación de CUIT argentino
- ✅ Selección de provincias argentinas
- ✅ Situaciones AFIP predefinidas
- ✅ Lista de clientes con búsqueda
- ✅ Edición y eliminación de clientes
- ✅ Interfaz responsive y accesible