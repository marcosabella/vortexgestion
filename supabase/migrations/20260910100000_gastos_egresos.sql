CREATE TABLE IF NOT EXISTS public.gastos_egresos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  categoria text NOT NULL,
  concepto text NOT NULL,
  descripcion text,
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  medio_pago text NOT NULL CHECK (medio_pago IN ('efectivo', 'transferencia', 'tarjeta', 'mercado_pago', 'cuenta_corriente', 'otro')),
  estado text NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pendiente', 'pagado')),
  caja_id uuid REFERENCES public.cajas_diarias(id) ON DELETE SET NULL,
  numero_comprobante text,
  observaciones text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gasto_efectivo_requiere_caja CHECK (medio_pago <> 'efectivo' OR estado = 'pendiente' OR caja_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_gastos_egresos_comercio_fecha ON public.gastos_egresos(comercio_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_egresos_categoria ON public.gastos_egresos(comercio_id, categoria);

ALTER TABLE public.gastos_egresos ENABLE ROW LEVEL SECURITY;

CREATE POLICY gastos_egresos_por_comercio ON public.gastos_egresos
FOR ALL TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE TRIGGER set_gastos_egresos_comercio_id
BEFORE INSERT ON public.gastos_egresos
FOR EACH ROW EXECUTE FUNCTION public.set_comercio_id_from_context();

CREATE TRIGGER update_gastos_egresos_updated_at
BEFORE UPDATE ON public.gastos_egresos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.registrar_egreso_gasto_en_caja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caja_abierta boolean;
BEGIN
  IF NEW.estado = 'pagado' AND NEW.medio_pago = 'efectivo' THEN
    SELECT estado = 'abierta' INTO caja_abierta FROM public.cajas_diarias WHERE id = NEW.caja_id;
    IF NOT COALESCE(caja_abierta, false) THEN
      RAISE EXCEPTION 'El gasto en efectivo requiere una caja abierta';
    END IF;
    INSERT INTO public.caja_movimientos (caja_id, tipo, concepto, descripcion, monto)
    VALUES (NEW.caja_id, 'egreso', NEW.concepto, COALESCE(NEW.descripcion, 'Gasto: ' || NEW.categoria), NEW.monto);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER registrar_egreso_gasto_en_caja
AFTER INSERT ON public.gastos_egresos
FOR EACH ROW EXECUTE FUNCTION public.registrar_egreso_gasto_en_caja();
