BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'venta', (SELECT jsonb_build_object('id',v.id,'comercio_id',v.comercio_id,
      'numero',v.numero_comprobante,'total',v.total,'cae',v.cae,'cliente_id',v.cliente_id,
      'cliente_nombre',v.cliente_nombre,'tipo',v.tipo_comprobante)
    FROM public.ventas v WHERE v.id='e9fb04ae-0b81-4c43-a874-24a614fe3046'),
  'movimientos', (SELECT jsonb_agg(jsonb_build_object('id',cc.id,'cliente_id',cc.cliente_id,
      'comercio_id',cc.comercio_id,'tipo',cc.tipo_movimiento,'concepto',cc.concepto,
      'monto',cc.monto,'cheque_id',cc.cheque_id)) FROM public.cuenta_corriente cc
    WHERE cc.venta_id='e9fb04ae-0b81-4c43-a874-24a614fe3046'),
  'licencia', (SELECT jsonb_build_object('id',id,'cliente_id',cliente_id)
    FROM public.licencias_comercios WHERE comercio_id='037c362e-555b-4b19-b257-5fd9c3a82203'
    AND destinatario_comercio_id='ba927680-6870-4eca-a795-f5b72d51e7d9'),
  'pagos_venta', (SELECT jsonb_agg(jsonb_build_object('tipo',tipo_pago,'monto',monto,'comercio_id',comercio_id))
    FROM public.pagos_venta WHERE venta_id='e9fb04ae-0b81-4c43-a874-24a614fe3046'),
  'clientes', (SELECT jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre,'apellido',c.apellido,
      'cuit',c.cuit,'debito',coalesce(s.debito,0),'credito',coalesce(s.credito,0),
      'saldo',coalesce(s.debito,0)-coalesce(s.credito,0)))
    FROM public.clientes c LEFT JOIN LATERAL (
      SELECT sum(monto) FILTER(WHERE tipo_movimiento='debito') AS debito,
        sum(monto) FILTER(WHERE tipo_movimiento='credito') AS credito
      FROM public.cuenta_corriente cc WHERE cc.cliente_id=c.id AND cc.comercio_id=c.comercio_id
    ) s ON true
    WHERE c.comercio_id='037c362e-555b-4b19-b257-5fd9c3a82203'
      AND (c.id='37cae314-f5e7-43fd-ac02-5f887a25a2c3' OR upper(c.nombre) LIKE '%BERRA%' OR upper(c.apellido) LIKE '%BERRA%')),
  'funcion_md5', (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.generar_comprobante_licencia(uuid,uuid,date,public.tipo_comprobante,numeric,date,uuid)'::regprocedure),
  'correccion_activa', (SELECT position('cuit_identificable' in prosrc)>0 FROM pg_proc WHERE oid='public.generar_comprobante_licencia(uuid,uuid,date,public.tipo_comprobante,numeric,date,uuid)'::regprocedure),
  'migracion_registrada', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261031100000'),
  'triggers', (SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger
    WHERE tgrelid IN ('public.ventas'::regclass,'public.cuenta_corriente'::regclass) AND NOT tgisinternal)
) AS verificacion;
ROLLBACK;
