-- Registrar descuentos y recargos tanto por item como sobre el total de venta.
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS porcentaje_descuento NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS porcentaje_recargo NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_recargo NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.venta_items
  ADD COLUMN IF NOT EXISTS porcentaje_descuento NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS porcentaje_recargo NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_recargo NUMERIC(12,2) NOT NULL DEFAULT 0;

