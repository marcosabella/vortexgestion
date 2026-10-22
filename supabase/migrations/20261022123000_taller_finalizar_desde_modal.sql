-- Guarda el trabajo y cambia el estado en una sola transaccion.
BEGIN;

CREATE FUNCTION public.taller_finalizar_orden(p_orden_id uuid,p_version integer,p_trabajo_realizado text,p_detalle text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF length(btrim(coalesce(p_trabajo_realizado,'')))=0 THEN RAISE EXCEPTION 'taller_trabajo_realizado_requerido'; END IF;
  UPDATE public.taller_ordenes SET trabajo_realizado=btrim(p_trabajo_realizado) WHERE id=o.id;
  -- Reutiliza las transiciones y el historial existentes. Si falla, tampoco se
  -- guarda la descripcion. La version se incrementa una sola vez.
  PERFORM public.taller_cambiar_estado(o.id,p_version,'listo',coalesce(p_detalle,''));
END $$;

REVOKE ALL ON FUNCTION public.taller_finalizar_orden(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.taller_finalizar_orden(uuid,integer,text,text) TO authenticated;

COMMIT;
