-- Etapa 1. Estructura; no habilita módulos ni carga datos de comercios.
BEGIN;
CREATE FUNCTION public.apicola_permiso(p_comercio uuid,p_nivel text DEFAULT 'lectura') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.comercio_usuarios u JOIN public.comercio c ON c.id=u.comercio_id
   JOIN public.comercio_parametrizacion p ON p.comercio_id=c.id
   WHERE u.comercio_id=p_comercio AND u.user_id=auth.uid() AND u.activo AND c.activo
     AND p.parametros->'modulos'->>'apicola'='true'
     AND (p_nivel='lectura' OR (p_nivel='operar' AND u.rol IN ('admin','operador')) OR (p_nivel='admin' AND u.rol='admin')));
$$;
REVOKE ALL ON FUNCTION public.apicola_permiso(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apicola_permiso(uuid,text) TO authenticated;

CREATE TABLE public.apicola_campanas(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 120),fecha_inicio date NOT NULL,fecha_fin date NOT NULL,
 estado text NOT NULL DEFAULT 'abierta' CHECK(estado IN ('abierta','cerrada')),
 observaciones text NOT NULL DEFAULT '' CHECK(length(observaciones)<=5000),
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),UNIQUE(comercio_id,nombre),CHECK(fecha_fin>=fecha_inicio)
);
CREATE TABLE public.apicola_apiarios(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 40),nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 150),
 establecimiento text NOT NULL DEFAULT '',localidad text NOT NULL DEFAULT '',provincia text NOT NULL DEFAULT '',direccion text NOT NULL DEFAULT '',
 latitud numeric CHECK(latitud BETWEEN -90 AND 90),longitud numeric CHECK(longitud BETWEEN -180 AND 180),
 contacto text NOT NULL DEFAULT '',telefono text NOT NULL DEFAULT '',
 uso text NOT NULL DEFAULT 'propio' CHECK(uso IN ('propio','prestado','arrendado','acuerdo')),
 acuerdo text NOT NULL DEFAULT '',fecha_instalacion date,fecha_retiro date,floraciones text NOT NULL DEFAULT '',
 agua_acceso text NOT NULL DEFAULT '',observaciones text NOT NULL DEFAULT '' CHECK(length(observaciones)<=5000),
 activo boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),UNIQUE(comercio_id,codigo),CHECK((latitud IS NULL)=(longitud IS NULL)),
 CHECK(fecha_retiro IS NULL OR fecha_instalacion IS NULL OR fecha_retiro>=fecha_instalacion)
);
CREATE TABLE public.apicola_colmenas(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),apiario_id uuid NOT NULL,
 codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 40),
 origen text NOT NULL DEFAULT 'existente' CHECK(origen IN ('existente','compra','nucleo','enjambre','division','fusion')),
 estado text NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa','nucleo','huerfana','fusionada','muerta','vendida','baja')),
 fecha_alta date NOT NULL DEFAULT current_date,material_codigo text NOT NULL DEFAULT '',
 reina_identificacion text NOT NULL DEFAULT '',reina_origen text NOT NULL DEFAULT '',reina_anio integer CHECK(reina_anio BETWEEN 1900 AND 2200),
 reina_marca text NOT NULL DEFAULT '',observaciones text NOT NULL DEFAULT '' CHECK(length(observaciones)<=5000),
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),UNIQUE(comercio_id,codigo),
 FOREIGN KEY(comercio_id,apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id)
);
CREATE INDEX apicola_colmenas_apiario ON public.apicola_colmenas(comercio_id,apiario_id,estado);
CREATE TABLE public.apicola_existencias(
 comercio_id uuid NOT NULL REFERENCES public.comercio(id),apiario_id uuid NOT NULL,
 recurso text NOT NULL CHECK(recurso IN ('colonias','piso','camara','alza','cuadro','techo','otro_material')),
 cantidad integer NOT NULL DEFAULT 0 CHECK(cantidad>=0),
 PRIMARY KEY(comercio_id,apiario_id,recurso),FOREIGN KEY(comercio_id,apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id)
);
CREATE TABLE public.apicola_movimientos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),campana_id uuid NOT NULL,
 fecha date NOT NULL,tipo text NOT NULL CHECK(tipo IN ('alta','baja','traslado','division','fusion','cambio_material')),
 recurso text NOT NULL CHECK(recurso IN ('colonias','piso','camara','alza','cuadro','techo','otro_material')),
 origen_apiario_id uuid,destino_apiario_id uuid,cantidad integer NOT NULL CHECK(cantidad>0),
 colmena_ids uuid[] NOT NULL DEFAULT '{}',motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 3 AND 1000),
 datos jsonb NOT NULL DEFAULT '{}',creado_por uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),FOREIGN KEY(comercio_id,campana_id) REFERENCES public.apicola_campanas(comercio_id,id),
 FOREIGN KEY(comercio_id,origen_apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id),
 FOREIGN KEY(comercio_id,destino_apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id)
);
CREATE INDEX apicola_movimientos_campana ON public.apicola_movimientos(comercio_id,campana_id,fecha DESC,id);
CREATE INDEX apicola_movimientos_origen ON public.apicola_movimientos(comercio_id,origen_apiario_id,fecha DESC);
CREATE INDEX apicola_movimientos_destino ON public.apicola_movimientos(comercio_id,destino_apiario_id,fecha DESC);
CREATE TABLE public.apicola_existencias_historial(
 comercio_id uuid NOT NULL,apiario_id uuid NOT NULL,recurso text NOT NULL,movimiento_id uuid NOT NULL,
 fecha date NOT NULL,delta integer NOT NULL CHECK(delta<>0),
 PRIMARY KEY(comercio_id,movimiento_id,apiario_id,recurso),
 FOREIGN KEY(comercio_id,apiario_id,recurso) REFERENCES public.apicola_existencias(comercio_id,apiario_id,recurso),
 FOREIGN KEY(comercio_id,movimiento_id) REFERENCES public.apicola_movimientos(comercio_id,id)
);
CREATE INDEX apicola_historial_apiario ON public.apicola_existencias_historial(comercio_id,apiario_id,recurso,fecha);
CREATE TABLE public.apicola_parentescos(
 comercio_id uuid NOT NULL,origen_colmena_id uuid NOT NULL,destino_colmena_id uuid NOT NULL,movimiento_id uuid NOT NULL,
 PRIMARY KEY(comercio_id,origen_colmena_id,destino_colmena_id),
 FOREIGN KEY(comercio_id,origen_colmena_id) REFERENCES public.apicola_colmenas(comercio_id,id),
 FOREIGN KEY(comercio_id,destino_colmena_id) REFERENCES public.apicola_colmenas(comercio_id,id),
 FOREIGN KEY(comercio_id,movimiento_id) REFERENCES public.apicola_movimientos(comercio_id,id),CHECK(origen_colmena_id<>destino_colmena_id)
);
CREATE INDEX apicola_parentescos_destino ON public.apicola_parentescos(comercio_id,destino_colmena_id);
CREATE TABLE public.apicola_registros(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),campana_id uuid NOT NULL,apiario_id uuid NOT NULL,
 tipo text NOT NULL CHECK(tipo IN ('visita','alimentacion','sanidad')),fecha date NOT NULL,
 responsable text NOT NULL CHECK(length(btrim(responsable)) BETWEEN 1 AND 200),
 alcance text NOT NULL CHECK(alcance IN ('apiario','grupo','colmenas')),cantidad integer NOT NULL CHECK(cantidad>=0),
 existencias_al_registrar integer NOT NULL CHECK(existencias_al_registrar>=cantidad),colmena_ids uuid[] NOT NULL DEFAULT '{}',
 datos jsonb NOT NULL DEFAULT '{}',observaciones text NOT NULL DEFAULT '' CHECK(length(observaciones)<=5000),
 proxima_fecha date,proxima_accion text NOT NULL DEFAULT '',
 estado text NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmado','anulado')),motivo_anulacion text,
 confirmado_por uuid REFERENCES auth.users(id),confirmado_at timestamptz,
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),FOREIGN KEY(comercio_id,campana_id) REFERENCES public.apicola_campanas(comercio_id,id),
 FOREIGN KEY(comercio_id,apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id),
 CHECK(proxima_fecha IS NULL OR proxima_fecha>=fecha),CHECK(tipo='visita' OR cantidad>0)
);
CREATE INDEX apicola_registros_listado ON public.apicola_registros(comercio_id,campana_id,tipo,fecha DESC,id);
CREATE INDEX apicola_registros_apiario ON public.apicola_registros(comercio_id,apiario_id,fecha DESC);
CREATE INDEX apicola_registros_colmenas ON public.apicola_registros USING gin(colmena_ids);
CREATE TABLE public.apicola_tareas(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),campana_id uuid NOT NULL,apiario_id uuid NOT NULL,
 registro_id uuid,origen text NOT NULL DEFAULT 'manual',fecha date NOT NULL,descripcion text NOT NULL CHECK(length(btrim(descripcion)) BETWEEN 1 AND 1000),
 responsable text NOT NULL CHECK(length(btrim(responsable)) BETWEEN 1 AND 200),
 prioridad text NOT NULL DEFAULT 'normal' CHECK(prioridad IN ('baja','normal','alta')),
 estado text NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','hecha','cancelada')),
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),UNIQUE(comercio_id,registro_id,origen),
 FOREIGN KEY(comercio_id,campana_id) REFERENCES public.apicola_campanas(comercio_id,id),
 FOREIGN KEY(comercio_id,apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id),
 FOREIGN KEY(comercio_id,registro_id) REFERENCES public.apicola_registros(comercio_id,id)
);
CREATE INDEX apicola_tareas_agenda ON public.apicola_tareas(comercio_id,estado,fecha,id);
CREATE TABLE public.apicola_operaciones(
 comercio_id uuid NOT NULL REFERENCES public.comercio(id),clave uuid NOT NULL,accion text NOT NULL,datos jsonb NOT NULL,resultado jsonb NOT NULL,
 usuario_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(comercio_id,clave)
);
CREATE TABLE public.apicola_auditoria(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 entidad text NOT NULL,registro_id uuid NOT NULL,anterior jsonb,nuevo jsonb,usuario_id uuid REFERENCES auth.users(id),fecha timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX apicola_auditoria_entidad ON public.apicola_auditoria(comercio_id,entidad,registro_id,fecha DESC);
CREATE FUNCTION public.apicola_auditar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.apicola_auditoria(comercio_id,entidad,registro_id,anterior,nuevo,usuario_id)
 VALUES(NEW.comercio_id,TG_TABLE_NAME,NEW.id,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW),auth.uid());
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.apicola_auditar() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['apicola_campanas','apicola_apiarios','apicola_colmenas','apicola_existencias','apicola_movimientos','apicola_existencias_historial','apicola_parentescos','apicola_registros','apicola_tareas','apicola_operaciones','apicola_auditoria'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   EXECUTE format('CREATE POLICY apicola_lectura ON public.%I FOR SELECT TO authenticated USING(public.apicola_permiso(comercio_id,%L))',t,CASE WHEN t IN ('apicola_operaciones','apicola_auditoria') THEN 'admin' ELSE 'lectura' END);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['apicola_campanas','apicola_apiarios','apicola_colmenas','apicola_movimientos','apicola_registros','apicola_tareas'] LOOP
   EXECUTE format('CREATE TRIGGER apicola_auditoria AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.apicola_auditar()',t);
 END LOOP;
END; $$;
COMMIT;
