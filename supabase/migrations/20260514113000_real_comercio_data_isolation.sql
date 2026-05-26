-- Aislamiento real de datos por comercio.
-- Este script incorpora pertenencia usuario-comercio, agrega comercio_id a las
-- tablas operativas y reemplaza politicas abiertas por politicas RLS por comercio.

CREATE TABLE IF NOT EXISTS public.comercio_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol text NOT NULL DEFAULT 'admin' CHECK (rol IN ('admin', 'operador')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, user_id)
);

ALTER TABLE public.comercio_usuarios ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_comercio_usuarios_updated_at
BEFORE UPDATE ON public.comercio_usuarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.user_belongs_to_comercio(target_comercio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.comercio_usuarios cu
    WHERE cu.comercio_id = target_comercio_id
      AND cu.user_id = auth.uid()
      AND cu.activo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_comercio_admin(target_comercio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.comercio_usuarios cu
    WHERE cu.comercio_id = target_comercio_id
      AND cu.user_id = auth.uid()
      AND cu.rol = 'admin'
      AND cu.activo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_comercio_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claim_comercio_id uuid;
  membership_count integer;
  only_comercio_id uuid;
BEGIN
  BEGIN
    claim_comercio_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'comercio_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    claim_comercio_id := NULL;
  END;

  IF claim_comercio_id IS NOT NULL
     AND public.user_belongs_to_comercio(claim_comercio_id) THEN
    RETURN claim_comercio_id;
  END IF;

  SELECT count(*)
  INTO membership_count
  FROM public.comercio_usuarios
  WHERE user_id = auth.uid()
    AND activo = true;

  IF membership_count = 1 THEN
    SELECT comercio_id
    INTO only_comercio_id
    FROM public.comercio_usuarios
    WHERE user_id = auth.uid()
      AND activo = true
    ORDER BY created_at ASC
    LIMIT 1;

    RETURN only_comercio_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_comercio_id_from_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_comercio_id uuid;
BEGIN
  IF NEW.comercio_id IS NOT NULL THEN
    IF NOT public.user_belongs_to_comercio(NEW.comercio_id) THEN
      RAISE EXCEPTION 'El usuario no pertenece al comercio indicado';
    END IF;
    RETURN NEW;
  END IF;

  resolved_comercio_id := public.current_comercio_id();

  IF resolved_comercio_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver el comercio del usuario autenticado';
  END IF;

  NEW.comercio_id := resolved_comercio_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_comercio_id_from_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_comercio_id uuid;
BEGIN
  SELECT comercio_id
  INTO parent_comercio_id
  FROM public.ventas
  WHERE id = NEW.venta_id;

  IF parent_comercio_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro la venta asociada';
  END IF;

  IF NEW.comercio_id IS NOT NULL AND NEW.comercio_id <> parent_comercio_id THEN
    RAISE EXCEPTION 'El registro no pertenece al mismo comercio que la venta';
  END IF;

  NEW.comercio_id := parent_comercio_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_same_comercio_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  related_comercio_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'productos' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.proveedores WHERE id = NEW.proveedor_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El proveedor pertenece a otro comercio';
    END IF;

    SELECT comercio_id INTO related_comercio_id FROM public.marcas WHERE id = NEW.marca_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'La marca pertenece a otro comercio';
    END IF;

    SELECT comercio_id INTO related_comercio_id FROM public.rubros WHERE id = NEW.rubro_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El rubro pertenece a otro comercio';
    END IF;

    SELECT comercio_id INTO related_comercio_id FROM public.subrubros WHERE id = NEW.subrubro_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El subrubro pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'subrubros' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.rubros WHERE id = NEW.rubro_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El rubro pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'ventas' THEN
    IF NEW.cliente_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.clientes WHERE id = NEW.cliente_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cliente pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.banco_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.bancos WHERE id = NEW.banco_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El banco pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.tarjeta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.tarjetas_credito WHERE id = NEW.tarjeta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'venta_items' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.productos WHERE id = NEW.producto_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El producto pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'cuenta_corriente' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.clientes WHERE id = NEW.cliente_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El cliente pertenece a otro comercio';
    END IF;

    IF NEW.venta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.ventas WHERE id = NEW.venta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La venta pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'cheques' THEN
    IF NEW.cliente_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.clientes WHERE id = NEW.cliente_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cliente pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.venta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.ventas WHERE id = NEW.venta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La venta pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.cuenta_corriente_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.cuenta_corriente WHERE id = NEW.cuenta_corriente_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El movimiento de cuenta corriente pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'tarjeta_cuotas' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.tarjetas_credito WHERE id = NEW.tarjeta_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'pagos_venta' THEN
    IF NEW.banco_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.bancos WHERE id = NEW.banco_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El banco pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.tarjeta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.tarjetas_credito WHERE id = NEW.tarjeta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.cheque_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.cheques WHERE id = NEW.cheque_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cheque pertenece a otro comercio';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_membership_for_new_comercio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.comercio_usuarios (comercio_id, user_id, rol)
    VALUES (NEW.id, auth.uid(), 'admin')
    ON CONFLICT (comercio_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_comercio_login(target_comercio_id uuid)
RETURNS TABLE (
  id uuid,
  nombre_comercio varchar,
  localidad varchar,
  provincia varchar,
  logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.nombre_comercio, c.localidad, c.provincia, c.logo_url
  FROM public.comercio c
  WHERE c.id = target_comercio_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_comercio_login(uuid) TO anon, authenticated;

CREATE TRIGGER create_membership_after_comercio_insert
AFTER INSERT ON public.comercio
FOR EACH ROW
EXECUTE FUNCTION public.create_membership_for_new_comercio();

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.marcas ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.rubros ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.subrubros ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.venta_items ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.cuenta_corriente ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.bancos ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.tarjetas_credito ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.tarjeta_cuotas ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.afip_config ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;
ALTER TABLE public.pagos_venta ADD COLUMN IF NOT EXISTS comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE;

DO $$
DECLARE
  only_comercio_id uuid;
BEGIN
  SELECT id INTO only_comercio_id
  FROM public.comercio
  ORDER BY created_at ASC
  LIMIT 1;

  IF only_comercio_id IS NOT NULL AND (SELECT count(*) FROM public.comercio) = 1 THEN
    UPDATE public.clientes SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.proveedores SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.marcas SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.rubros SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.subrubros SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.productos SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.ventas SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.venta_items SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.cuenta_corriente SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.bancos SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.tarjetas_credito SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.tarjeta_cuotas SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.afip_config SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.cheques SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
    UPDATE public.pagos_venta SET comercio_id = only_comercio_id WHERE comercio_id IS NULL;
  END IF;
END $$;

UPDATE public.venta_items vi
SET comercio_id = v.comercio_id
FROM public.ventas v
WHERE vi.venta_id = v.id
  AND vi.comercio_id IS NULL
  AND v.comercio_id IS NOT NULL;

UPDATE public.pagos_venta pv
SET comercio_id = v.comercio_id
FROM public.ventas v
WHERE pv.venta_id = v.id
  AND pv.comercio_id IS NULL
  AND v.comercio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comercio_usuarios_user_id ON public.comercio_usuarios(user_id);
CREATE INDEX IF NOT EXISTS idx_comercio_usuarios_comercio_id ON public.comercio_usuarios(comercio_id);
CREATE INDEX IF NOT EXISTS idx_clientes_comercio_id ON public.clientes(comercio_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_comercio_id ON public.proveedores(comercio_id);
CREATE INDEX IF NOT EXISTS idx_marcas_comercio_id ON public.marcas(comercio_id);
CREATE INDEX IF NOT EXISTS idx_rubros_comercio_id ON public.rubros(comercio_id);
CREATE INDEX IF NOT EXISTS idx_subrubros_comercio_id ON public.subrubros(comercio_id);
CREATE INDEX IF NOT EXISTS idx_productos_comercio_id ON public.productos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_comercio_id ON public.ventas(comercio_id);
CREATE INDEX IF NOT EXISTS idx_venta_items_comercio_id ON public.venta_items(comercio_id);
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_comercio_id ON public.cuenta_corriente(comercio_id);
CREATE INDEX IF NOT EXISTS idx_bancos_comercio_id ON public.bancos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_tarjetas_credito_comercio_id ON public.tarjetas_credito(comercio_id);
CREATE INDEX IF NOT EXISTS idx_tarjeta_cuotas_comercio_id ON public.tarjeta_cuotas(comercio_id);
CREATE INDEX IF NOT EXISTS idx_afip_config_comercio_id ON public.afip_config(comercio_id);
CREATE INDEX IF NOT EXISTS idx_cheques_comercio_id ON public.cheques(comercio_id);
CREATE INDEX IF NOT EXISTS idx_pagos_venta_comercio_id ON public.pagos_venta(comercio_id);

ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_cod_producto_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_comercio_cod_producto
ON public.productos(comercio_id, cod_producto)
WHERE comercio_id IS NOT NULL;

DROP POLICY IF EXISTS "Usuarios pueden ver comercios asignados" ON public.comercio_usuarios;
DROP POLICY IF EXISTS "Admins pueden gestionar usuarios del comercio" ON public.comercio_usuarios;

CREATE POLICY "Usuarios pueden ver comercios asignados"
ON public.comercio_usuarios
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.user_belongs_to_comercio(comercio_id));

CREATE POLICY "Admins pueden gestionar usuarios del comercio"
ON public.comercio_usuarios
FOR ALL
TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

DROP POLICY IF EXISTS "Usuarios pueden ver datos del comercio" ON public.comercio;
DROP POLICY IF EXISTS "Usuarios pueden insertar datos del comercio" ON public.comercio;
DROP POLICY IF EXISTS "Usuarios pueden actualizar datos del comercio" ON public.comercio;
DROP POLICY IF EXISTS "Usuarios pueden eliminar datos del comercio" ON public.comercio;

CREATE POLICY "Usuarios pueden ver su comercio"
ON public.comercio
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(id));

CREATE POLICY "Usuarios autenticados pueden crear comercio"
ON public.comercio
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar su comercio"
ON public.comercio
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_comercio(id))
WITH CHECK (public.user_belongs_to_comercio(id));

CREATE POLICY "Usuarios pueden eliminar su comercio"
ON public.comercio
FOR DELETE
TO authenticated
USING (public.user_belongs_to_comercio(id));

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clientes',
    'proveedores',
    'marcas',
    'rubros',
    'subrubros',
    'productos',
    'ventas',
    'venta_items',
    'cuenta_corriente',
    'bancos',
    'tarjetas_credito',
    'tarjeta_cuotas',
    'afip_config',
    'cheques',
    'pagos_venta'
  ]
  LOOP
    FOR policy_name IN
      SELECT pol.polname
      FROM pg_policy pol
      JOIN pg_class cls ON cls.oid = pol.polrelid
      JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
      WHERE nsp.nspname = 'public'
        AND cls.relname = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id))',
      table_name || '_select_por_comercio',
      table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_comercio(comercio_id))',
      table_name || '_insert_por_comercio',
      table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id))',
      table_name || '_update_por_comercio',
      table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_belongs_to_comercio(comercio_id))',
      table_name || '_delete_por_comercio',
      table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clientes',
    'proveedores',
    'marcas',
    'rubros',
    'subrubros',
    'productos',
    'ventas',
    'cuenta_corriente',
    'bancos',
    'tarjetas_credito',
    'afip_config',
    'cheques'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'set_' || table_name || '_comercio_id', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_comercio_id_from_context()',
      'set_' || table_name || '_comercio_id',
      table_name
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS set_venta_items_comercio_id ON public.venta_items;
CREATE TRIGGER set_venta_items_comercio_id
BEFORE INSERT ON public.venta_items
FOR EACH ROW
EXECUTE FUNCTION public.set_comercio_id_from_venta();

