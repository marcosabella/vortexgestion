-- La eliminacion de una notificacion no debe borrar el registro financiero de
-- Mercado Pago ni quedar bloqueada por el historial de intentos de cobro.

ALTER TABLE public.membresia_pagos_mercadopago
  DROP CONSTRAINT IF EXISTS membresia_pagos_mercadopago_notificacion_id_fkey;

ALTER TABLE public.membresia_pagos_mercadopago
  ALTER COLUMN notificacion_id DROP NOT NULL;

ALTER TABLE public.membresia_pagos_mercadopago
  ADD CONSTRAINT membresia_pagos_mercadopago_notificacion_id_fkey
  FOREIGN KEY (notificacion_id)
  REFERENCES public.notificaciones(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.membresia_pagos_mercadopago.notificacion_id IS
  'Notificacion que origino el cobro. Puede quedar nula si el administrador elimina la notificacion; el pago se conserva para auditoria.';

