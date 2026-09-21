-- Etapa 2: comprobantes, vencimientos y pagos de proveedores.
CREATE TABLE public.compras_facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  compra_id uuid NOT NULL UNIQUE REFERENCES public.compras(id) ON DELETE RESTRICT,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  numero_comprobante text NOT NULL, fecha date NOT NULL DEFAULT current_date, fecha_vencimiento date,
  total numeric(14,2) NOT NULL CHECK (total > 0), observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comercio_id, proveedor_id, numero_comprobante)
);
CREATE TABLE public.cuenta_corriente_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  factura_id uuid REFERENCES public.compras_facturas(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK(tipo IN ('deuda','pago')), monto numeric(14,2) NOT NULL CHECK(monto>0),
  fecha date NOT NULL DEFAULT current_date, medio_pago text, observaciones text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_compras_facturas_vencimiento ON public.compras_facturas(comercio_id, fecha_vencimiento);
CREATE INDEX idx_cc_proveedores_comercio_proveedor ON public.cuenta_corriente_proveedores(comercio_id, proveedor_id);
ALTER TABLE public.compras_facturas ENABLE ROW LEVEL SECURITY; ALTER TABLE public.cuenta_corriente_proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY compras_facturas_select_por_comercio ON public.compras_facturas FOR SELECT TO authenticated USING(public.user_belongs_to_comercio(comercio_id));
CREATE POLICY cc_proveedores_select_por_comercio ON public.cuenta_corriente_proveedores FOR SELECT TO authenticated USING(public.user_belongs_to_comercio(comercio_id));

CREATE OR REPLACE FUNCTION public.registrar_factura_compra(p_compra_id uuid,p_numero text,p_fecha date,p_fecha_vencimiento date,p_total numeric,p_observaciones text DEFAULT NULL)
RETURNS public.compras_facturas LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.compras; f public.compras_facturas;
BEGIN SELECT * INTO c FROM public.compras WHERE id=p_compra_id FOR UPDATE;
 IF NOT FOUND OR NOT public.user_belongs_to_comercio(c.comercio_id) OR c.estado='cancelada' THEN RAISE EXCEPTION 'compra_no_disponible'; END IF;
 IF nullif(trim(p_numero),'') IS NULL OR p_total<=0 THEN RAISE EXCEPTION 'factura_compra_invalida'; END IF;
 INSERT INTO public.compras_facturas(comercio_id,compra_id,proveedor_id,numero_comprobante,fecha,fecha_vencimiento,total,observaciones)
 VALUES(c.comercio_id,c.id,c.proveedor_id,trim(p_numero),coalesce(p_fecha,current_date),p_fecha_vencimiento,p_total,nullif(trim(p_observaciones),'')) RETURNING * INTO f;
 INSERT INTO public.cuenta_corriente_proveedores(comercio_id,proveedor_id,factura_id,tipo,monto,fecha,observaciones) VALUES(c.comercio_id,c.proveedor_id,f.id,'deuda',f.total,f.fecha,'Factura '||f.numero_comprobante);
 RETURN f;
END; $$;
CREATE OR REPLACE FUNCTION public.registrar_pago_factura_compra(p_factura_id uuid,p_monto numeric,p_fecha date,p_medio_pago text,p_observaciones text DEFAULT NULL)
RETURNS public.cuenta_corriente_proveedores LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE f public.compras_facturas; m public.cuenta_corriente_proveedores; s numeric;
BEGIN SELECT * INTO f FROM public.compras_facturas WHERE id=p_factura_id FOR UPDATE;
 IF NOT FOUND OR NOT public.user_belongs_to_comercio(f.comercio_id) THEN RAISE EXCEPTION 'factura_compra_no_disponible'; END IF;
 SELECT coalesce(sum(CASE WHEN tipo='deuda' THEN monto ELSE -monto END),0) INTO s FROM public.cuenta_corriente_proveedores WHERE factura_id=f.id;
 IF p_monto<=0 OR p_monto>s THEN RAISE EXCEPTION 'pago_proveedor_invalido'; END IF;
 INSERT INTO public.cuenta_corriente_proveedores(comercio_id,proveedor_id,factura_id,tipo,monto,fecha,medio_pago,observaciones) VALUES(f.comercio_id,f.proveedor_id,f.id,'pago',p_monto,coalesce(p_fecha,current_date),nullif(trim(p_medio_pago),''),nullif(trim(p_observaciones),'')) RETURNING * INTO m;
 RETURN m;
END; $$;
REVOKE ALL ON TABLE public.compras_facturas,public.cuenta_corriente_proveedores FROM authenticated;
GRANT SELECT ON public.compras_facturas,public.cuenta_corriente_proveedores TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_factura_compra(uuid,text,date,date,numeric,text),public.registrar_pago_factura_compra(uuid,numeric,date,text,text) TO authenticated;
