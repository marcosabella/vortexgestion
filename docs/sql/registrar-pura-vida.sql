-- Alta administrativa solicitada por el usuario. Aplicar DESPUÉS de la
-- migración de comercios externos, con autorización para datos productivos.
-- No crea clientes, usuarios, ventas, cobros ni registros en la base externa.
BEGIN;
DO $$
DECLARE emisor uuid:='037c362e-555b-4b19-b257-5fd9c3a82203'; cliente uuid:='6ccb6dec-9f06-4831-9793-61e14b7c8815'; existente public.comercios_externos;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('alta-externo:'||emisor::text||':multiespaciopuravida.netlify.app',0));
 PERFORM 1 FROM public.clientes c WHERE c.id=cliente AND c.comercio_id=emisor AND upper(btrim(concat_ws(' ',c.nombre,c.apellido)))='ALEXANDER MIGUEL CABALLIERI' FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Revisar cliente y emisor antes de registrar PURA VIDA'; END IF;
 SELECT * INTO existente FROM public.comercios_externos WHERE comercio_id=emisor AND regexp_replace(url_sistema,'/+$','')='https://multiespaciopuravida.netlify.app' FOR UPDATE;
 IF FOUND THEN
  IF existente.cliente_id<>cliente OR existente.nombre_comercio<>'PURA VIDA' OR existente.importe_mensual<>80000 THEN RAISE EXCEPTION 'PURA VIDA ya existe con otros datos. Revisar antes de modificar'; END IF;
 ELSE
  INSERT INTO public.comercios_externos(comercio_id,cliente_id,nombre_comercio,sistema,url_sistema,importe_mensual,concepto)
  VALUES(emisor,cliente,'PURA VIDA','Complejos deportivos','https://multiespaciopuravida.netlify.app/',80000,'MEMBRESÍA MENSUAL PURA VIDA');
 END IF;
END $$;
COMMIT;
