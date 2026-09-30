-- Cobros de membresia enviados por el administrador mediante notificaciones.
-- Se mantienen separados de las ventas y pedidos de cada tenant porque el
-- receptor del dinero es la cuenta Mercado Pago de la plataforma.

CREATE TABLE public.membresia_pagos_mercadopago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL REFERENCES public.notificaciones(id) ON DELETE RESTRICT,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  receptor_comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  importe numeric(14,2) NOT NULL CHECK (importe > 0),
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda = 'ARS'),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (
    estado IN ('pendiente','procesando','aprobado','rechazado','cancelado','vencido','reembolsado','error')
  ),
  estado_detalle text,
  preference_id text,
  payment_id text,
  external_reference text NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  checkout_url text,
  medio_pago text,
  cuotas integer,
  approved_at timestamptz,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notificacion_id, comercio_id)
);

CREATE INDEX membresia_pagos_comercio_fecha_idx
  ON public.membresia_pagos_mercadopago(comercio_id, created_at DESC);
CREATE INDEX membresia_pagos_notificacion_idx
  ON public.membresia_pagos_mercadopago(notificacion_id);
CREATE UNIQUE INDEX membresia_pagos_payment_unico_idx
  ON public.membresia_pagos_mercadopago(receptor_comercio_id, payment_id)
  WHERE payment_id IS NOT NULL;

ALTER TABLE public.membresia_pagos_mercadopago ENABLE ROW LEVEL SECURITY;

CREATE POLICY membresia_pagos_lectura
ON public.membresia_pagos_mercadopago
FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id) OR public.is_app_admin());

-- Las altas y cambios se realizan exclusivamente desde las Edge Functions con
-- service_role. El navegador nunca puede confirmar un pago.
REVOKE ALL ON public.membresia_pagos_mercadopago FROM anon, authenticated;
GRANT SELECT ON public.membresia_pagos_mercadopago TO authenticated;

CREATE TRIGGER update_membresia_pagos_mercadopago_updated_at
BEFORE UPDATE ON public.membresia_pagos_mercadopago
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permite que un app_admin vea solamente la configuracion no secreta de las
-- cuentas conectadas para elegir donde cobrar. Los tokens siguen revocados.
DROP POLICY IF EXISTS mp_config_select ON public.mercadopago_configuraciones;
CREATE POLICY mp_config_select
ON public.mercadopago_configuraciones
FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id) OR public.is_app_admin());

CREATE OR REPLACE FUNCTION public.registrar_pago_membresia_mercadopago(
  p_pago_id uuid,
  p_payment_id text,
  p_medio_pago text,
  p_cuotas integer,
  p_raw jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago public.membresia_pagos_mercadopago;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend';
  END IF;

  SELECT * INTO v_pago
  FROM public.membresia_pagos_mercadopago
  WHERE id = p_pago_id
  FOR UPDATE;

  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Pago inexistente'; END IF;
  IF v_pago.estado = 'aprobado' THEN RETURN; END IF;

  UPDATE public.membresia_pagos_mercadopago
  SET estado = 'aprobado', payment_id = p_payment_id,
      medio_pago = p_medio_pago, cuotas = p_cuotas,
      approved_at = now(), estado_detalle = NULL, raw_response = p_raw
  WHERE id = v_pago.id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_membresia_mercadopago(uuid,text,text,integer,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_membresia_mercadopago(uuid,text,text,integer,jsonb)
  TO service_role;

