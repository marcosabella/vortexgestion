-- Terminales y PIN: no activa dispositivos ni modifica identidades existentes.
BEGIN;
CREATE TABLE public.restaurante_pines (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id), usuario_id uuid NOT NULL,
 hash text NOT NULL CHECK(hash ~ '^[0-9a-f]{64}$'), salt text NOT NULL CHECK(salt ~ '^[0-9a-f]{64}$'),
 intentos integer NOT NULL DEFAULT 0, ventana timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(comercio_id,usuario_id),
 FOREIGN KEY(comercio_id,usuario_id) REFERENCES public.restaurante_permisos(comercio_id,usuario_id)
);
CREATE TABLE public.restaurante_terminales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 100),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 creado_por uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 vence_at timestamptz NOT NULL DEFAULT now()+interval '30 days', revocada boolean NOT NULL DEFAULT false,
 intentos integer NOT NULL DEFAULT 0, ventana timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX restaurante_terminales_comercio ON public.restaurante_terminales(comercio_id,vence_at);
ALTER TABLE public.restaurante_pines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurante_terminales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurante_pines,public.restaurante_terminales FROM anon,authenticated;
GRANT SELECT ON public.restaurante_pines TO service_role;

CREATE FUNCTION public.restaurante_pin_elegible(p_comercio uuid,p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.comercio_acceso_vigente(p_comercio)
 AND EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio AND parametros->'modulos'->>'restaurante'='true')
 AND EXISTS(SELECT 1 FROM public.comercio_usuarios cu JOIN public.restaurante_permisos r ON r.comercio_id=cu.comercio_id AND r.usuario_id=cu.user_id
 WHERE cu.comercio_id=p_comercio AND cu.user_id=p_usuario AND cu.activo AND cu.solo_restaurante AND cu.rol='operador' AND r.activo AND cardinality(r.permisos)>0)
 AND (SELECT count(*) FROM public.comercio_usuarios WHERE user_id=p_usuario)=1;
