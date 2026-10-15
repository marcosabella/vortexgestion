-- Monitoreo de incidentes. Solo estructura y permisos; no repara datos existentes.
BEGIN;
CREATE TABLE public.sistema_incidentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modulo text NOT NULL CHECK (char_length(modulo) BETWEEN 1 AND 60),
  ruta text NOT NULL CHECK (char_length(ruta) BETWEEN 1 AND 200),
  origen text NOT NULL CHECK (origen IN ('consulta', 'guardado', 'aviso', 'navegador')),
  codigo text CHECK (char_length(codigo) <= 40),
  mensaje text NOT NULL CHECK (char_length(mensaje) BETWEEN 1 AND 1600),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_revision', 'resuelto')),
  notas text NOT NULL DEFAULT '' CHECK (char_length(notas) <= 2000),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX sistema_incidentes_comercio_fecha_idx ON public.sistema_incidentes(comercio_id, creado_en DESC, id);
CREATE INDEX sistema_incidentes_fecha_idx ON public.sistema_incidentes(creado_en DESC, id);
CREATE INDEX sistema_incidentes_estado_fecha_idx ON public.sistema_incidentes(estado, creado_en DESC);
CREATE INDEX sistema_incidentes_modulo_fecha_idx ON public.sistema_incidentes(modulo, creado_en DESC);
CREATE INDEX sistema_incidentes_user_fecha_idx ON public.sistema_incidentes(user_id, creado_en DESC);

ALTER TABLE public.sistema_incidentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sistema_incidentes_lectura_admin ON public.sistema_incidentes
  FOR SELECT TO authenticated USING (public.is_app_admin());
REVOKE ALL ON public.sistema_incidentes FROM anon, authenticated;
GRANT SELECT ON public.sistema_incidentes TO authenticated;

CREATE FUNCTION public.registrar_incidente(
  p_comercio_id uuid, p_modulo text, p_ruta text, p_origen text, p_codigo text, p_mensaje text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT (
    public.user_belongs_to_comercio(p_comercio_id) OR public.is_app_admin()
  ) OR NOT EXISTS (SELECT 1 FROM public.comercio WHERE id = p_comercio_id) THEN
    RAISE EXCEPTION 'No autorizado para registrar incidentes de este comercio' USING ERRCODE = '42501';
  END IF;
  IF p_modulo IS NULL OR p_modulo !~ '^[a-z][a-z-]{0,59}$'
    OR p_ruta IS NULL OR p_ruta !~ '^/[a-z0-9/:-]*$' OR char_length(p_ruta) > 200
    OR p_origen IS NULL OR p_origen NOT IN ('consulta', 'guardado', 'aviso', 'navegador')
    OR p_mensaje IS NULL OR char_length(trim(p_mensaje)) NOT BETWEEN 1 AND 1600
    OR (p_codigo IS NOT NULL AND p_codigo !~ '^[A-Za-z0-9_-]{0,40}$') THEN
    RAISE EXCEPTION 'Registro de incidente inválido' USING ERRCODE = '22023';
  END IF;
  -- Serializa por usuario para que el límite no pueda eludirse con llamadas concurrentes.
  PERFORM pg_advisory_xact_lock(hashtextextended('incidentes:' || v_user::text, 0));
  IF (SELECT count(*) FROM public.sistema_incidentes
      WHERE user_id = v_user AND creado_en >= now() - interval '1 minute') >= 60 THEN
    RETURN;
  END IF;
  INSERT INTO public.sistema_incidentes(comercio_id, user_id, modulo, ruta, origen, codigo, mensaje)
  VALUES(p_comercio_id, v_user, p_modulo, p_ruta, p_origen, nullif(p_codigo, ''), trim(p_mensaje));
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_incidente(uuid,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_incidente(uuid,text,text,text,text,text) TO authenticated;

CREATE FUNCTION public.admin_actualizar_incidente(p_id uuid, p_estado text, p_notas text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Solo el administrador de plataforma puede gestionar incidentes' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('pendiente', 'en_revision', 'resuelto')
    OR p_notas IS NULL OR char_length(p_notas) > 2000 THEN
    RAISE EXCEPTION 'Estado o notas inválidos' USING ERRCODE = '22023';
  END IF;
  UPDATE public.sistema_incidentes
  SET estado = p_estado, notas = p_notas, actualizado_en = now(), actualizado_por = auth.uid()
  WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incidente no encontrado' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_actualizar_incidente(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_actualizar_incidente(uuid,text,text) TO authenticated;
COMMIT;
