-- Bandeja comercial de la plataforma, previa al alta de un comercio.
-- comercio_id queda NULL: el visitante no elige tenant ni obtiene acceso a él.
CREATE TABLE public.consultas_landing (
  id uuid PRIMARY KEY,
  comercio_id uuid REFERENCES public.comercio(id),
  nombre text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 150),
  negocio text NOT NULL CHECK (char_length(negocio) BETWEEN 1 AND 200),
  email text NOT NULL CHECK (char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  telefono text NOT NULL DEFAULT '' CHECK (char_length(telefono) <= 50),
  mensaje text NOT NULL CHECK (char_length(mensaje) BETWEEN 1 AND 5000),
  estado text NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva','contactada','archivada')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consultas_landing_fecha ON public.consultas_landing(creado_en DESC, id);
CREATE INDEX consultas_landing_estado ON public.consultas_landing(estado, creado_en DESC);
CREATE INDEX consultas_landing_email ON public.consultas_landing(email, creado_en DESC);
CREATE INDEX consultas_landing_comercio ON public.consultas_landing(comercio_id);
ALTER TABLE public.consultas_landing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consultas_landing FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consultas_landing TO authenticated;
CREATE POLICY consultas_landing_admin_lectura ON public.consultas_landing
  FOR SELECT TO authenticated USING ((SELECT public.is_app_admin()));

CREATE FUNCTION public.enviar_consulta_landing(p_id uuid, p_nombre text, p_negocio text, p_email text, p_telefono text, p_mensaje text, p_honey text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nombre text := btrim(p_nombre);
  v_negocio text := btrim(p_negocio);
  v_email text := lower(btrim(p_email));
  v_mensaje text := btrim(p_mensaje);
BEGIN
  IF p_id IS NULL OR coalesce(p_honey,'') <> '' OR
    coalesce(char_length(v_nombre),0) NOT BETWEEN 1 AND 150 OR
    coalesce(char_length(v_negocio),0) NOT BETWEEN 1 AND 200 OR
    coalesce(char_length(v_mensaje),0) NOT BETWEEN 1 AND 5000 OR
    coalesce(char_length(v_email),0) NOT BETWEEN 3 AND 254 OR
    v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
    char_length(coalesce(p_telefono,'')) > 50 THEN
    RAISE EXCEPTION 'Revisá los datos de la consulta.' USING ERRCODE='22023';
  END IF;
  -- Serializa los límites para impedir que envíos simultáneos los salteen.
  PERFORM pg_catalog.pg_advisory_xact_lock(29102026, 120000);
  -- Reintentos no duplican una consulta y nunca devuelven datos del registro.
  IF EXISTS (SELECT 1 FROM public.consultas_landing WHERE id=p_id) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.consultas_landing WHERE email=v_email AND creado_en>now()-interval '30 minutes') >= 3
    OR (SELECT count(*) FROM public.consultas_landing WHERE creado_en>now()-interval '1 hour') >= 100 THEN
    RAISE EXCEPTION 'Se alcanzó el límite de envíos. Intentá más tarde.' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.consultas_landing(id,nombre,negocio,email,telefono,mensaje)
    VALUES(p_id,v_nombre,v_negocio,v_email,btrim(coalesce(p_telefono,'')),v_mensaje);
END;
$$;
REVOKE ALL ON FUNCTION public.enviar_consulta_landing(uuid,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_consulta_landing(uuid,text,text,text,text,text,text) TO anon, authenticated;

CREATE FUNCTION public.admin_estado_consulta_landing(p_id uuid, p_estado text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('nueva','contactada','archivada') THEN
    RAISE EXCEPTION 'Estado inválido' USING ERRCODE='22023';
  END IF;
  UPDATE public.consultas_landing SET estado=p_estado, actualizado_en=now() WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consulta no encontrada'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_estado_consulta_landing(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_estado_consulta_landing(uuid,text) TO authenticated;