$$;
CREATE FUNCTION public.restaurante_pin_guardar(p_comercio_id uuid,p_usuario_id uuid,p_hash text,p_salt text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.restaurante_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio_id AND usuario_id=p_usuario_id) THEN RAISE EXCEPTION 'Usuario no disponible'; END IF;
 IF p_hash IS NULL AND p_salt IS NULL THEN DELETE FROM public.restaurante_pines WHERE comercio_id=p_comercio_id AND usuario_id=p_usuario_id;
 ELSE
  IF public.restaurante_pin_elegible(p_comercio_id,p_usuario_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'PIN sólo para operadores activos exclusivos de este restaurante'; END IF;
  IF p_hash IS NULL OR p_salt IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_salt !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Datos de PIN inválidos'; END IF;
  INSERT INTO public.restaurante_pines(comercio_id,usuario_id,hash,salt) VALUES(p_comercio_id,p_usuario_id,p_hash,p_salt)
  ON CONFLICT(comercio_id,usuario_id) DO UPDATE SET hash=EXCLUDED.hash,salt=EXCLUDED.salt,intentos=0,ventana=now();
 END IF;
 INSERT INTO public.restaurante_eventos(comercio_id,accion,datos,usuario_id) VALUES(p_comercio_id,'pin_actualizado',jsonb_build_object('operador_id',p_usuario_id,'habilitado',p_hash IS NOT NULL),auth.uid());
 RETURN p_usuario_id;
END $$;
CREATE FUNCTION public.restaurante_terminal_crear(p_comercio_id uuid,p_nombre text,p_token_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
 IF public.restaurante_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 INSERT INTO public.restaurante_terminales(comercio_id,nombre,token_hash,creado_por) VALUES(p_comercio_id,btrim(p_nombre),p_token_hash,auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.restaurante_eventos(comercio_id,accion,datos,usuario_id) VALUES(p_comercio_id,'terminal_creada',jsonb_build_object('terminal_id',v_id),auth.uid());
 RETURN v_id;
END $$;
CREATE FUNCTION public.restaurante_terminales_listar(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.restaurante_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('terminales',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vence_at',vence_at,'revocada',revocada) ORDER BY created_at DESC) FROM public.restaurante_terminales WHERE comercio_id=p_comercio_id),'[]'),
 'usuarios',coalesce((SELECT jsonb_agg(usuario_id) FROM public.restaurante_pines WHERE comercio_id=p_comercio_id),'[]'));
END $$;
CREATE FUNCTION public.restaurante_terminal_revocar(p_comercio_id uuid,p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.restaurante_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 UPDATE public.restaurante_terminales SET revocada=true WHERE id=p_id AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Terminal no disponible'; END IF;
 INSERT INTO public.restaurante_eventos(comercio_id,accion,datos,usuario_id) VALUES(p_comercio_id,'terminal_revocada',jsonb_build_object('terminal_id',p_id),auth.uid());
 RETURN p_id;
END $$;

-- Sólo Edge Function (service_role). El secreto de terminal no permite operar tablas.
CREATE FUNCTION public.restaurante_terminal_info(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.restaurante_terminales;
BEGIN
 SELECT * INTO t FROM public.restaurante_terminales WHERE token_hash=p_token_hash AND NOT revocada AND vence_at>now();
 IF NOT FOUND OR public.comercio_acceso_vigente(t.comercio_id) IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=t.comercio_id AND parametros->'modulos'->>'restaurante'='true') THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('comercio_id',t.comercio_id,'nombre',t.nombre,'usuarios',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.usuario_id,'nombre',r.nombre) ORDER BY r.nombre) FROM public.restaurante_pines p JOIN public.restaurante_permisos r USING(comercio_id,usuario_id) WHERE p.comercio_id=t.comercio_id AND public.restaurante_pin_elegible(p.comercio_id,p.usuario_id)),'[]'));
END $$;
CREATE FUNCTION public.restaurante_pin_verificar(p_token_hash text,p_usuario_id uuid,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.restaurante_terminales; p public.restaurante_pines; v_email text;
BEGIN
 SELECT * INTO t FROM public.restaurante_terminales WHERE token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND OR t.revocada OR t.vence_at<=now() THEN RETURN NULL; END IF;
 IF t.ventana<=now()-interval '15 minutes' THEN UPDATE public.restaurante_terminales SET intentos=0,ventana=now() WHERE id=t.id; t.intentos:=0; END IF;
 IF t.intentos>=10 THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.restaurante_pines WHERE comercio_id=t.comercio_id AND usuario_id=p_usuario_id FOR UPDATE;
 IF NOT FOUND OR public.restaurante_pin_elegible(t.comercio_id,p_usuario_id) IS DISTINCT FROM true THEN
  UPDATE public.restaurante_terminales SET intentos=intentos+1 WHERE id=t.id; RETURN NULL;
 END IF;
 IF p.ventana<=now()-interval '15 minutes' THEN UPDATE public.restaurante_pines SET intentos=0,ventana=now() WHERE comercio_id=p.comercio_id AND usuario_id=p.usuario_id; p.intentos:=0; END IF;
 IF p.intentos>=5 THEN RETURN NULL; END IF;
 IF p_hash IS NULL OR p.hash<>p_hash THEN
  UPDATE public.restaurante_pines SET intentos=intentos+1 WHERE comercio_id=p.comercio_id AND usuario_id=p.usuario_id;
  UPDATE public.restaurante_terminales SET intentos=intentos+1 WHERE id=t.id;
  RETURN NULL;
 END IF;
 SELECT email INTO v_email FROM auth.users WHERE id=p_usuario_id;
 INSERT INTO public.restaurante_eventos(comercio_id,accion,datos,usuario_id) VALUES(t.comercio_id,'ingreso_pin',jsonb_build_object('terminal_id',t.id),p_usuario_id);
 RETURN jsonb_build_object('usuario_id',p_usuario_id,'email',v_email,'comercio_id',t.comercio_id);
END $$;
REVOKE ALL ON FUNCTION public.restaurante_pin_elegible(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurante_pin_guardar(uuid,uuid,text,text),public.restaurante_terminal_crear(uuid,text,text),public.restaurante_terminales_listar(uuid),public.restaurante_terminal_revocar(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_pin_guardar(uuid,uuid,text,text),public.restaurante_terminal_crear(uuid,text,text),public.restaurante_terminales_listar(uuid),public.restaurante_terminal_revocar(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.restaurante_terminal_info(text),public.restaurante_pin_verificar(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restaurante_terminal_info(text),public.restaurante_pin_verificar(text,uuid,text) TO service_role;
COMMIT;
