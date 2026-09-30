-- Comparte exclusivamente el comprobante referenciado por una notificacion.
-- Evita buscar por numero dentro del tenant destinatario y no expone secretos AFIP.

CREATE OR REPLACE FUNCTION public.get_comprobante_notificacion(
  p_notificacion_id uuid,
  p_comercio_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_metadata jsonb;
  v_venta_id uuid;
  v_emisor_id uuid;
  v_venta public.ventas;
  v_venta_json jsonb;
  v_comercio_json jsonb;
  v_afip_json jsonb;
  v_formato text := 'a4';
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesion'; END IF;
  IF NOT public.user_belongs_to_comercio(p_comercio_id) THEN
    RAISE EXCEPTION 'No tiene acceso al comercio destinatario';
  END IF;
  IF NOT public.notificacion_visible_para_comercio(p_notificacion_id, p_comercio_id) THEN
    RAISE EXCEPTION 'La notificacion no corresponde al comercio';
  END IF;

  SELECT n.metadata INTO v_metadata
  FROM public.notificaciones n
  WHERE n.id = p_notificacion_id AND n.activo = true;

  IF coalesce(v_metadata->>'venta_id', '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(v_metadata->>'comercio_emisor_id', '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN
    RETURN NULL;
  END IF;

  v_venta_id := (v_metadata->>'venta_id')::uuid;
  v_emisor_id := (v_metadata->>'comercio_emisor_id')::uuid;

  SELECT * INTO v_venta
  FROM public.ventas v
  WHERE v.id = v_venta_id AND v.comercio_id = v_emisor_id;
  IF v_venta.id IS NULL THEN RETURN NULL; END IF;

  v_venta_json := to_jsonb(v_venta) || jsonb_build_object(
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre, 'apellido', c.apellido, 'cuit', c.cuit,
        'calle', c.calle, 'numero', c.numero, 'codigo_postal', c.codigo_postal,
        'localidad', c.localidad, 'provincia', c.provincia, 'telefono', c.telefono,
        'situacion_afip', c.situacion_afip, 'tipo_persona', c.tipo_persona
      ) FROM public.clientes c WHERE c.id = v_venta.cliente_id
    ),
    'banco', (
      SELECT jsonb_build_object('nombre_banco', b.nombre_banco, 'numero_cuenta', b.numero_cuenta)
      FROM public.bancos b WHERE b.id = v_venta.banco_id
    ),
    'tarjeta', (
      SELECT jsonb_build_object('nombre', t.nombre)
      FROM public.tarjetas_credito t WHERE t.id = v_venta.tarjeta_id
    ),
    'venta_items', coalesce((
      SELECT jsonb_agg(
        to_jsonb(vi) || jsonb_build_object(
          'producto', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
            'cod_producto', p.cod_producto, 'descripcion', p.descripcion,
            'precio_venta', p.precio_venta, 'porcentaje_iva', p.porcentaje_iva
          ) END
        ) ORDER BY vi.id
      )
      FROM public.venta_items vi
      LEFT JOIN public.productos p ON p.id = vi.producto_id
      WHERE vi.venta_id = v_venta.id
    ), '[]'::jsonb),
    'pagos_venta', coalesce((
      SELECT jsonb_agg(
        to_jsonb(pv) || jsonb_build_object(
          'banco', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('nombre_banco', b.nombre_banco) END,
          'tarjeta', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('nombre', t.nombre) END,
          'cheque', CASE WHEN ch.id IS NULL THEN NULL ELSE jsonb_build_object(
            'numero_cheque', ch.numero_cheque, 'monto', ch.monto, 'banco_emisor', ch.banco_emisor
          ) END
        ) ORDER BY pv.id
      )
      FROM public.pagos_venta pv
      LEFT JOIN public.bancos b ON b.id = pv.banco_id
      LEFT JOIN public.tarjetas_credito t ON t.id = pv.tarjeta_id
      LEFT JOIN public.cheques ch ON ch.id = pv.cheque_id
      WHERE pv.venta_id = v_venta.id
    ), '[]'::jsonb)
  );

  SELECT jsonb_build_object(
    'id', c.id, 'activo', c.activo, 'nombre_comercio', c.nombre_comercio,
    'calle', c.calle, 'numero', c.numero, 'codigo_postal', c.codigo_postal,
    'localidad', c.localidad, 'provincia', c.provincia, 'telefono', c.telefono,
    'cuit', c.cuit, 'situacion_afip', c.situacion_afip,
    'ingresos_brutos', c.ingresos_brutos, 'fecha_inicio_actividad', c.fecha_inicio_actividad,
    'logo_url', c.logo_url
  ) INTO v_comercio_json
  FROM public.comercio c WHERE c.id = v_emisor_id;

  SELECT jsonb_build_object(
    'id', a.id, 'comercio_id', a.comercio_id, 'punto_venta', a.punto_venta,
    'cuit_emisor', a.cuit_emisor, 'ambiente', a.ambiente, 'activo', a.activo
  ) INTO v_afip_json
  FROM public.afip_config a
  WHERE a.comercio_id = v_emisor_id AND a.activo = true
  ORDER BY a.created_at DESC LIMIT 1;

  SELECT CASE
    WHEN cp.parametros #>> '{impresion,formato_comprobante}' = '58mm' THEN '58mm'
    ELSE 'a4'
  END INTO v_formato
  FROM public.comercio_parametrizacion cp
  WHERE cp.comercio_id = v_emisor_id;

  RETURN jsonb_build_object(
    'venta', v_venta_json,
    'comercio', v_comercio_json,
    'afip_config', v_afip_json,
    'formato', coalesce(v_formato, 'a4')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_comprobante_notificacion(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_comprobante_notificacion(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_comprobante_notificacion(uuid, uuid) IS
  'Devuelve solo la venta original compartida con un comercio mediante una notificacion visible; omite secretos AFIP.';