DROP TRIGGER IF EXISTS set_pagos_venta_comercio_id ON public.pagos_venta;
CREATE TRIGGER set_pagos_venta_comercio_id
BEFORE INSERT ON public.pagos_venta
FOR EACH ROW
EXECUTE FUNCTION public.set_comercio_id_from_venta();

DROP TRIGGER IF EXISTS set_tarjeta_cuotas_comercio_id ON public.tarjeta_cuotas;
CREATE TRIGGER set_tarjeta_cuotas_comercio_id
BEFORE INSERT ON public.tarjeta_cuotas
FOR EACH ROW
EXECUTE FUNCTION public.set_comercio_id_from_context();

DROP TRIGGER IF EXISTS validate_productos_comercio_refs ON public.productos;
CREATE TRIGGER validate_productos_comercio_refs
BEFORE INSERT OR UPDATE ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();

DROP TRIGGER IF EXISTS validate_subrubros_comercio_refs ON public.subrubros;
CREATE TRIGGER validate_subrubros_comercio_refs
BEFORE INSERT OR UPDATE ON public.subrubros
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();

DROP TRIGGER IF EXISTS validate_ventas_comercio_refs ON public.ventas;
CREATE TRIGGER validate_ventas_comercio_refs
BEFORE INSERT OR UPDATE ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();

