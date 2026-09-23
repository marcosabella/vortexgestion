-- Integra los gastos y egresos con proveedores, categorias configurables y su cuenta corriente.

CREATE TABLE public.gastos_egresos_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos_egresos
ADD COLUMN tipo_comprobante text CHECK (tipo_comprobante IN (
  'factura_a', 'factura_b', 'factura_c',
  'nota_credito_a', 'nota_credito_b', 'nota_credito_c',
  'nota_debito_a', 'nota_debito_b', 'nota_debito_c',
  'recibo_a', 'recibo_b', 'recibo_c', 'recibo_x',
  'ticket_fiscal', 'factura_exportacion'
));

CREATE UNIQUE INDEX gastos_egresos_categorias_nombre_unico
ON public.gastos_egresos_categorias (comercio_id, lower(nombre));

ALTER TABLE public.gastos_egresos_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY gastos_egresos_categorias_por_comercio
ON public.gastos_egresos_categorias
FOR ALL TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

-- Conserva como opciones las categorias que ya fueron utilizadas.
INSERT INTO public.gastos_egresos_categorias (comercio_id, nombre)
SELECT DISTINCT comercio_id, trim(categoria)
FROM public.gastos_egresos
WHERE comercio_id IS NOT NULL AND nullif(trim(categoria), '') IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TRIGGER set_gastos_egresos_categorias_comercio_id
BEFORE INSERT ON public.gastos_egresos_categorias
FOR EACH ROW EXECUTE FUNCTION public.set_comercio_id_from_context();

ALTER TABLE public.cuenta_corriente_proveedores
ADD COLUMN gasto_egreso_id uuid REFERENCES public.gastos_egresos(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX cuenta_corriente_proveedores_gasto_unico
ON public.cuenta_corriente_proveedores (gasto_egreso_id)
WHERE gasto_egreso_id IS NOT NULL;

ALTER TABLE public.gastos_egresos
ADD CONSTRAINT gasto_cuenta_corriente_requiere_proveedor
CHECK (medio_pago <> 'cuenta_corriente' OR proveedor_id IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION public.sincronizar_gasto_cuenta_corriente_proveedor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_detalle text;
BEGIN
  IF NEW.proveedor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id
      AND p.comercio_id = NEW.comercio_id
  ) THEN
    RAISE EXCEPTION 'gasto_proveedor_no_disponible';
  END IF;

  IF NEW.medio_pago = 'cuenta_corriente' THEN
    IF NEW.proveedor_id IS NULL THEN
      RAISE EXCEPTION 'gasto_cuenta_corriente_requiere_proveedor';
    END IF;

    v_detalle := 'Gasto/egreso: ' || NEW.concepto ||
      CASE
        WHEN nullif(trim(NEW.numero_comprobante), '') IS NOT NULL
          THEN ' · Comprobante ' || trim(NEW.numero_comprobante)
        ELSE ''
      END;

    INSERT INTO public.cuenta_corriente_proveedores (
      comercio_id, proveedor_id, gasto_egreso_id, tipo, monto, fecha, medio_pago, observaciones
    ) VALUES (
      NEW.comercio_id, NEW.proveedor_id, NEW.id, 'deuda', NEW.monto, NEW.fecha,
      'cuenta_corriente', v_detalle
    )
    ON CONFLICT (gasto_egreso_id) WHERE gasto_egreso_id IS NOT NULL
    DO UPDATE SET
      comercio_id = EXCLUDED.comercio_id,
      proveedor_id = EXCLUDED.proveedor_id,
      tipo = EXCLUDED.tipo,
      monto = EXCLUDED.monto,
      fecha = EXCLUDED.fecha,
      medio_pago = EXCLUDED.medio_pago,
      observaciones = EXCLUDED.observaciones;
  ELSE
    DELETE FROM public.cuenta_corriente_proveedores
    WHERE gasto_egreso_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sincronizar_gasto_cuenta_corriente_proveedor
AFTER INSERT OR UPDATE OF proveedor_id, medio_pago, monto, fecha, concepto, numero_comprobante
ON public.gastos_egresos
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_gasto_cuenta_corriente_proveedor();

-- Regulariza gastos existentes que ya estaban cargados a cuenta corriente y tenian proveedor.
INSERT INTO public.cuenta_corriente_proveedores (
  comercio_id, proveedor_id, gasto_egreso_id, tipo, monto, fecha, medio_pago, observaciones
)
SELECT
  g.comercio_id,
  g.proveedor_id,
  g.id,
  'deuda',
  g.monto,
  g.fecha,
  'cuenta_corriente',
  'Gasto/egreso: ' || g.concepto ||
    CASE
      WHEN nullif(trim(g.numero_comprobante), '') IS NOT NULL
        THEN ' · Comprobante ' || trim(g.numero_comprobante)
      ELSE ''
    END
FROM public.gastos_egresos g
JOIN public.proveedores p
  ON p.id = g.proveedor_id AND p.comercio_id = g.comercio_id
WHERE g.medio_pago = 'cuenta_corriente'
ON CONFLICT (gasto_egreso_id) WHERE gasto_egreso_id IS NOT NULL DO NOTHING;

REVOKE ALL ON TABLE public.gastos_egresos_categorias FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.gastos_egresos_categorias TO authenticated;
