-- Etapa 3, bloque 1: imputación económica. No crea comprobantes, pagos ni stock.
BEGIN;
CREATE TABLE public.apicola_imputaciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 campana_id uuid NOT NULL, apiario_id uuid, fecha date NOT NULL,
 tipo text NOT NULL CHECK(tipo IN ('costo','ingreso')),
 origen text NOT NULL CHECK(origen IN ('compra','gasto','venta','estimado')),
 compra_id uuid REFERENCES public.compras(id) ON DELETE RESTRICT,
 gasto_id uuid REFERENCES public.gastos_egresos(id) ON DELETE RESTRICT,
 venta_id uuid REFERENCES public.ventas(id) ON DELETE RESTRICT,
 concepto text NOT NULL CHECK(length(btrim(concepto)) BETWEEN 3 AND 200),
 actividad text NOT NULL CHECK(actividad IN ('alimentacion','sanidad','reinas','reposicion','mano_obra','combustible','traslados','extraccion','arrendamientos','envases','fraccionado','mantenimiento','comercializacion','otros')),
 criterio text NOT NULL CHECK(length(btrim(criterio)) BETWEEN 5 AND 1000),
 importe numeric(14,2) NOT NULL CHECK(importe>0 AND importe<1000000000000),
 moneda text NOT NULL CHECK(moneda IN ('ARS','USD')),
 documento_snapshot jsonb NOT NULL DEFAULT '{}',
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')),
 motivo_anulacion text CHECK(length(motivo_anulacion) BETWEEN 5 AND 1000),
 version integer NOT NULL DEFAULT 1, creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),
 FOREIGN KEY(comercio_id,campana_id) REFERENCES public.apicola_campanas(comercio_id,id),
 FOREIGN KEY(comercio_id,apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id),
 CHECK((origen='compra' AND tipo='costo' AND compra_id IS NOT NULL AND gasto_id IS NULL AND venta_id IS NULL AND moneda='ARS')
    OR (origen='gasto' AND tipo='costo' AND gasto_id IS NOT NULL AND compra_id IS NULL AND venta_id IS NULL AND moneda='ARS')
    OR (origen='venta' AND tipo='ingreso' AND venta_id IS NOT NULL AND compra_id IS NULL AND gasto_id IS NULL)
    OR (origen='estimado' AND tipo='costo' AND compra_id IS NULL AND gasto_id IS NULL AND venta_id IS NULL))
);
CREATE INDEX apicola_imputaciones_periodo ON public.apicola_imputaciones(comercio_id,campana_id,fecha,apiario_id);
CREATE INDEX apicola_imputaciones_compra ON public.apicola_imputaciones(compra_id,estado) WHERE compra_id IS NOT NULL;
CREATE INDEX apicola_imputaciones_gasto ON public.apicola_imputaciones(gasto_id,estado) WHERE gasto_id IS NOT NULL;
CREATE INDEX apicola_imputaciones_venta ON public.apicola_imputaciones(venta_id,estado) WHERE venta_id IS NOT NULL;
ALTER TABLE public.apicola_imputaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apicola_imputaciones FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.apicola_imputaciones TO authenticated;
CREATE POLICY apicola_economia_admin ON public.apicola_imputaciones FOR SELECT TO authenticated
 USING(public.apicola_permiso(comercio_id,'admin'));
CREATE TRIGGER apicola_auditoria AFTER INSERT OR UPDATE ON public.apicola_imputaciones
 FOR EACH ROW EXECUTE FUNCTION public.apicola_auditar();
COMMIT;
