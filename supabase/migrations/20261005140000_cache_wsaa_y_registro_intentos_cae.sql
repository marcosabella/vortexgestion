-- Infraestructura fiscal privada: no modifica comprobantes existentes.
BEGIN;
CREATE TABLE public.afip_wsaa_tickets (
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  clave text NOT NULL,
  token text,
  sign text,
  expiration_time timestamptz,
  reserva uuid,
  reserva_hasta timestamptz,
  PRIMARY KEY (comercio_id, clave)
);
ALTER TABLE public.afip_wsaa_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.afip_wsaa_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.afip_wsaa_tickets TO service_role;

CREATE TABLE public.afip_cae_intentos (
  venta_id uuid PRIMARY KEY REFERENCES public.ventas(id) ON DELETE RESTRICT,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  ambiente text NOT NULL CHECK (ambiente IN ('homologacion','produccion')),
  cuit_emisor text NOT NULL,
  punto_venta integer NOT NULL CHECK (punto_venta > 0),
  tipo_comprobante integer NOT NULL,
  numero_secuencial bigint NOT NULL CHECK (numero_secuencial > 0),
  solicitud jsonb NOT NULL,
  cae text,
  cae_vencimiento date,
  rechazado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comercio_id, ambiente, cuit_emisor, punto_venta, tipo_comprobante, numero_secuencial)
);
CREATE INDEX afip_cae_intentos_comercio ON public.afip_cae_intentos(comercio_id);
ALTER TABLE public.afip_cae_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.afip_cae_intentos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.afip_cae_intentos TO service_role;

CREATE FUNCTION public.validar_comercio_intento_cae()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ventas WHERE id = NEW.venta_id AND comercio_id = NEW.comercio_id) THEN
    RAISE EXCEPTION 'afip_intento_venta_comercio_invalido';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validar_comercio_intento_cae BEFORE INSERT OR UPDATE ON public.afip_cae_intentos
FOR EACH ROW EXECUTE FUNCTION public.validar_comercio_intento_cae();
REVOKE ALL ON FUNCTION public.validar_comercio_intento_cae() FROM PUBLIC, anon, authenticated;

-- La reserva se mantiene durante la llamada HTTP, no solo durante la RPC.
CREATE FUNCTION public.afip_wsaa_reservar_ticket(p_comercio_id uuid, p_clave text, p_reserva uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_ticket public.afip_wsaa_tickets;
BEGIN
  IF p_reserva IS NULL OR NULLIF(p_clave, '') IS NULL THEN RAISE EXCEPTION 'afip_wsaa_reserva_invalida'; END IF;
  INSERT INTO public.afip_wsaa_tickets(comercio_id,clave) VALUES (p_comercio_id,p_clave) ON CONFLICT DO NOTHING;
  SELECT * INTO v_ticket FROM public.afip_wsaa_tickets WHERE comercio_id=p_comercio_id AND clave=p_clave FOR UPDATE;
  IF v_ticket.expiration_time > now() AND NULLIF(v_ticket.token,'') IS NOT NULL AND NULLIF(v_ticket.sign,'') IS NOT NULL THEN
    RETURN jsonb_build_object('estado','vigente','token',v_ticket.token,'sign',v_ticket.sign,'expirationTime',v_ticket.expiration_time);
  END IF;
  IF v_ticket.reserva_hasta > now() THEN RETURN jsonb_build_object('estado','ocupado'); END IF;
  UPDATE public.afip_wsaa_tickets SET reserva=p_reserva,reserva_hasta=now()+interval '60 seconds'
  WHERE comercio_id=p_comercio_id AND clave=p_clave;
  RETURN jsonb_build_object('estado','renovar');
END; $$;

CREATE FUNCTION public.afip_wsaa_guardar_ticket(p_comercio_id uuid,p_clave text,p_reserva uuid,p_ticket jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_ticket IS NOT NULL THEN
    IF NULLIF(p_ticket->>'token','') IS NULL OR NULLIF(p_ticket->>'sign','') IS NULL
       OR (p_ticket->>'expirationTime')::timestamptz IS NULL
       OR (p_ticket->>'expirationTime')::timestamptz <= now()
       OR NOT isfinite((p_ticket->>'expirationTime')::timestamptz) THEN
      RAISE EXCEPTION 'afip_wsaa_ticket_invalido';
    END IF;
    UPDATE public.afip_wsaa_tickets SET token=p_ticket->>'token',sign=p_ticket->>'sign',
      expiration_time=(p_ticket->>'expirationTime')::timestamptz,reserva=NULL,reserva_hasta=NULL
    WHERE comercio_id=p_comercio_id AND clave=p_clave AND reserva=p_reserva;
    IF NOT FOUND THEN RAISE EXCEPTION 'afip_wsaa_reserva_perdida'; END IF;
  ELSE
    UPDATE public.afip_wsaa_tickets SET reserva=NULL,reserva_hasta=NULL
    WHERE comercio_id=p_comercio_id AND clave=p_clave AND reserva=p_reserva;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.afip_wsaa_reservar_ticket(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.afip_wsaa_guardar_ticket(uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.afip_wsaa_reservar_ticket(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.afip_wsaa_guardar_ticket(uuid,text,uuid,jsonb) TO service_role;
COMMIT;
