-- Importador productivo de maestros Access -> Supabase.
-- El flujo es: crear ejecucion -> cargar staging -> simular -> aplicar -> revertir.
-- Solo un administrador global puede ejecutar estas funciones.

CREATE TABLE public.migracion_staging_maestros (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migracion_id uuid NOT NULL REFERENCES public.migraciones(id) ON DELETE CASCADE,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  modulo text NOT NULL CHECK (modulo IN ('rubros', 'marcas', 'proveedores', 'productos', 'clientes')),
  source_id text NOT NULL,
  datos jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'valido', 'omitido', 'error', 'aplicado')),
  accion text CHECK (accion IS NULL OR accion IN ('insertar', 'omitir')),
  destino_id uuid,
  errores text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migracion_id, modulo, source_id)
);

ALTER TABLE public.migracion_staging_maestros ENABLE ROW LEVEL SECURITY;

CREATE POLICY migracion_staging_solo_app_admin
ON public.migracion_staging_maestros FOR ALL TO authenticated
USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE INDEX idx_migracion_staging_ejecucion
ON public.migracion_staging_maestros(migracion_id, modulo, estado);

ALTER TABLE public.migracion_id_map
ADD COLUMN IF NOT EXISTS accion text NOT NULL DEFAULT 'insertado'
CHECK (accion IN ('insertado', 'existente'));

