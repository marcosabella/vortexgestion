-- Compra confirmada: equivalente inverso de una venta. Conserva compatibilidad con compras existentes.
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS porcentaje_descuento numeric(7,3) NOT NULL DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS monto_descuento numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS porcentaje_recargo numeric(7,3) NOT NULL DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS monto_recargo numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS total numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS modalidad_pago text NOT NULL DEFAULT 'cta_cte' CHECK (modalidad_pago IN ('contado','transferencia','tarjeta','cheque','cta_cte'));
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS factura_numero text;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS fecha_vencimiento date;
ALTER TABLE public.compra_items ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.compra_items ADD COLUMN IF NOT EXISTS total numeric(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.registrar_compra_confirmada(p_comercio_id uuid,p_proveedor_id uuid,p_fecha date,p_factura_numero text,p_fecha_vencimiento date,p_modalidad_pago text,p_porcentaje_descuento numeric,p_monto_descuento numeric,p_porcentaje_recargo numeric,p_monto_recargo numeric,p_items jsonb,p_observaciones text DEFAULT NULL)
RETURNS public.compras LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.compras; x jsonb; p public.productos; n text; base numeric:=0; final_total numeric; descuento numeric; recargo numeric;
BEGIN
 IF NOT public.user_belongs_to_comercio(p_comercio_id) OR NOT EXISTS(SELECT 1 FROM public.proveedores WHERE id=p_proveedor_id AND comercio_id=p_comercio_id) THEN RAISE EXCEPTION 'compra_no_autorizada'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 OR p_modalidad_pago NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte') THEN RAISE EXCEPTION 'compra_invalida'; END IF;
 n:='CP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 INSERT INTO public.compras(comercio_id,proveedor_id,numero,fecha,estado,factura_numero,fecha_vencimiento,modalidad_pago,observaciones) VALUES(p_comercio_id,p_proveedor_id,n,coalesce(p_fecha,current_date),'recibida',nullif(trim(p_factura_numero),''),p_fecha_vencimiento,p_modalidad_pago,nullif(trim(p_observaciones),'')) RETURNING * INTO c;
 FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO p FROM public.productos WHERE id=(x->>'producto_id')::uuid AND comercio_id=p_comercio_id; IF NOT FOUND OR coalesce((x->>'cantidad')::integer,0)<=0 OR coalesce((x->>'costo_unitario')::numeric,-1)<0 THEN RAISE EXCEPTION 'compra_item_invalido'; END IF;
  INSERT INTO public.compra_items(comercio_id,compra_id,producto_id,descripcion,cantidad_solicitada,cantidad_recibida,costo_unitario,porcentaje_iva,actualizar_costo,subtotal,total) VALUES(p_comercio_id,c.id,p.id,p.descripcion,(x->>'cantidad')::numeric,(x->>'cantidad')::numeric,(x->>'costo_unitario')::numeric,coalesce((x->>'porcentaje_iva')::numeric,p.porcentaje_iva,0),coalesce((x->>'actualizar_costo')::boolean,true),(x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric,(x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric);
  UPDATE public.productos SET stock=stock+(x->>'cantidad')::integer,precio_costo=CASE WHEN coalesce((x->>'actualizar_costo')::boolean,true) THEN (x->>'costo_unitario')::numeric ELSE precio_costo END WHERE id=p.id; base:=base+(x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric;
 END LOOP;
 descuento:=least(base,coalesce(p_monto_descuento,0)+base*coalesce(p_porcentaje_descuento,0)/100); recargo:=coalesce(p_monto_recargo,0)+base*coalesce(p_porcentaje_recargo,0)/100; final_total:=base-descuento+recargo;
 UPDATE public.compras SET subtotal=base,porcentaje_descuento=coalesce(p_porcentaje_descuento,0),monto_descuento=descuento,porcentaje_recargo=coalesce(p_porcentaje_recargo,0),monto_recargo=recargo,total=final_total WHERE id=c.id RETURNING * INTO c;
 IF p_modalidad_pago='cta_cte' THEN INSERT INTO public.cuenta_corriente_proveedores(comercio_id,proveedor_id,tipo,monto,fecha,observaciones) VALUES(p_comercio_id,p_proveedor_id,'deuda',final_total,c.fecha,'Compra '||c.numero); END IF;
 RETURN c;
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_compra_confirmada(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text) TO authenticated;
