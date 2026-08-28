-- Nucleo multi-comercio para Checkout Pro y QR (Orders API).
CREATE TABLE public.mercadopago_configuraciones (
  comercio_id uuid PRIMARY KEY REFERENCES public.comercio(id) ON DELETE CASCADE,
  ambiente text NOT NULL DEFAULT 'test' CHECK (ambiente IN ('test','production')),
  checkout_habilitado boolean NOT NULL DEFAULT false,
  qr_habilitado boolean NOT NULL DEFAULT false,
  modo_qr text NOT NULL DEFAULT 'dynamic' CHECK (modo_qr IN ('dynamic','static','hybrid')),
  confirmar_pedido_automaticamente boolean NOT NULL DEFAULT true,
  convertir_pedido_en_venta boolean NOT NULL DEFAULT false,
  registrar_en_caja boolean NOT NULL DEFAULT true,
  reservar_stock boolean NOT NULL DEFAULT true,
  minutos_reserva integer NOT NULL DEFAULT 15 CHECK (minutos_reserva BETWEEN 1 AND 10080),
  connected boolean NOT NULL DEFAULT false,
  mp_user_id text,
  cuenta_email text,
  token_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Solo service_role accede a secretos. La UI consulta la tabla segura anterior.
CREATE TABLE public.mercadopago_credenciales (
  comercio_id uuid PRIMARY KEY REFERENCES public.comercio(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  public_key text,
  mp_user_id text NOT NULL,
  expires_at timestamptz,
  scopes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mercadopago_oauth_estados (
  state_hash text PRIMARY KEY,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_to text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mercadopago_sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  mp_store_id text,
  external_store_id text NOT NULL,
  nombre text NOT NULL,
  direccion jsonb NOT NULL DEFAULT '{}'::jsonb,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, external_store_id)
);

CREATE TABLE public.mercadopago_cajas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.mercadopago_sucursales(id) ON DELETE SET NULL,
  mp_pos_id text,
  external_pos_id text NOT NULL,
  nombre text NOT NULL,
  qr_data text,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, external_pos_id)
);

CREATE TABLE public.mercadopago_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  pedido_online_id uuid REFERENCES public.pedidos_online(id) ON DELETE SET NULL,
  pago_venta_id uuid REFERENCES public.pagos_venta(id) ON DELETE SET NULL,
  caja_mp_id uuid REFERENCES public.mercadopago_cajas(id) ON DELETE SET NULL,
  origen text NOT NULL CHECK (origen IN ('venta','tienda_online')),
  modalidad text NOT NULL CHECK (modalidad IN ('qr','checkout_pro')),
  ambiente text NOT NULL CHECK (ambiente IN ('test','production')),
  preference_id text,
  order_id text,
  payment_id text,
  external_reference text NOT NULL,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  importe numeric(14,2) NOT NULL CHECK (importe > 0),
  moneda text NOT NULL DEFAULT 'ARS',
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','aprobado','rechazado','cancelado','vencido','reembolsado','parcialmente_reembolsado','error')),
  estado_detalle text,
  medio_pago text,
  cuotas integer,
  importe_reembolsado numeric(14,2) NOT NULL DEFAULT 0,
  checkout_url text,
  qr_data text,
  expires_at timestamptz,
  approved_at timestamptz,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((venta_id IS NOT NULL)::integer + (pedido_online_id IS NOT NULL)::integer = 1),
  UNIQUE (comercio_id, idempotency_key)
);

CREATE TABLE public.mercadopago_webhook_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_externo_id text,
  comercio_id uuid REFERENCES public.comercio(id) ON DELETE SET NULL,
  topic text,
  recurso_id text,
  firma_valida boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  procesado_at timestamptz,
  intentos integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pagos_venta ADD COLUMN IF NOT EXISTS mercadopago_operacion_id uuid REFERENCES public.mercadopago_operaciones(id) ON DELETE SET NULL;
ALTER TABLE public.pedidos_online ADD COLUMN IF NOT EXISTS estado_pago text NOT NULL DEFAULT 'no_iniciado' CHECK (estado_pago IN ('no_iniciado','pendiente','aprobado','rechazado','cancelado','vencido','reembolsado','parcialmente_reembolsado'));
ALTER TABLE public.pedidos_online ADD COLUMN IF NOT EXISTS importe_pagado numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pedidos_online ADD COLUMN IF NOT EXISTS venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL;

