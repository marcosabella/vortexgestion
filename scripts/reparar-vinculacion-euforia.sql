-- Reparacion de datos SEPARADA de la migracion estructural.
-- REQUIERE autorizacion expresa para produccion y revisar antes el diagnostico.
-- psql ... -v pedido_id=UUID_DEL_PEDIDO_REVISADO -f scripts/reparar-vinculacion-euforia.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE vinculacion_euforia_objetivo ON COMMIT DROP AS SELECT :'pedido_id'::uuid AS pedido_id;
DO $$
DECLARE
  v_pedido public.pedidos_online;
  v_cliente public.clientes;
  v_email text; v_confirmado timestamptz; v_cantidad integer;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_online
  WHERE id=(SELECT pedido_id FROM pg_temp.vinculacion_euforia_objetivo) FOR UPDATE;
  IF NOT FOUND OR v_pedido.comercio_id IS DISTINCT FROM '0987ef9c-c602-40cf-84c3-64d2f644428d'::uuid
    OR v_pedido.cliente_id IS NULL OR v_pedido.cliente_user_id IS NULL THEN
    RAISE EXCEPTION 'El pedido debe pertenecer a Euforia y tener ficha y cuenta identificadas';
  END IF;
  SELECT lower(btrim(email)),email_confirmed_at INTO v_email,v_confirmado
  FROM auth.users WHERE id=v_pedido.cliente_user_id FOR UPDATE;
  IF NOT FOUND OR v_confirmado IS NULL OR nullif(v_email,'') IS NULL THEN
    RAISE EXCEPTION 'Debe verificarse la identidad: cuenta sin correo confirmado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_pedido.comercio_id::text||':'||v_email,0));
  SELECT * INTO v_cliente FROM public.clientes WHERE id=v_pedido.cliente_id FOR UPDATE;
  IF NOT FOUND OR v_cliente.comercio_id IS DISTINCT FROM v_pedido.comercio_id
    OR lower(btrim(v_cliente.email)) IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'La ficha y la cuenta no coinciden en comercio y correo';
  END IF;
  SELECT count(*) INTO v_cantidad FROM public.clientes
  WHERE comercio_id=v_pedido.comercio_id AND lower(btrim(email))=v_email;
  IF v_cantidad<>1 THEN RAISE EXCEPTION 'Correo duplicado: requiere revision manual'; END IF;
  IF EXISTS (SELECT 1 FROM public.cliente_usuarios WHERE comercio_id=v_pedido.comercio_id
    AND ((user_id=v_pedido.cliente_user_id AND cliente_id<>v_cliente.id)
      OR (cliente_id=v_cliente.id AND user_id<>v_pedido.cliente_user_id))) THEN
    RAISE EXCEPTION 'Existe otra vinculacion: no se reemplaza automaticamente';
  END IF;
  INSERT INTO public.cliente_usuarios(comercio_id,cliente_id,user_id,metodo)
  VALUES(v_pedido.comercio_id,v_cliente.id,v_pedido.cliente_user_id,'email_verificado')
  ON CONFLICT(comercio_id,user_id) DO NOTHING;
  DELETE FROM public.cliente_vinculaciones_pendientes
  WHERE comercio_id=v_pedido.comercio_id AND user_id=v_pedido.cliente_user_id;
END $$;
SELECT cu.comercio_id,cu.cliente_id,cu.user_id,cu.metodo
FROM public.cliente_usuarios cu JOIN public.pedidos_online p
  ON p.comercio_id=cu.comercio_id AND p.cliente_id=cu.cliente_id AND p.cliente_user_id=cu.user_id
WHERE p.id=(SELECT pedido_id FROM pg_temp.vinculacion_euforia_objetivo);
COMMIT;
