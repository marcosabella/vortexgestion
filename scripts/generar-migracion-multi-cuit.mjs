// Genera una version del alta vigente sin modificar el RPC legacy.
import { readFileSync, writeFileSync } from 'node:fs';
const source=readFileSync('supabase/migrations/20260908130000_venta_items_precio_iva_decimal.sql','utf8').replaceAll('\r\n','\n');
const start=source.indexOf('CREATE OR REPLACE FUNCTION public.registrar_venta_transaccional(');
const end=source.indexOf('\n$$;',start)+4;
if(start<0||end<4)throw Error('No se encontro el RPC vigente');
let sql=source.slice(start,end);
function change(a,b){if(!sql.includes(a))throw Error('Ancla ausente: '+a);sql=sql.replace(a,()=>b);}
change('public.registrar_venta_transaccional(', 'public.registrar_venta_emisor_transaccional(');
change('p_pagos jsonb, p_idempotency_key uuid, p_fecha_venta', 'p_pagos jsonb, p_idempotency_key uuid, p_emisor_fiscal_id uuid, p_fecha_venta');
change('  p_monto_recargo numeric DEFAULT 0\n)', '  p_monto_recargo numeric DEFAULT 0, p_numero_comprobante text DEFAULT NULL\n)');
change('  v_venta public.ventas;', '  v_emisor public.emisores_fiscales; v_manual bigint;\n  v_venta public.ventas;');
change('  v_idempotency_payload := jsonb_build_object(', `  SELECT * INTO v_emisor FROM public.emisores_fiscales WHERE id=p_emisor_fiscal_id AND comercio_id=p_comercio_id AND activo FOR SHARE;
  IF NOT FOUND OR v_emisor.punto_venta<>p_punto_venta OR NOT EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id AND parametros->'funciones'->>'multiples_cuit'='true') THEN RAISE EXCEPTION 'emisor_fiscal_no_disponible';END IF;
  IF p_numero_comprobante IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id AND parametros->'funciones'->>'ingreso_manual_numero_comprobante'='true') THEN RAISE EXCEPTION 'ventas_numero_manual_no_habilitado';END IF;
    IF p_numero_comprobante !~ '^[0-9]{4}-[0-9]{8}$' OR public.ventas_punto_venta_canonico(p_numero_comprobante)<>p_punto_venta THEN RAISE EXCEPTION 'ventas_numero_manual_invalido';END IF;
    v_manual:=public.ventas_numero_secuencial_canonico(p_numero_comprobante);IF v_manual IS NULL OR v_manual<1 THEN RAISE EXCEPTION 'ventas_numero_manual_invalido';END IF;
  END IF;
  v_idempotency_payload := jsonb_build_object('emisor_fiscal_id',p_emisor_fiscal_id,'numero_manual',p_numero_comprobante,`);
sql=sql.replace(/public\.ventas_numeradores\b/g, 'public.ventas_numeradores_emisores');
change('comercio_id, tipo_comprobante, punto_venta, ultimo_numero)', 'comercio_id, emisor_fiscal_id, tipo_comprobante, punto_venta, ultimo_numero)');
change('VALUES (p_comercio_id, p_tipo_comprobante, p_punto_venta, 0)', 'VALUES (p_comercio_id, p_emisor_fiscal_id, p_tipo_comprobante, p_punto_venta, 0)');
change('ON CONFLICT (comercio_id, tipo_comprobante, punto_venta)', 'ON CONFLICT (comercio_id, emisor_fiscal_id, tipo_comprobante, punto_venta)');
change('SET ultimo_numero = ultimo_numero + 1, updated_at = now()', `SET ultimo_numero = greatest(ultimo_numero,coalesce((SELECT max(public.ventas_numero_secuencial_canonico(numero_comprobante)) FROM public.ventas WHERE comercio_id=p_comercio_id AND emisor_fiscal_id=p_emisor_fiscal_id AND tipo_comprobante=p_tipo_comprobante),0))+1, updated_at = now()`);
change('WHERE comercio_id = p_comercio_id AND tipo_comprobante = p_tipo_comprobante AND punto_venta = p_punto_venta', 'WHERE comercio_id = p_comercio_id AND emisor_fiscal_id=p_emisor_fiscal_id AND tipo_comprobante = p_tipo_comprobante AND punto_venta = p_punto_venta');
change("    v_numero_texto := lpad", "    IF v_manual IS NOT NULL THEN v_numero:=v_manual;END IF;\n    v_numero_texto := lpad");
change('comercio_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante, cliente_id, cliente_nombre,', 'comercio_id, emisor_fiscal_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante, cliente_id, cliente_nombre,');
change('p_comercio_id, v_numero_texto, p_fecha_venta,', 'p_comercio_id, p_emisor_fiscal_id, v_numero_texto, p_fecha_venta,');
change('    EXCEPTION WHEN unique_violation THEN', "    EXCEPTION WHEN unique_violation THEN\n      IF v_manual IS NOT NULL THEN RAISE EXCEPTION 'ventas_numero_manual_duplicado';END IF;");
const signature='uuid,public.tipo_comprobante,integer,uuid,text,text,text,jsonb,jsonb,uuid,uuid,timestamptz,text,numeric,numeric,numeric,numeric,text';
sql=`-- Alta multi-CUIT: conserva validaciones, stock y cuenta corriente del alta normal.
BEGIN;
${sql}
REVOKE ALL ON FUNCTION public.registrar_venta_emisor_transaccional(${signature}) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_venta_emisor_transaccional(${signature}) TO authenticated;
CREATE FUNCTION public.previsualizar_numero_venta_emisor(p_comercio_id uuid,p_emisor_fiscal_id uuid,p_tipo_comprobante public.tipo_comprobante) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.emisores_fiscales; ultimo bigint;
BEGIN
 IF NOT public.user_is_comercio_admin(p_comercio_id) THEN RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public.emisores_fiscales WHERE id=p_emisor_fiscal_id AND comercio_id=p_comercio_id AND activo;
 IF NOT FOUND OR p_tipo_comprobante IS NULL OR NOT EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id AND parametros->'funciones'->>'multiples_cuit'='true') THEN RAISE EXCEPTION 'emisor_fiscal_no_disponible';END IF;
 SELECT greatest(coalesce((SELECT ultimo_numero FROM public.ventas_numeradores_emisores WHERE comercio_id=p_comercio_id AND emisor_fiscal_id=e.id AND tipo_comprobante=p_tipo_comprobante AND punto_venta=e.punto_venta),0),coalesce((SELECT max(public.ventas_numero_secuencial_canonico(numero_comprobante)) FROM public.ventas WHERE comercio_id=p_comercio_id AND emisor_fiscal_id=e.id AND tipo_comprobante=p_tipo_comprobante),0)) INTO ultimo;
 RETURN lpad(e.punto_venta::text,4,'0')||'-'||lpad((ultimo+1)::text,8,'0');
END $$;
REVOKE ALL ON FUNCTION public.previsualizar_numero_venta_emisor(uuid,uuid,public.tipo_comprobante) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_numero_venta_emisor(uuid,uuid,public.tipo_comprobante) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
`;
writeFileSync('supabase/migrations/20261014131000_emisores_fiscales_ventas.sql',sql);
console.log('Migracion multi-CUIT generada localmente; no aplicada.');
