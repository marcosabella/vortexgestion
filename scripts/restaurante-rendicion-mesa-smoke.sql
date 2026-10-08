BEGIN READ ONLY;
DO $$
DECLARE miembro record; resumen jsonb; cantidad integer;
BEGIN
 SELECT cu.comercio_id,cu.user_id INTO miembro FROM public.comercio_usuarios cu
 WHERE cu.rol='admin' AND cu.activo AND EXISTS(SELECT 1 FROM public.restaurante_pedidos p JOIN public.restaurante_permisos rp ON rp.comercio_id=p.comercio_id AND rp.usuario_id=p.creado_por
 WHERE p.comercio_id=cu.comercio_id AND p.numero=6 AND 'mozo'=ANY(rp.roles)) LIMIT 1;
 IF miembro.comercio_id IS NULL THEN RAISE EXCEPTION 'No se encontró la mesa informada'; END IF;
 PERFORM set_config('request.jwt.claim.sub',miembro.user_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',miembro.user_id,'role','authenticated')::text,true);
 PERFORM set_config('role','authenticated',true);
 resumen:=public.restaurante_resumen(miembro.comercio_id);
 SELECT count(*) INTO cantidad FROM jsonb_array_elements(resumen->'cobros') c
 JOIN jsonb_array_elements(resumen->'pedidos') p ON p->>'id'=c->>'pedido_id'
 JOIN jsonb_array_elements(resumen->'usuarios') u ON u->>'id'=c->>'responsable_id'
 WHERE p->>'numero'='6' AND p->>'cuenta'='cerrada' AND c->>'medio'='contado'
 AND c->>'usuario_id'<>c->>'responsable_id' AND u->>'nombre'='Mozo';
 IF cantidad=0 THEN RAISE EXCEPTION 'La mesa 6 no expone su mozo responsable para rendición'; END IF;
END $$;
ROLLBACK;
SELECT 'OK: la mesa 6 cerrada conserva la autoría del cobro y rinde con Mozo; sin modificar datos' AS verificacion;
