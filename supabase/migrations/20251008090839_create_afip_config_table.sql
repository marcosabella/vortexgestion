/*
  # Create AFIP Configuration Table

  1. New Tables
    - `afip_config`
      - `id` (uuid, primary key) - Identificador único
      - `punto_venta` (integer, not null) - Número de punto de venta asignado por AFIP
      - `cuit_emisor` (text, not null) - CUIT del comercio emisor
      - `ambiente` (text, not null) - Ambiente de trabajo: 'produccion' o 'homologacion'
      - `certificado_crt` (text, nullable) - Contenido del archivo de certificado digital (.crt)
      - `clave_key` (text, nullable) - Contenido del archivo de clave privada (.key)
      - `activo` (boolean, default true) - Indica si la configuración está activa
      - `created_at` (timestamptz, default now()) - Fecha de creación
      - `updated_at` (timestamptz, default now()) - Fecha de última actualización

  2. Security
    - Enable RLS on `afip_config` table
    - Add policy for authenticated users to read configuration
    - Add policy for authenticated users to insert configuration
    - Add policy for authenticated users to update configuration

  3. Important Notes
    - Solo debe existir una configuración de AFIP por sistema
    - Los certificados se almacenan como texto en la base de datos
    - El ambiente determina si se usa el servidor de pruebas o producción de AFIP
*/

-- Create afip_config table
CREATE TABLE IF NOT EXISTS afip_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_venta integer NOT NULL,
  cuit_emisor text NOT NULL,
  ambiente text NOT NULL CHECK (ambiente IN ('produccion', 'homologacion')),
  certificado_crt text,
  clave_key text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE afip_config ENABLE ROW LEVEL SECURITY;

-- Create policies for afip_config
CREATE POLICY "Allow read access to afip_config"
  ON afip_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert access to afip_config"
  ON afip_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update access to afip_config"
  ON afip_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_afip_config_updated_at'
  ) THEN
    CREATE TRIGGER update_afip_config_updated_at
      BEFORE UPDATE ON afip_config
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
