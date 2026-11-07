-- Continuación de etapa 3. Sin datos de comercios ni configuración remota.
BEGIN;
CREATE TABLE public.apicola_fraccionamientos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 lote_id uuid NOT NULL,tambor_id uuid,fecha date NOT NULL,codigo text NOT NULL CHECK(length(btrim(codigo)) BETWEEN 1 AND 60),
 presentacion text NOT NULL CHECK(length(btrim(presentacion)) BETWEEN 1 AND 150),
 peso_kg numeric(12,3) NOT NULL CHECK(peso_kg>0 AND peso_kg<10000),unidades integer NOT NULL CHECK(unidades>0),
 merma_kg numeric(14,3) NOT NULL DEFAULT 0 CHECK(merma_kg>=0 AND merma_kg<100000000),
 consumido_kg numeric GENERATED ALWAYS AS (peso_kg*unidades+merma_kg) STORED,
 responsable text NOT NULL CHECK(length(btrim(responsable)) BETWEEN 1 AND 150),
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')),motivo_anulacion text,
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),UNIQUE(comercio_id,codigo),
 FOREIGN KEY(comercio_id,lote_id) REFERENCES public.apicola_lotes(comercio_id,id),
 FOREIGN KEY(comercio_id,tambor_id) REFERENCES public.apicola_tambores(comercio_id,id)
);
CREATE TABLE public.apicola_fraccionado_insumos (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id),fraccionamiento_id uuid NOT NULL,producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
 tipo text NOT NULL CHECK(tipo IN ('envase','tapa','etiqueta','otro')),cantidad integer NOT NULL CHECK(cantidad>0),
 descripcion text NOT NULL,costo_unitario numeric NOT NULL CHECK(costo_unitario>=0 AND costo_unitario<1000000000000),moneda text NOT NULL,
 PRIMARY KEY(comercio_id,fraccionamiento_id,producto_id),
 FOREIGN KEY(comercio_id,fraccionamiento_id) REFERENCES public.apicola_fraccionamientos(comercio_id,id)
);
CREATE TABLE public.apicola_salidas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 lote_id uuid NOT NULL,tambor_id uuid,fraccionamiento_id uuid,venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE RESTRICT,
 venta_item_id uuid NOT NULL REFERENCES public.venta_items(id) ON DELETE RESTRICT,fecha date NOT NULL,
 cantidad numeric(14,3) NOT NULL CHECK(cantidad>0 AND cantidad<100000000),unidad text NOT NULL CHECK(unidad IN ('kg','unidades')),
 kg numeric(14,3) NOT NULL CHECK(kg>0 AND kg<100000000),comprobante text NOT NULL,cliente text NOT NULL DEFAULT '',
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')),motivo_anulacion text,
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),CHECK((fraccionamiento_id IS NULL AND unidad='kg') OR (fraccionamiento_id IS NOT NULL AND tambor_id IS NULL AND unidad='unidades' AND cantidad=trunc(cantidad))),
 FOREIGN KEY(comercio_id,lote_id) REFERENCES public.apicola_lotes(comercio_id,id),
 FOREIGN KEY(comercio_id,tambor_id) REFERENCES public.apicola_tambores(comercio_id,id),
 FOREIGN KEY(comercio_id,fraccionamiento_id) REFERENCES public.apicola_fraccionamientos(comercio_id,id)
);
CREATE TABLE public.apicola_devoluciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),salida_id uuid NOT NULL,fecha date NOT NULL,
 cantidad numeric(14,3) NOT NULL CHECK(cantidad>0 AND cantidad<100000000),motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 5 AND 1000),
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')),motivo_anulacion text,
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),FOREIGN KEY(comercio_id,salida_id) REFERENCES public.apicola_salidas(comercio_id,id)
);
CREATE INDEX apicola_fraccionamientos_lote ON public.apicola_fraccionamientos(comercio_id,lote_id,tambor_id,estado);
CREATE INDEX apicola_insumos_producto ON public.apicola_fraccionado_insumos(producto_id);
CREATE INDEX apicola_salidas_lote ON public.apicola_salidas(comercio_id,lote_id,tambor_id,fraccionamiento_id,estado);
CREATE INDEX apicola_salidas_venta ON public.apicola_salidas(venta_id,venta_item_id,estado);
CREATE INDEX apicola_salidas_item ON public.apicola_salidas(venta_item_id,estado);
CREATE INDEX apicola_devoluciones_salida ON public.apicola_devoluciones(comercio_id,salida_id,estado);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['apicola_fraccionamientos','apicola_fraccionado_insumos','apicola_salidas','apicola_devoluciones'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY apicola_lectura ON public.%I FOR SELECT TO authenticated USING(public.apicola_permiso(comercio_id,%L))',t,CASE WHEN t='apicola_fraccionado_insumos' THEN 'admin' ELSE 'lectura' END);
  IF t<>'apicola_fraccionado_insumos' THEN EXECUTE format('CREATE TRIGGER apicola_auditoria AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.apicola_auditar()',t); END IF;
 END LOOP;
END $$;
-- Vistas internas: no se exponen a clientes ni omiten RLS en consultas públicas.
CREATE VIEW public.apicola_salidas_netas AS
 SELECT s.*,s.cantidad-coalesce((SELECT sum(d.cantidad) FROM public.apicola_devoluciones d WHERE d.comercio_id=s.comercio_id AND d.salida_id=s.id AND d.estado='vigente'),0) pendiente,
 s.kg/s.cantidad*(s.cantidad-coalesce((SELECT sum(d.cantidad) FROM public.apicola_devoluciones d WHERE d.comercio_id=s.comercio_id AND d.salida_id=s.id AND d.estado='vigente'),0)) kg_netos
 FROM public.apicola_salidas s WHERE s.estado='vigente';
REVOKE ALL ON public.apicola_salidas_netas FROM PUBLIC,anon,authenticated;
COMMIT;
