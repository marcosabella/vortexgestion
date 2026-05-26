-- Delete orphaned pagos_venta records (ventas that don't exist anymore)
DELETE FROM public.pagos_venta
WHERE venta_id NOT IN (SELECT id FROM public.ventas);

-- Delete pagos_venta with invalid banco_id
UPDATE public.pagos_venta
SET banco_id = NULL
WHERE banco_id IS NOT NULL AND banco_id NOT IN (SELECT id FROM public.bancos);

-- Delete pagos_venta with invalid tarjeta_id
UPDATE public.pagos_venta
SET tarjeta_id = NULL
WHERE tarjeta_id IS NOT NULL AND tarjeta_id NOT IN (SELECT id FROM public.tarjetas_credito);

-- Delete pagos_venta with invalid cheque_id
UPDATE public.pagos_venta
SET cheque_id = NULL
WHERE cheque_id IS NOT NULL AND cheque_id NOT IN (SELECT id FROM public.cheques);

-- Now add foreign key constraints
ALTER TABLE public.pagos_venta 
ADD CONSTRAINT fk_pagos_venta_venta 
FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE CASCADE;

ALTER TABLE public.pagos_venta 
ADD CONSTRAINT fk_pagos_venta_banco 
FOREIGN KEY (banco_id) REFERENCES public.bancos(id) ON DELETE SET NULL;

ALTER TABLE public.pagos_venta 
ADD CONSTRAINT fk_pagos_venta_tarjeta 
FOREIGN KEY (tarjeta_id) REFERENCES public.tarjetas_credito(id) ON DELETE SET NULL;

ALTER TABLE public.pagos_venta 
ADD CONSTRAINT fk_pagos_venta_cheque 
FOREIGN KEY (cheque_id) REFERENCES public.cheques(id) ON DELETE SET NULL;