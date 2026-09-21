CREATE TABLE IF NOT EXISTS public.pagos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE RESTRICT,
  factura_id uuid NOT NULL REFERENCES public.compras_facturas(id) ON DELETE RESTRICT,
  tipo_pago text NOT NULL CHECK(tipo_pago IN ('contado','transferencia','tarjeta','cheque')),
  monto numeric(14,2) NOT NULL CHECK(monto>0), fecha date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pagos_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagos_compra_select ON public.pagos_compra FOR SELECT TO authenticated USING(public.user_belongs_to_comercio(comercio_id));

CREATE OR REPLACE FUNCTION public.registrar_compra_confirmada_v2(p_comercio_id uuid,p_proveedor_id uuid,p_fecha date,p_factura_numero text,p_fecha_vencimiento date,p_modalidad_pago text,p_porcentaje_descuento numeric,p_monto_descuento numeric,p_porcentaje_recargo numeric,p_monto_recargo numeric,p_items jsonb,p_observaciones text DEFAULT NULL)
RETURNS public.compras LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.compras; f public.compras_facturas; x jsonb; p public.productos; n text; comprobante text; base numeric:=0; final_total numeric; descuento numeric; recargo numeric;
BEGIN
 IF NOT public.user_belongs_to_comercio(p_comercio_id) OR NOT EXISTS(SELECT 1 FROM public.proveedores WHERE id=p_proveedor_id AND comercio_id=p_comercio_id) THEN RAISE EXCEPTION 'compra_no_autorizada'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 OR p_modalidad_pago NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte') THEN RAISE EXCEPTION 'compra_invalida'; END IF;
 n:='CP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'); comprobante:=coalesce(nullif(trim(p_factura_numero),''),n);
 INSERT INTO public.compras(comercio_id,proveedor_id,numero,fecha,estado,factura_numero,fecha_vencimiento,modalidad_pago,observaciones) VALUES(p_comercio_id,p_proveedor_id,n,coalesce(p_fecha,current_date),'recibida',comprobante,p_fecha_vencimiento,p_modalidad_pago,nullif(trim(p_observaciones),'')) RETURNING * INTO c;
 FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO p FROM public.productos WHERE id=(x->>'producto_id')::uuid AND comercio_id=p_comercio_id;
  IF NOT FOUND OR coalesce((x->>'cantidad')::integer,0)<=0 OR coalesce((x->>'costo_unitario')::numeric,-1)<0 THEN RAISE EXCEPTION 'compra_item_invalido'; END IF;
  INSERT INTO public.compra_items(comercio_id,compra_id,producto_id,descripcion,cantidad_solicitada,cantidad_recibida,costo_unitario,porcentaje_iva,actualizar_costo,subtotal,total) VALUES(p_comercio_id,c.id,p.id,p.descripcion,(x->>'cantidad')::numeric,(x->>'cantidad')::numeric,(x->>'costo_unitario')::numeric,coalesce((x->>'porcentaje_iva')::numeric,p.porcentaje_iva,0),coalesce((x->>'actualizar_costo')::boolean,true),(x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric,(x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric);
  UPDATE public.productos SET stock=stock+(x->>'cantidad')::integer,precio_costo=CASE WHEN coalesce((x->>'actualizar_costo')::boolean,true) THEN (x->>'costo_unitario')::numeric ELSE precio_costo END WHERE id=p.id;
  base:=base+(x->>'cantidad')::numeric*(x->>'costo_unitario')::numeric;
 END LOOP;
 descuento:=least(base,coalesce(p_monto_descuento,0)+base*coalesce(p_porcentaje_descuento,0)/100); recargo:=coalesce(p_monto_recargo,0)+base*coalesce(p_porcentaje_recargo,0)/100; final_total:=base-descuento+recargo;
 UPDATE public.compras SET subtotal=base,porcentaje_descuento=coalesce(p_porcentaje_descuento,0),monto_descuento=descuento,porcentaje_recargo=coalesce(p_porcentaje_recargo,0),monto_recargo=recargo,total=final_total WHERE id=c.id RETURNING * INTO c;
 INSERT INTO public.compras_facturas(comercio_id,compra_id,proveedor_id,numero_comprobante,fecha,fecha_vencimiento,total,observaciones) VALUES(p_comercio_id,c.id,p_proveedor_id,comprobante,c.fecha,p_fecha_vencimiento,final_total,'Compra '||c.numero) RETURNING * INTO f;
 INSERT INTO public.cuenta_corriente_proveedores(comercio_id,proveedor_id,factura_id,tipo,monto,fecha,observaciones) VALUES(p_comercio_id,p_proveedor_id,f.id,'deuda',final_total,c.fecha,'Compra '||c.numero);
 IF p_modalidad_pago<>'cta_cte' THEN
  INSERT INTO public.cuenta_corriente_proveedores(comercio_id,proveedor_id,factura_id,tipo,monto,fecha,medio_pago,observaciones) VALUES(p_comercio_id,p_proveedor_id,f.id,'pago',final_total,c.fecha,p_modalidad_pago,'Pago de compra '||c.numero);
  INSERT INTO public.pagos_compra(comercio_id,compra_id,factura_id,tipo_pago,monto,fecha) VALUES(p_comercio_id,c.id,f.id,p_modalidad_pago,final_total,c.fecha);
 END IF;
 RETURN c;
END; $$;
REVOKE ALL ON TABLE public.pagos_compra FROM authenticated;
GRANT SELECT ON TABLE public.pagos_compra TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_confirmada_v2(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text) TO authenticated;