DROP TRIGGER IF EXISTS validate_venta_items_comercio_refs ON public.venta_items;
CREATE TRIGGER validate_venta_items_comercio_refs
BEFORE INSERT OR UPDATE ON public.venta_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();

DROP TRIGGER IF EXISTS validate_cuenta_corriente_comercio_refs ON public.cuenta_corriente;
CREATE TRIGGER validate_cuenta_corriente_comercio_refs
BEFORE INSERT OR UPDATE ON public.cuenta_corriente
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();

DROP TRIGGER IF EXISTS validate_cheques_comercio_refs ON public.cheques;
CREATE TRIGGER validate_cheques_comercio_refs
BEFORE INSERT OR UPDATE ON public.cheques
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();

DROP TRIGGER IF EXISTS validate_tarjeta_cuotas_comercio_refs ON public.tarjeta_cuotas;
CREATE TRIGGER validate_tarjeta_cuotas_comercio_refs
BEFORE INSERT OR UPDATE ON public.tarjeta_cuotas
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();

DROP TRIGGER IF EXISTS validate_pagos_venta_comercio_refs ON public.pagos_venta;
CREATE TRIGGER validate_pagos_venta_comercio_refs
BEFORE INSERT OR UPDATE ON public.pagos_venta
FOR EACH ROW
EXECUTE FUNCTION public.validate_same_comercio_references();
