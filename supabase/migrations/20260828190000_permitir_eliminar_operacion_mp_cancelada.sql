-- Permite eliminar una venta que tuvo un intento de cobro QR no concretado.
-- Las operaciones aprobadas o todavia pendientes siguen protegidas.
DROP POLICY IF EXISTS mp_operaciones_delete_canceladas
ON public.mercadopago_operaciones;

CREATE POLICY mp_operaciones_delete_canceladas
ON public.mercadopago_operaciones
FOR DELETE
TO authenticated
USING (
  public.user_belongs_to_comercio(comercio_id)
  AND estado IN ('cancelado', 'rechazado', 'vencido', 'error')
);

GRANT DELETE ON public.mercadopago_operaciones TO authenticated;