CREATE INDEX idx_mp_operaciones_comercio_fecha ON public.mercadopago_operaciones(comercio_id,created_at DESC);
CREATE INDEX idx_mp_operaciones_venta ON public.mercadopago_operaciones(venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX idx_mp_operaciones_pedido ON public.mercadopago_operaciones(pedido_online_id) WHERE pedido_online_id IS NOT NULL;
CREATE INDEX idx_mp_operaciones_order ON public.mercadopago_operaciones(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_mp_operaciones_preference ON public.mercadopago_operaciones(preference_id) WHERE preference_id IS NOT NULL;
CREATE UNIQUE INDEX idx_mp_operaciones_payment_unico ON public.mercadopago_operaciones(comercio_id,payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_mp_webhook_recurso ON public.mercadopago_webhook_eventos(recurso_id,created_at DESC);
CREATE UNIQUE INDEX idx_mp_webhook_evento_unico ON public.mercadopago_webhook_eventos(evento_externo_id) WHERE evento_externo_id IS NOT NULL;

ALTER TABLE public.mercadopago_configuraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_oauth_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_webhook_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_config_select ON public.mercadopago_configuraciones FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY mp_config_insert ON public.mercadopago_configuraciones FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY mp_config_update ON public.mercadopago_configuraciones FOR UPDATE TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY mp_sucursales_select ON public.mercadopago_sucursales FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY mp_cajas_select ON public.mercadopago_cajas FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY mp_operaciones_select ON public.mercadopago_operaciones FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id) OR EXISTS (SELECT 1 FROM public.pedidos_online p WHERE p.id=pedido_online_id AND p.cliente_user_id=auth.uid()));

REVOKE ALL ON public.mercadopago_credenciales, public.mercadopago_oauth_estados, public.mercadopago_webhook_eventos FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.mercadopago_configuraciones TO authenticated;
GRANT SELECT ON public.mercadopago_sucursales,public.mercadopago_cajas,public.mercadopago_operaciones TO authenticated;

CREATE TRIGGER update_mp_config_updated_at BEFORE UPDATE ON public.mercadopago_configuraciones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mp_cred_updated_at BEFORE UPDATE ON public.mercadopago_credenciales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mp_sucursal_updated_at BEFORE UPDATE ON public.mercadopago_sucursales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mp_caja_updated_at BEFORE UPDATE ON public.mercadopago_cajas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mp_operacion_updated_at BEFORE UPDATE ON public.mercadopago_operaciones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_tienda_pago_config(target_comercio_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT jsonb_build_object(
    'checkout_habilitado',checkout_habilitado AND connected,
    'ambiente',ambiente
  ) FROM public.mercadopago_configuraciones WHERE comercio_id=target_comercio_id),'{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.get_tienda_pago_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tienda_pago_config(uuid) TO anon,authenticated;

-- Vista segura para que los clientes consulten el pago de sus propios pedidos.
CREATE OR REPLACE FUNCTION public.get_estado_pago_pedido(p_pedido_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT jsonb_build_object('pedido_id',p.id,'estado_pago',p.estado_pago,'importe_pagado',p.importe_pagado,'total',p.total)
    FROM public.pedidos_online p WHERE p.id=p_pedido_id AND p.cliente_user_id=auth.uid()),'{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.get_estado_pago_pedido(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_estado_pago_pedido(uuid) TO authenticated;

-- Aprobacion idempotente invocada exclusivamente por service_role desde el webhook.
CREATE OR REPLACE FUNCTION public.registrar_pago_mercadopago_aprobado(p_operacion_id uuid,p_payment_id text,p_medio_pago text,p_cuotas integer,p_raw jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op public.mercadopago_operaciones; v_pago_id uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  SELECT * INTO v_op FROM public.mercadopago_operaciones WHERE id=p_operacion_id FOR UPDATE;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'Operacion inexistente'; END IF;
  IF v_op.estado='aprobado' THEN RETURN; END IF;
  UPDATE public.mercadopago_operaciones SET estado='aprobado',payment_id=p_payment_id,medio_pago=p_medio_pago,cuotas=p_cuotas,approved_at=now(),raw_response=p_raw WHERE id=v_op.id;
  IF v_op.pedido_online_id IS NOT NULL THEN
    UPDATE public.pedidos_online SET estado_pago='aprobado',importe_pagado=v_op.importe WHERE id=v_op.pedido_online_id;
  ELSE
    INSERT INTO public.pagos_venta(comercio_id,venta_id,tipo_pago,monto,mercadopago_operacion_id)
    SELECT v_op.comercio_id,v_op.venta_id,'mercado_pago'::public.tipo_pago,v_op.importe,v_op.id
    WHERE NOT EXISTS (SELECT 1 FROM public.pagos_venta WHERE mercadopago_operacion_id=v_op.id)
    RETURNING id INTO v_pago_id;
    UPDATE public.mercadopago_operaciones SET pago_venta_id=COALESCE(v_pago_id,pago_venta_id) WHERE id=v_op.id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.registrar_pago_mercadopago_aprobado(uuid,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_mercadopago_aprobado(uuid,text,text,integer,jsonb) TO service_role;

UPDATE public.comercio_parametrizacion
SET parametros=jsonb_set(parametros,'{modulos,mercado_pago}','true'::jsonb,true);

CREATE OR REPLACE FUNCTION public.get_mi_historial_compras()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesion'; END IF;
  RETURN coalesce((SELECT jsonb_agg(compra ORDER BY (compra->>'created_at')::timestamptz DESC) FROM (
    SELECT jsonb_build_object('id',po.id,'numero',po.numero::text,'origen','online','estado',po.estado,'estado_pago',po.estado_pago,'importe_pagado',po.importe_pagado,'total',po.total,'created_at',po.created_at,'observaciones',po.observaciones,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'descripcion',i.descripcion,'cantidad',i.cantidad,'precio_unitario',i.precio_unitario,'subtotal',i.subtotal) ORDER BY i.id) FROM public.pedido_online_items i WHERE i.pedido_id=po.id),'[]'::jsonb)) compra FROM public.pedidos_online po WHERE po.cliente_id IN (SELECT cliente_id FROM public.cliente_usuarios WHERE user_id=v_user)
    UNION ALL
    SELECT jsonb_build_object('id',v.id,'numero',v.numero_comprobante,'origen','local','estado','completada','estado_pago','aprobado','importe_pagado',v.total,'total',v.total,'created_at',v.fecha_venta,'observaciones',v.observaciones,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',vi.id,'descripcion',coalesce(p.descripcion,nullif(vi.descripcion_manual,''),'Producto'),'cantidad',vi.cantidad,'precio_unitario',vi.precio_unitario,'subtotal',coalesce(vi.total,vi.subtotal)) ORDER BY vi.id) FROM public.venta_items vi LEFT JOIN public.productos p ON p.id=vi.producto_id WHERE vi.venta_id=v.id),'[]'::jsonb)) compra FROM public.ventas v WHERE v.cliente_id IN (SELECT cliente_id FROM public.cliente_usuarios WHERE user_id=v_user)
  ) h),'[]'::jsonb);
END $$;
