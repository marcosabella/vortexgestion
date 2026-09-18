-- Vortex Campo: recorridos GPS. La identidad operativa se deriva exclusivamente
-- de auth.uid(); los identificadores enviados por el cliente nunca autorizan.
BEGIN;

CREATE TABLE public.campo_gps_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  orden_id uuid NOT NULL,
  parte_id uuid NOT NULL,
  operador_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'activa',
  iniciada_at timestamptz NOT NULL DEFAULT now(),
  pausada_at timestamptz,
  finalizada_at timestamptz,
  segundos_pausados integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_gps_sesiones_estado_valido CHECK (estado IN ('activa', 'pausada', 'finalizada')),
  CONSTRAINT campo_gps_sesiones_pausa_valida CHECK ((estado = 'pausada') = (pausada_at IS NOT NULL)),
  CONSTRAINT campo_gps_sesiones_finalizacion_valida CHECK ((estado = 'finalizada') = (finalizada_at IS NOT NULL)),
  CONSTRAINT campo_gps_sesiones_pausa_no_negativa CHECK (segundos_pausados >= 0),
  CONSTRAINT campo_gps_sesiones_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_gps_sesiones_orden_fkey FOREIGN KEY (comercio_id, orden_id)
    REFERENCES public.campo_ordenes_trabajo(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_gps_sesiones_parte_fkey FOREIGN KEY (comercio_id, parte_id)
    REFERENCES public.campo_partes_trabajo(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_gps_sesiones_operador_fkey FOREIGN KEY (comercio_id, operador_id)
    REFERENCES public.campo_operarios(comercio_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.campo_gps_puntos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  sesion_id uuid NOT NULL,
  client_id uuid NOT NULL,
  secuencia bigint NOT NULL,
  latitud double precision NOT NULL,
  longitud double precision NOT NULL,
  precision_metros double precision NOT NULL,
  registrado_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_gps_puntos_sesion_fkey FOREIGN KEY (comercio_id, sesion_id)
    REFERENCES public.campo_gps_sesiones(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_gps_puntos_client_id_unico UNIQUE (sesion_id, client_id),
  CONSTRAINT campo_gps_puntos_secuencia_unica UNIQUE (sesion_id, secuencia),
  CONSTRAINT campo_gps_puntos_secuencia_valida CHECK (secuencia > 0),
  CONSTRAINT campo_gps_puntos_latitud_valida CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT campo_gps_puntos_longitud_valida CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT campo_gps_puntos_precision_valida CHECK (precision_metros >= 0 AND precision_metros <= 100000),
  CONSTRAINT campo_gps_puntos_fecha_valida CHECK (registrado_at >= '2020-01-01'::timestamptz AND registrado_at <= now() + interval '5 minutes')
);

CREATE UNIQUE INDEX campo_gps_una_sesion_abierta_por_operador_parte
  ON public.campo_gps_sesiones(comercio_id, parte_id, operador_id)
  WHERE estado IN ('activa', 'pausada');
CREATE INDEX campo_gps_sesiones_consulta ON public.campo_gps_sesiones(comercio_id, parte_id, iniciada_at DESC, id DESC);
CREATE INDEX campo_gps_puntos_recorrido ON public.campo_gps_puntos(comercio_id, sesion_id, secuencia);

CREATE OR REPLACE FUNCTION public.campo_gps_touch_sesion()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.comercio_id IS DISTINCT FROM OLD.comercio_id OR NEW.orden_id IS DISTINCT FROM OLD.orden_id
      OR NEW.parte_id IS DISTINCT FROM OLD.parte_id OR NEW.operador_id IS DISTINCT FROM OLD.operador_id
      OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id OR NEW.iniciada_at IS DISTINCT FROM OLD.iniciada_at THEN
      RAISE EXCEPTION 'campo_gps_sesion_inmutable';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER campo_gps_sesiones_touch BEFORE UPDATE ON public.campo_gps_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.campo_gps_touch_sesion();

CREATE OR REPLACE FUNCTION public.campo_gps_proteger_punto()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
DECLARE v_sesion public.campo_gps_sesiones;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'campo_gps_puntos_inmutables';
  END IF;
  SELECT * INTO v_sesion FROM public.campo_gps_sesiones
  WHERE id = NEW.sesion_id AND comercio_id = NEW.comercio_id;
  IF NOT FOUND OR NEW.comercio_id <> v_sesion.comercio_id THEN
    RAISE EXCEPTION 'campo_gps_tenant_invalido';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER campo_gps_puntos_protect BEFORE INSERT OR UPDATE OR DELETE ON public.campo_gps_puntos
  FOR EACH ROW EXECUTE FUNCTION public.campo_gps_proteger_punto();

CREATE OR REPLACE FUNCTION public.campo_gps_validar_sesion_relaciones()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
DECLARE v_parte public.campo_partes_trabajo; v_operario public.campo_operarios;
BEGIN
  SELECT * INTO v_parte FROM public.campo_partes_trabajo
  WHERE id = NEW.parte_id AND comercio_id = NEW.comercio_id;
  SELECT * INTO v_operario FROM public.campo_operarios
  WHERE id = NEW.operador_id AND comercio_id = NEW.comercio_id;
  IF v_parte.id IS NULL OR v_operario.id IS NULL OR v_parte.orden_id <> NEW.orden_id OR v_operario.user_id <> NEW.usuario_id THEN
    RAISE EXCEPTION 'campo_gps_relacion_invalida';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER campo_gps_sesiones_relaciones BEFORE INSERT OR UPDATE ON public.campo_gps_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.campo_gps_validar_sesion_relaciones();

CREATE OR REPLACE FUNCTION public.campo_gps_autorizar_operador(p_parte_id uuid)
RETURNS public.campo_gps_sesiones
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_uid uuid := auth.uid(); v_parte public.campo_partes_trabajo; v_operador public.campo_operarios; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo WHERE id = p_parte_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'campo_gps_parte_no_disponible' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo WHERE id = v_parte.orden_id AND comercio_id = v_parte.comercio_id;
  SELECT * INTO v_operador FROM public.campo_operarios WHERE comercio_id = v_parte.comercio_id AND user_id = v_uid AND activo;
  IF v_orden.id IS NULL OR v_parte.propietario_user_id <> v_uid OR v_parte.propietario_operario_id <> v_operador.id
    OR NOT EXISTS (SELECT 1 FROM public.comercio_usuarios cu WHERE cu.comercio_id = v_parte.comercio_id AND cu.user_id = v_uid AND cu.rol = 'operador' AND cu.activo)
    OR v_parte.estado <> 'borrador' OR v_orden.estado NOT IN ('planificada', 'en_progreso') THEN
    RAISE EXCEPTION 'campo_gps_no_autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN (NULL::uuid, v_parte.comercio_id, v_orden.id, v_parte.id, v_operador.id, v_uid, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, 0, NULL::timestamptz, NULL::timestamptz)::public.campo_gps_sesiones;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_gps_iniciar_sesion(p_parte_id uuid)
RETURNS public.campo_gps_sesiones LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_auth public.campo_gps_sesiones; v_sesion public.campo_gps_sesiones;
BEGIN
  v_auth := public.campo_gps_autorizar_operador(p_parte_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('campo_gps:' || v_auth.parte_id::text || ':' || v_auth.operador_id::text, 0));
  SELECT * INTO v_sesion FROM public.campo_gps_sesiones WHERE comercio_id=v_auth.comercio_id AND parte_id=v_auth.parte_id AND operador_id=v_auth.operador_id AND estado IN ('activa','pausada') FOR UPDATE;
  IF FOUND THEN RETURN v_sesion; END IF;
  INSERT INTO public.campo_gps_sesiones(comercio_id,orden_id,parte_id,operador_id,usuario_id) VALUES (v_auth.comercio_id,v_auth.orden_id,v_auth.parte_id,v_auth.operador_id,v_auth.usuario_id) RETURNING * INTO v_sesion;
  RETURN v_sesion;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_gps_cambiar_estado(p_sesion_id uuid, p_accion text)
RETURNS public.campo_gps_sesiones LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_sesion public.campo_gps_sesiones; v_auth public.campo_gps_sesiones; v_pausa integer;
BEGIN
  SELECT * INTO v_sesion FROM public.campo_gps_sesiones WHERE id=p_sesion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campo_gps_sesion_no_disponible' USING ERRCODE='42501'; END IF;
  v_auth := public.campo_gps_autorizar_operador(v_sesion.parte_id);
  IF v_sesion.usuario_id <> v_auth.usuario_id OR v_sesion.operador_id <> v_auth.operador_id THEN RAISE EXCEPTION 'campo_gps_no_autorizado' USING ERRCODE='42501'; END IF;
  IF p_accion='pausar' AND v_sesion.estado='activa' THEN UPDATE public.campo_gps_sesiones SET estado='pausada', pausada_at=now() WHERE id=v_sesion.id RETURNING * INTO v_sesion;
  ELSIF p_accion='reanudar' AND v_sesion.estado='pausada' THEN v_pausa := greatest(0, floor(extract(epoch FROM now()-v_sesion.pausada_at))::integer); UPDATE public.campo_gps_sesiones SET estado='activa', pausada_at=NULL, segundos_pausados=segundos_pausados+v_pausa WHERE id=v_sesion.id RETURNING * INTO v_sesion;
  ELSIF p_accion='finalizar' AND v_sesion.estado IN ('activa','pausada') THEN v_pausa := CASE WHEN v_sesion.estado='pausada' THEN greatest(0, floor(extract(epoch FROM now()-v_sesion.pausada_at))::integer) ELSE 0 END; UPDATE public.campo_gps_sesiones SET estado='finalizada', finalizada_at=now(), pausada_at=NULL, segundos_pausados=segundos_pausados+v_pausa WHERE id=v_sesion.id RETURNING * INTO v_sesion;
  ELSIF (p_accion='pausar' AND v_sesion.estado='pausada') OR (p_accion='reanudar' AND v_sesion.estado='activa') OR (p_accion='finalizar' AND v_sesion.estado='finalizada') THEN RETURN v_sesion;
  ELSE RAISE EXCEPTION 'campo_gps_transicion_invalida'; END IF;
  RETURN v_sesion;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_gps_registrar_puntos(p_sesion_id uuid, p_puntos jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_sesion public.campo_gps_sesiones; v_auth public.campo_gps_sesiones; v_total integer; v_insertados integer;
BEGIN
  IF jsonb_typeof(p_puntos) <> 'array' THEN RAISE EXCEPTION 'campo_gps_lote_invalido'; END IF;
  v_total := jsonb_array_length(p_puntos); IF v_total < 1 OR v_total > 100 THEN RAISE EXCEPTION 'campo_gps_lote_invalido'; END IF;
  SELECT * INTO v_sesion FROM public.campo_gps_sesiones WHERE id=p_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.estado <> 'activa' THEN RAISE EXCEPTION 'campo_gps_sesion_no_activa' USING ERRCODE='42501'; END IF;
  v_auth := public.campo_gps_autorizar_operador(v_sesion.parte_id);
  IF v_sesion.usuario_id <> v_auth.usuario_id OR v_sesion.operador_id <> v_auth.operador_id THEN RAISE EXCEPTION 'campo_gps_no_autorizado' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_puntos) AS x(client_id uuid,secuencia bigint,latitud double precision,longitud double precision,precision_metros double precision,registrado_at timestamptz) WHERE client_id IS NULL OR secuencia IS NULL OR secuencia < 1 OR latitud NOT BETWEEN -90 AND 90 OR longitud NOT BETWEEN -180 AND 180 OR precision_metros NOT BETWEEN 0 AND 100000 OR registrado_at < '2020-01-01'::timestamptz OR registrado_at > now()+interval '5 minutes') THEN RAISE EXCEPTION 'campo_gps_punto_invalido'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_puntos) AS x(client_id uuid,secuencia bigint,latitud double precision,longitud double precision,precision_metros double precision,registrado_at timestamptz) GROUP BY secuencia HAVING count(*) > 1) THEN RAISE EXCEPTION 'campo_gps_secuencia_duplicada'; END IF;
  INSERT INTO public.campo_gps_puntos(comercio_id,sesion_id,client_id,secuencia,latitud,longitud,precision_metros,registrado_at)
  SELECT v_sesion.comercio_id,v_sesion.id,x.client_id,x.secuencia,x.latitud,x.longitud,x.precision_metros,x.registrado_at FROM jsonb_to_recordset(p_puntos) AS x(client_id uuid,secuencia bigint,latitud double precision,longitud double precision,precision_metros double precision,registrado_at timestamptz)
  ON CONFLICT (sesion_id,client_id) DO NOTHING;
  GET DIAGNOSTICS v_insertados = ROW_COUNT; RETURN v_insertados;
END;
$function$;

ALTER TABLE public.campo_gps_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_gps_puntos ENABLE ROW LEVEL SECURITY;
CREATE POLICY campo_gps_sesiones_select ON public.campo_gps_sesiones FOR SELECT TO authenticated USING (public.user_is_comercio_admin(comercio_id) OR usuario_id=auth.uid());
CREATE POLICY campo_gps_puntos_select ON public.campo_gps_puntos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.campo_gps_sesiones s WHERE s.id=sesion_id AND s.comercio_id=comercio_id AND (public.user_is_comercio_admin(s.comercio_id) OR s.usuario_id=auth.uid())));
REVOKE ALL ON TABLE public.campo_gps_sesiones, public.campo_gps_puntos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.campo_gps_sesiones, public.campo_gps_puntos TO authenticated;
REVOKE ALL ON FUNCTION public.campo_gps_autorizar_operador(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_gps_iniciar_sesion(uuid), public.campo_gps_cambiar_estado(uuid,text), public.campo_gps_registrar_puntos(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_gps_iniciar_sesion(uuid), public.campo_gps_cambiar_estado(uuid,text), public.campo_gps_registrar_puntos(uuid,jsonb) TO authenticated;
COMMIT;
