-- Solo estructura. No modifica datos ni politicas de acceso.
-- Aplicar por separado, con autorizacion, y medir planes/tiempos en el servidor.
CREATE INDEX IF NOT EXISTS ventas_comercio_fecha_creacion_idx
  ON public.ventas (comercio_id, fecha_venta DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS cuenta_corriente_comercio_fecha_id_idx
  ON public.cuenta_corriente (comercio_id, fecha_movimiento DESC, id DESC);

CREATE INDEX IF NOT EXISTS cuenta_corriente_comercio_cliente_fecha_id_idx
  ON public.cuenta_corriente (comercio_id, cliente_id, fecha_movimiento DESC, id DESC);

CREATE INDEX IF NOT EXISTS cuenta_corriente_comercio_id_idx
  ON public.cuenta_corriente (comercio_id, id);

CREATE INDEX IF NOT EXISTS pagos_venta_venta_id_idx
  ON public.pagos_venta (venta_id);
