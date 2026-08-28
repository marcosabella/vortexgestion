DO $$
DECLARE
  v_venta_id uuid;
  v_cantidad integer;
BEGIN
  SELECT count(*), min(v.id::text)::uuid
  INTO v_cantidad, v_venta_id
  FROM public.ventas v
  JOIN public.comercio c ON c.id = v.comercio_id
  WHERE v.numero_comprobante = '0001-00000016'
    AND upper(c.nombre_comercio) = 'MARCOS SEBASTIAN ABELLA';

  IF v_cantidad <> 1 THEN
    RAISE EXCEPTION 'Se esperaba una venta y se encontraron % para 0001-00000016 de MARCOS SEBASTIAN ABELLA', v_cantidad;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ventas
    WHERE id = v_venta_id AND nullif(btrim(cae), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La venta 0001-00000016 tiene CAE y no puede eliminarse';
  END IF;

  DELETE FROM public.mercadopago_operaciones WHERE venta_id = v_venta_id;
  DELETE FROM public.ventas WHERE id = v_venta_id;
END $$;
