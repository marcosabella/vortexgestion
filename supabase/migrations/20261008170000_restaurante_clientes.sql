BEGIN;
CREATE FUNCTION public.restaurante_clientes(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.restaurante_acceso(p_comercio_id) IS DISTINCT FROM true OR
    NOT (public.restaurante_permiso(p_comercio_id,'salon') OR public.restaurante_permiso(p_comercio_id,'pedidos')) THEN
   RAISE EXCEPTION 'Sin permiso para seleccionar clientes' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',c.id,'nombre',c.nombre,'apellido',c.apellido,'cuit',c.cuit,
   'telefono',c.telefono,'calle',c.calle,'numero',c.numero,'localidad',c.localidad
 ) ORDER BY c.apellido,c.nombre,c.id) FROM public.clientes c WHERE c.comercio_id=p_comercio_id),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.restaurante_clientes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_clientes(uuid) TO authenticated;
COMMIT;
