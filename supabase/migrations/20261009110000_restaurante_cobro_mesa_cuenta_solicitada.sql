-- Refuerza el circuito de mesas sin modificar pagos ni pedidos existentes.
BEGIN;
DO $migration$
DECLARE definition text; anterior text; siguiente text;
BEGIN
  definition := pg_get_functiondef('public.restaurante_operar(uuid,text,jsonb,uuid)'::regprocedure);
  anterior := $old$ELSIF p_accion='cobro' THEN$old$;
  siguiente := $new$ELSIF p_accion='cobro' THEN
 IF p.modalidad='mesa' AND p.cuenta IS DISTINCT FROM 'solicitada' THEN
   RAISE EXCEPTION 'Solicitá la cuenta de la mesa antes de registrar el cobro';
 END IF;$new$;
  IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró el registro de cobro esperado'; END IF;
  definition := replace(definition, anterior, siguiente);
  anterior := $old$ELSIF p_accion='cerrar' THEN$old$;
  siguiente := $new$ELSIF p_accion='cerrar' THEN
 IF p.modalidad='mesa' AND p.cuenta IS DISTINCT FROM 'solicitada' THEN
   RAISE EXCEPTION 'Solicitá la cuenta de la mesa antes de cerrar y generar el comprobante';
 END IF;$new$;
  IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró el cierre de cuenta esperado'; END IF;
  EXECUTE replace(definition, anterior, siguiente);
END;
$migration$;
COMMIT;