-- El panel global administra comercios a los que el administrador no pertenece.
-- Se conserva la validacion normal y se habilita el comercio explicito solo para app_admins.
CREATE OR REPLACE FUNCTION public.set_comercio_id_from_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_comercio_id uuid;
BEGIN
  IF NEW.comercio_id IS NOT NULL THEN
    IF NOT public.user_belongs_to_comercio(NEW.comercio_id) AND NOT public.is_app_admin() THEN
      RAISE EXCEPTION 'El usuario no pertenece al comercio indicado';
    END IF;
    RETURN NEW;
  END IF;
  resolved_comercio_id := public.current_comercio_id();
  IF resolved_comercio_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver el comercio del usuario autenticado';
  END IF;
  NEW.comercio_id := resolved_comercio_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.migracion_assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede gestionar migraciones';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.migracion_crear_maestros(
  p_comercio_id uuid,
  p_archivo_nombre text,
  p_archivo_hash text DEFAULT NULL,
  p_archivo_tamano bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.migracion_assert_admin();
  IF NOT EXISTS (SELECT 1 FROM public.comercio WHERE id = p_comercio_id AND activo) THEN
    RAISE EXCEPTION 'El comercio de destino no existe o esta inactivo';
  END IF;
  IF coalesce(trim(p_archivo_nombre), '') = '' THEN
    RAISE EXCEPTION 'El nombre del archivo es obligatorio';
  END IF;
  IF p_archivo_tamano IS NOT NULL AND p_archivo_tamano > 524288000 THEN
    RAISE EXCEPTION 'El archivo supera el limite de 500 MB';
  END IF;
  IF p_archivo_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.migraciones
    WHERE comercio_id=p_comercio_id AND archivo_hash=p_archivo_hash AND estado='completado'
  ) THEN
    RAISE EXCEPTION 'Este mismo archivo ya fue migrado completamente al comercio seleccionado';
  END IF;

  INSERT INTO public.migraciones (
    comercio_id, archivo_nombre, archivo_hash, archivo_tamano, estado, resumen
  ) VALUES (
    p_comercio_id, p_archivo_nombre, p_archivo_hash, p_archivo_tamano, 'borrador',
    jsonb_build_object('tipo', 'maestros', 'version', 1)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.migracion_cargar_staging_maestros(
  p_migracion_id uuid,
  p_modulo text,
  p_filas jsonb,
  p_reemplazar boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comercio_id uuid;
  v_estado public.migracion_estado;
  v_count integer;
BEGIN
  PERFORM public.migracion_assert_admin();
  IF p_modulo NOT IN ('rubros', 'marcas', 'proveedores', 'productos', 'clientes') THEN
    RAISE EXCEPTION 'Modulo de maestros no soportado: %', p_modulo;
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Las filas deben enviarse como un arreglo JSON';
  END IF;

  SELECT comercio_id, estado INTO v_comercio_id, v_estado
  FROM public.migraciones WHERE id = p_migracion_id FOR UPDATE;
  IF v_comercio_id IS NULL THEN RAISE EXCEPTION 'Migracion inexistente'; END IF;
  IF v_estado NOT IN ('borrador', 'subido', 'analizando', 'listo') THEN
    RAISE EXCEPTION 'La migracion ya no admite cambios en staging';
  END IF;

  IF p_reemplazar THEN
    DELETE FROM public.migracion_staging_maestros
    WHERE migracion_id = p_migracion_id AND modulo = p_modulo;
  END IF;

  INSERT INTO public.migracion_staging_maestros (
    migracion_id, comercio_id, modulo, source_id, datos
  )
  SELECT p_migracion_id, v_comercio_id, p_modulo, trim(fila->>'sourceId'), fila->'data'
  FROM jsonb_array_elements(p_filas) fila
  WHERE trim(coalesce(fila->>'sourceId', '')) <> ''
  ON CONFLICT (migracion_id, modulo, source_id)
  DO UPDATE SET datos = EXCLUDED.datos, estado = 'pendiente', accion = NULL,
                destino_id = NULL, errores = '{}';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.migracion_modulos (
    migracion_id, modulo, tabla_origen, tabla_destino, dependencias, registros_origen
  ) VALUES (
    p_migracion_id, p_modulo, p_modulo,
    CASE p_modulo WHEN 'productos' THEN 'productos' ELSE p_modulo END,
    CASE p_modulo WHEN 'productos' THEN ARRAY['rubros','marcas','proveedores']::text[] ELSE '{}'::text[] END,
    (SELECT count(*) FROM public.migracion_staging_maestros WHERE migracion_id = p_migracion_id AND modulo = p_modulo)
  ) ON CONFLICT (migracion_id, modulo) DO UPDATE
  SET registros_origen = EXCLUDED.registros_origen, estado = 'pendiente', diagnostico = '{}';

  UPDATE public.migraciones SET estado = 'subido' WHERE id = p_migracion_id;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.migracion_simular_maestros(p_migracion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comercio_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.migracion_assert_admin();
  SELECT comercio_id INTO v_comercio_id FROM public.migraciones
  WHERE id = p_migracion_id FOR UPDATE;
  IF v_comercio_id IS NULL THEN RAISE EXCEPTION 'Migracion inexistente'; END IF;
  IF EXISTS (SELECT 1 FROM public.migracion_id_map WHERE migracion_id = p_migracion_id AND accion = 'insertado') THEN
    RAISE EXCEPTION 'La migracion ya fue aplicada';
  END IF;
  UPDATE public.migraciones SET estado = 'analizando' WHERE id = p_migracion_id;

  UPDATE public.migracion_staging_maestros
  SET estado = 'valido', accion = 'insertar', destino_id = NULL, errores = '{}'
  WHERE migracion_id = p_migracion_id;

  UPDATE public.migracion_staging_maestros s SET errores = array_append(errores, 'Falta nombre')
  WHERE s.migracion_id = p_migracion_id AND s.modulo IN ('rubros','marcas','proveedores','clientes')
    AND trim(coalesce(s.datos->>'nombre', '')) = '';
  UPDATE public.migracion_staging_maestros s SET errores = array_append(errores, 'Falta codigo de producto')
  WHERE s.migracion_id = p_migracion_id AND s.modulo = 'productos'
    AND trim(coalesce(s.datos->>'cod_producto', '')) = '';
  UPDATE public.migracion_staging_maestros s SET errores = array_append(errores, 'Falta descripcion')
  WHERE s.migracion_id = p_migracion_id AND s.modulo = 'productos'
    AND trim(coalesce(s.datos->>'descripcion', '')) = '';
  UPDATE public.migracion_staging_maestros s SET errores = array_append(errores, 'Tipo de persona invalido')
  WHERE s.migracion_id = p_migracion_id AND s.modulo IN ('proveedores','clientes')
    AND coalesce(s.datos->>'tipo_persona', '') NOT IN ('fisica','juridica');
  UPDATE public.migracion_staging_maestros s SET errores = array_append(errores, 'Moneda invalida')
  WHERE s.migracion_id = p_migracion_id AND s.modulo = 'productos'
    AND coalesce(s.datos->>'tipo_moneda', '') NOT IN ('ARS','USD','USD_BLUE');
  WITH duplicados AS (
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY migracion_id, trim(datos->>'cod_producto') ORDER BY id) posicion
      FROM public.migracion_staging_maestros
      WHERE migracion_id=p_migracion_id AND modulo='productos'
    ) q WHERE posicion > 1
  )
  UPDATE public.migracion_staging_maestros s SET errores=array_append(errores,'Codigo de producto duplicado en el archivo')
  FROM duplicados d WHERE s.id=d.id;

  -- Referencias de productos: deben existir en esta ejecucion cuando fueron informadas.
  UPDATE public.migracion_staging_maestros p SET errores = array_append(p.errores, 'Proveedor de origen inexistente')
  WHERE p.migracion_id = p_migracion_id AND p.modulo = 'productos'
    AND nullif(p.datos->>'proveedor_source_id','') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.migracion_staging_maestros x WHERE x.migracion_id=p.migracion_id AND x.modulo='proveedores' AND x.source_id=p.datos->>'proveedor_source_id');
  UPDATE public.migracion_staging_maestros p SET errores = array_append(p.errores, 'Rubro de origen inexistente')
  WHERE p.migracion_id = p_migracion_id AND p.modulo = 'productos'
    AND nullif(p.datos->>'rubro_source_id','') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.migracion_staging_maestros x WHERE x.migracion_id=p.migracion_id AND x.modulo='rubros' AND x.source_id=p.datos->>'rubro_source_id');
  UPDATE public.migracion_staging_maestros p SET errores = array_append(p.errores, 'Marca de origen inexistente')
  WHERE p.migracion_id = p_migracion_id AND p.modulo = 'productos'
    AND nullif(p.datos->>'marca_source_id','') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.migracion_staging_maestros x WHERE x.migracion_id=p.migracion_id AND x.modulo='marcas' AND x.source_id=p.datos->>'marca_source_id');

  -- Los duplicados del comercio se omiten; la primera version nunca actualiza datos existentes.
  UPDATE public.migracion_staging_maestros s SET estado='omitido', accion='omitir', destino_id=t.id
  FROM public.rubros t WHERE s.migracion_id=p_migracion_id AND s.modulo='rubros'
    AND t.comercio_id=v_comercio_id AND lower(trim(t.nombre))=lower(trim(s.datos->>'nombre'));
  UPDATE public.migracion_staging_maestros s SET estado='omitido', accion='omitir', destino_id=t.id
  FROM public.marcas t WHERE s.migracion_id=p_migracion_id AND s.modulo='marcas'
    AND t.comercio_id=v_comercio_id AND lower(trim(t.nombre))=lower(trim(s.datos->>'nombre'));
  UPDATE public.migracion_staging_maestros s SET estado='omitido', accion='omitir', destino_id=t.id
  FROM public.proveedores t WHERE s.migracion_id=p_migracion_id AND s.modulo='proveedores'
    AND t.comercio_id=v_comercio_id AND trim(coalesce(t.cuit,''))<>'' AND trim(t.cuit)=trim(s.datos->>'cuit');
  UPDATE public.migracion_staging_maestros s SET estado='omitido', accion='omitir', destino_id=t.id
  FROM public.clientes t WHERE s.migracion_id=p_migracion_id AND s.modulo='clientes'
    AND t.comercio_id=v_comercio_id AND trim(coalesce(t.cuit,''))<>'' AND trim(t.cuit)=trim(s.datos->>'cuit');
  UPDATE public.migracion_staging_maestros s SET estado='omitido', accion='omitir', destino_id=t.id
  FROM public.productos t WHERE s.migracion_id=p_migracion_id AND s.modulo='productos'
    AND t.comercio_id=v_comercio_id AND trim(t.cod_producto)=trim(s.datos->>'cod_producto');

  UPDATE public.migracion_staging_maestros SET estado='error', accion=NULL
  WHERE migracion_id=p_migracion_id AND cardinality(errores)>0;

  UPDATE public.migracion_modulos mm SET
    registros_validos=(SELECT count(*) FROM public.migracion_staging_maestros s WHERE s.migracion_id=mm.migracion_id AND s.modulo=mm.modulo AND s.estado='valido'),
    omitidos=(SELECT count(*) FROM public.migracion_staging_maestros s WHERE s.migracion_id=mm.migracion_id AND s.modulo=mm.modulo AND s.estado='omitido'),
    errores=(SELECT count(*) FROM public.migracion_staging_maestros s WHERE s.migracion_id=mm.migracion_id AND s.modulo=mm.modulo AND s.estado='error'),
    estado=CASE WHEN EXISTS (SELECT 1 FROM public.migracion_staging_maestros s WHERE s.migracion_id=mm.migracion_id AND s.modulo=mm.modulo AND s.estado='error') THEN 'requiere_revision'::public.migracion_modulo_estado ELSE 'listo'::public.migracion_modulo_estado END,
    diagnostico=jsonb_build_object('simulado_at',now())
  WHERE mm.migracion_id=p_migracion_id;

  UPDATE public.migraciones SET estado='listo', resumen=jsonb_set(resumen,'{simulado_at}',to_jsonb(now()))
  WHERE id=p_migracion_id;

  SELECT jsonb_build_object(
    'total', count(*), 'validos', count(*) FILTER(WHERE estado='valido'),
    'omitidos', count(*) FILTER(WHERE estado='omitido'), 'errores', count(*) FILTER(WHERE estado='error'),
    'por_modulo', (SELECT jsonb_object_agg(modulo, datos) FROM (
      SELECT modulo, jsonb_build_object('total',count(*),'validos',count(*) FILTER(WHERE estado='valido'),'omitidos',count(*) FILTER(WHERE estado='omitido'),'errores',count(*) FILTER(WHERE estado='error')) datos
      FROM public.migracion_staging_maestros WHERE migracion_id=p_migracion_id GROUP BY modulo
    ) m)
  ) INTO v_result FROM public.migracion_staging_maestros WHERE migracion_id=p_migracion_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.migracion_aplicar_maestros(p_migracion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comercio_id uuid;
  r record;
  v_id uuid;
  v_proveedor uuid;
  v_rubro uuid;
  v_marca uuid;
  v_insertados integer := 0;
  v_omitidos integer := 0;
BEGIN
  PERFORM public.migracion_assert_admin();
  SELECT comercio_id INTO v_comercio_id FROM public.migraciones
  WHERE id=p_migracion_id AND estado='listo' FOR UPDATE;
  IF v_comercio_id IS NULL THEN RAISE EXCEPTION 'La migracion no esta lista para aplicar'; END IF;
  IF EXISTS (SELECT 1 FROM public.migracion_staging_maestros WHERE migracion_id=p_migracion_id AND estado='error') THEN
    RAISE EXCEPTION 'La simulacion contiene errores; corrijalos antes de aplicar';
  END IF;
  UPDATE public.migraciones SET estado='importando' WHERE id=p_migracion_id;

  FOR r IN SELECT * FROM public.migracion_staging_maestros WHERE migracion_id=p_migracion_id ORDER BY CASE modulo WHEN 'rubros' THEN 1 WHEN 'marcas' THEN 2 WHEN 'proveedores' THEN 3 WHEN 'clientes' THEN 4 WHEN 'productos' THEN 5 END, id LOOP
    IF r.accion='omitir' THEN
      INSERT INTO public.migracion_id_map(migracion_id,comercio_id,entidad,id_origen,id_destino,accion)
      VALUES(p_migracion_id,v_comercio_id,r.modulo,r.source_id,r.destino_id,'existente')
      ON CONFLICT(migracion_id,entidad,id_origen) DO UPDATE SET id_destino=EXCLUDED.id_destino,accion='existente';
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    v_id := gen_random_uuid();
    IF r.modulo='rubros' THEN
      INSERT INTO public.rubros(id,comercio_id,nombre,descripcion) VALUES(v_id,v_comercio_id,r.datos->>'nombre',nullif(r.datos->>'descripcion',''));
    ELSIF r.modulo='marcas' THEN
      INSERT INTO public.marcas(id,comercio_id,nombre,descripcion) VALUES(v_id,v_comercio_id,r.datos->>'nombre',nullif(r.datos->>'descripcion',''));
    ELSIF r.modulo='proveedores' THEN
      INSERT INTO public.proveedores(id,comercio_id,tipo_persona,nombre,apellido,razon_social,cuit,ingresos_brutos,situacion_afip,email,telefono,calle,numero,codigo_postal,localidad,provincia)
      VALUES(v_id,v_comercio_id,r.datos->>'tipo_persona',r.datos->>'nombre',nullif(r.datos->>'apellido',''),nullif(r.datos->>'razon_social',''),coalesce(r.datos->>'cuit',''),nullif(r.datos->>'ingresos_brutos',''),coalesce(nullif(r.datos->>'situacion_afip',''),'No Responsable'),nullif(r.datos->>'email',''),nullif(r.datos->>'telefono',''),coalesce(r.datos->>'calle',''),coalesce(r.datos->>'numero',''),coalesce(r.datos->>'codigo_postal',''),coalesce(r.datos->>'localidad',''),coalesce(r.datos->>'provincia',''));
    ELSIF r.modulo='clientes' THEN
      INSERT INTO public.clientes(id,comercio_id,tipo_persona,nombre,apellido,cuit,ingresos_brutos,situacion_afip,email,telefono,calle,numero,codigo_postal,localidad,provincia)
      VALUES(v_id,v_comercio_id,r.datos->>'tipo_persona',r.datos->>'nombre',coalesce(r.datos->>'apellido',''),coalesce(r.datos->>'cuit',''),nullif(r.datos->>'ingresos_brutos',''),coalesce(nullif(r.datos->>'situacion_afip',''),'Consumidor Final'),nullif(r.datos->>'email',''),nullif(r.datos->>'telefono',''),coalesce(r.datos->>'calle',''),coalesce(r.datos->>'numero',''),coalesce(r.datos->>'codigo_postal',''),coalesce(r.datos->>'localidad',''),coalesce(r.datos->>'provincia',''));
    ELSIF r.modulo='productos' THEN
      SELECT id_destino INTO v_proveedor FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='proveedores' AND id_origen=r.datos->>'proveedor_source_id';
      SELECT id_destino INTO v_rubro FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='rubros' AND id_origen=r.datos->>'rubro_source_id';
      SELECT id_destino INTO v_marca FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='marcas' AND id_origen=r.datos->>'marca_source_id';
      INSERT INTO public.productos(id,comercio_id,cod_producto,cod_barras,descripcion,proveedor_id,rubro_id,marca_id,subrubro_id,precio_costo,porcentaje_iva,porcentaje_utilidad,porcentaje_descuento,stock,tipo_moneda,observaciones)
      VALUES(v_id,v_comercio_id,r.datos->>'cod_producto',nullif(r.datos->>'cod_barras',''),r.datos->>'descripcion',v_proveedor,v_rubro,v_marca,NULL,coalesce((r.datos->>'precio_costo')::numeric,0),coalesce((r.datos->>'porcentaje_iva')::numeric,0),coalesce((r.datos->>'porcentaje_utilidad')::numeric,0),coalesce((r.datos->>'porcentaje_descuento')::numeric,0),coalesce((r.datos->>'stock')::integer,0),(r.datos->>'tipo_moneda')::public.tipo_moneda,nullif(r.datos->>'observaciones',''));
    END IF;
    INSERT INTO public.migracion_id_map(migracion_id,comercio_id,entidad,id_origen,id_destino,accion)
    VALUES(p_migracion_id,v_comercio_id,r.modulo,r.source_id,v_id,'insertado');
    UPDATE public.migracion_staging_maestros SET estado='aplicado',destino_id=v_id WHERE id=r.id;
    v_insertados := v_insertados + 1;
  END LOOP;

  UPDATE public.migracion_modulos mm SET estado='completado',insertados=(SELECT count(*) FROM public.migracion_id_map x WHERE x.migracion_id=p_migracion_id AND x.entidad=mm.modulo AND x.accion='insertado'),omitidos=(SELECT count(*) FROM public.migracion_id_map x WHERE x.migracion_id=p_migracion_id AND x.entidad=mm.modulo AND x.accion='existente') WHERE mm.migracion_id=p_migracion_id;
  UPDATE public.migraciones SET estado='completado',resumen=resumen||jsonb_build_object('aplicado_at',now(),'insertados',v_insertados,'omitidos',v_omitidos) WHERE id=p_migracion_id;
  RETURN jsonb_build_object('insertados',v_insertados,'omitidos',v_omitidos);
END;
$$;

CREATE OR REPLACE FUNCTION public.migracion_revertir_maestros(p_migracion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comercio_id uuid;
  v_eliminados integer;
BEGIN
  PERFORM public.migracion_assert_admin();
  SELECT comercio_id INTO v_comercio_id FROM public.migraciones WHERE id=p_migracion_id AND estado='completado' FOR UPDATE;
  IF v_comercio_id IS NULL THEN RAISE EXCEPTION 'Solo se puede revertir una migracion completada'; END IF;

  -- Una sola transaccion y orden inverso de dependencias. Si una fila ya tiene
  -- referencias posteriores, PostgreSQL cancela toda la reversion sin borrar parcialmente.
  DELETE FROM public.productos t USING public.migracion_id_map m WHERE m.migracion_id=p_migracion_id AND m.entidad='productos' AND m.accion='insertado' AND t.id=m.id_destino AND t.comercio_id=v_comercio_id;
  DELETE FROM public.clientes t USING public.migracion_id_map m WHERE m.migracion_id=p_migracion_id AND m.entidad='clientes' AND m.accion='insertado' AND t.id=m.id_destino AND t.comercio_id=v_comercio_id;
  DELETE FROM public.proveedores t USING public.migracion_id_map m WHERE m.migracion_id=p_migracion_id AND m.entidad='proveedores' AND m.accion='insertado' AND t.id=m.id_destino AND t.comercio_id=v_comercio_id;
  DELETE FROM public.marcas t USING public.migracion_id_map m WHERE m.migracion_id=p_migracion_id AND m.entidad='marcas' AND m.accion='insertado' AND t.id=m.id_destino AND t.comercio_id=v_comercio_id;
  DELETE FROM public.rubros t USING public.migracion_id_map m WHERE m.migracion_id=p_migracion_id AND m.entidad='rubros' AND m.accion='insertado' AND t.id=m.id_destino AND t.comercio_id=v_comercio_id;
  GET DIAGNOSTICS v_eliminados = ROW_COUNT;
  SELECT count(*) INTO v_eliminados FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND accion='insertado';
  DELETE FROM public.migracion_id_map WHERE migracion_id=p_migracion_id;
  UPDATE public.migracion_staging_maestros SET estado=CASE WHEN accion='omitir' THEN 'omitido' ELSE 'valido' END,destino_id=NULL WHERE migracion_id=p_migracion_id;
  UPDATE public.migracion_modulos SET estado='listo',insertados=0 WHERE migracion_id=p_migracion_id;
  UPDATE public.migraciones SET estado='cancelado',resumen=resumen||jsonb_build_object('revertido_at',now(),'eliminados',v_eliminados) WHERE id=p_migracion_id;
  RETURN jsonb_build_object('eliminados',v_eliminados);
END;
$$;

GRANT EXECUTE ON FUNCTION public.migracion_crear_maestros(uuid,text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migracion_cargar_staging_maestros(uuid,text,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migracion_simular_maestros(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migracion_aplicar_maestros(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migracion_revertir_maestros(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.migracion_assert_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_crear_maestros(uuid,text,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_cargar_staging_maestros(uuid,text,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_simular_maestros(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_aplicar_maestros(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_revertir_maestros(uuid) FROM PUBLIC;
