-- Etapa 2: producción y trazabilidad. Sin datos productivos ni cambios de módulos.
BEGIN;
CREATE TABLE public.apicola_salas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 60), nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 150),
 tipo text NOT NULL CHECK(tipo IN ('propia','externa')), habilitacion text NOT NULL DEFAULT '', contacto text NOT NULL DEFAULT '',
 activo boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id), UNIQUE(comercio_id,codigo)
);
CREATE TABLE public.apicola_cosechas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 campana_id uuid NOT NULL, apiario_id uuid NOT NULL, fecha date NOT NULL,
 codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 60),
 alzas integer NOT NULL CHECK(alzas>0), responsable text NOT NULL CHECK(length(btrim(responsable)) BETWEEN 1 AND 150),
 observaciones text NOT NULL DEFAULT '' CHECK(length(observaciones)<=5000),
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')), motivo_anulacion text,
 version integer NOT NULL DEFAULT 1, creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id), UNIQUE(comercio_id,codigo),
 FOREIGN KEY(comercio_id,campana_id) REFERENCES public.apicola_campanas(comercio_id,id),
 FOREIGN KEY(comercio_id,apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id)
);
CREATE TABLE public.apicola_extracciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 campana_id uuid NOT NULL, fecha date NOT NULL, codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 60),
 sala_id uuid NOT NULL, sala text NOT NULL CHECK(length(btrim(sala)) BETWEEN 1 AND 150), responsable text NOT NULL CHECK(length(btrim(responsable)) BETWEEN 1 AND 150),
 kg numeric(14,3) NOT NULL CHECK(kg>0 AND kg<100000000),
 observaciones text NOT NULL DEFAULT '' CHECK(length(observaciones)<=5000),
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')), motivo_anulacion text,
 version integer NOT NULL DEFAULT 1, creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id), UNIQUE(comercio_id,codigo),
 FOREIGN KEY(comercio_id,campana_id) REFERENCES public.apicola_campanas(comercio_id,id),
 FOREIGN KEY(comercio_id,sala_id) REFERENCES public.apicola_salas(comercio_id,id)
);
CREATE TABLE public.apicola_extraccion_origenes (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id), extraccion_id uuid NOT NULL, cosecha_id uuid NOT NULL,
 alzas integer NOT NULL CHECK(alzas>0), PRIMARY KEY(comercio_id,extraccion_id,cosecha_id),
 FOREIGN KEY(comercio_id,extraccion_id) REFERENCES public.apicola_extracciones(comercio_id,id),
 FOREIGN KEY(comercio_id,cosecha_id) REFERENCES public.apicola_cosechas(comercio_id,id)
);
CREATE TABLE public.apicola_lotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 extraccion_id uuid NOT NULL, codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 60),
 floracion text NOT NULL DEFAULT '' CHECK(length(floracion)<=500), humedad numeric(5,2) CHECK(humedad BETWEEN 0 AND 100),
 estado_calidad text NOT NULL DEFAULT 'pendiente' CHECK(estado_calidad IN ('pendiente','liberado','bloqueado')),
 version integer NOT NULL DEFAULT 1, creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id), UNIQUE(comercio_id,codigo), UNIQUE(comercio_id,extraccion_id),
 FOREIGN KEY(comercio_id,extraccion_id) REFERENCES public.apicola_extracciones(comercio_id,id)
);
CREATE TABLE public.apicola_tambores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), lote_id uuid NOT NULL,
 codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 60), fecha date NOT NULL,
 bruto numeric(14,3) NOT NULL CHECK(bruto>0 AND bruto<100000000), tara numeric(14,3) NOT NULL CHECK(tara>=0 AND tara<bruto),
 neto numeric(14,3) GENERATED ALWAYS AS (bruto-tara) STORED,
 ubicacion text NOT NULL CHECK(length(btrim(ubicacion)) BETWEEN 1 AND 200),
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')), motivo_anulacion text,
 version integer NOT NULL DEFAULT 1, creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id), UNIQUE(comercio_id,codigo),
 FOREIGN KEY(comercio_id,lote_id) REFERENCES public.apicola_lotes(comercio_id,id)
);
CREATE INDEX apicola_cosechas_periodo ON public.apicola_cosechas(comercio_id,campana_id,apiario_id,fecha);
CREATE TABLE public.apicola_analisis (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), lote_id uuid NOT NULL,
 fecha date NOT NULL, muestra text NOT NULL CHECK(length(btrim(muestra)) BETWEEN 1 AND 100),
 laboratorio text NOT NULL CHECK(length(btrim(laboratorio)) BETWEEN 1 AND 200),
 resultado text NOT NULL CHECK(resultado IN ('pendiente','conforme','no_conforme')),
 humedad numeric(5,2) CHECK(humedad BETWEEN 0 AND 100), informe text NOT NULL CHECK(length(btrim(informe)) BETWEEN 5 AND 5000),
 version integer NOT NULL DEFAULT 1, creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id), FOREIGN KEY(comercio_id,lote_id) REFERENCES public.apicola_lotes(comercio_id,id)
);
CREATE INDEX apicola_analisis_lote ON public.apicola_analisis(comercio_id,lote_id,fecha,created_at);
CREATE INDEX apicola_extracciones_sala ON public.apicola_extracciones(comercio_id,sala_id);
CREATE INDEX apicola_extracciones_periodo ON public.apicola_extracciones(comercio_id,campana_id,fecha);
CREATE INDEX apicola_origenes_cosecha ON public.apicola_extraccion_origenes(comercio_id,cosecha_id);
CREATE INDEX apicola_tambores_lote ON public.apicola_tambores(comercio_id,lote_id,fecha);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['apicola_salas','apicola_cosechas','apicola_extracciones','apicola_extraccion_origenes','apicola_lotes','apicola_tambores','apicola_analisis'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY apicola_lectura ON public.%I FOR SELECT TO authenticated USING(public.apicola_permiso(comercio_id))',t);
  IF t<>'apicola_extraccion_origenes' THEN
   EXECUTE format('CREATE TRIGGER apicola_auditoria AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.apicola_auditar()',t);
  END IF;
 END LOOP;
END $$;
COMMIT;
