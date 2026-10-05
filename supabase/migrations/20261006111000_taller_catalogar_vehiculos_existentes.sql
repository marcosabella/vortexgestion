BEGIN;
-- Datos separados de la estructura: unifica mayúsculas, espacios y acentos
-- sin borrar vehículos ni unir nombres distintos por aproximación.
INSERT INTO public.taller_marcas(comercio_id,nombre)
SELECT DISTINCT ON(comercio_id,public.taller_clave_nombre(marca)) comercio_id,upper(regexp_replace(btrim(marca),'\s+',' ','g'))
FROM public.taller_vehiculos ORDER BY comercio_id,public.taller_clave_nombre(marca),created_at,id
ON CONFLICT(comercio_id,clave) DO NOTHING;
INSERT INTO public.taller_modelos(comercio_id,marca_id,nombre)
SELECT DISTINCT ON(v.comercio_id,m.id,public.taller_clave_nombre(v.modelo)) v.comercio_id,m.id,upper(regexp_replace(btrim(v.modelo),'\s+',' ','g'))
FROM public.taller_vehiculos v JOIN public.taller_marcas m ON m.comercio_id=v.comercio_id AND m.clave=public.taller_clave_nombre(v.marca)
ORDER BY v.comercio_id,m.id,public.taller_clave_nombre(v.modelo),v.created_at,v.id
ON CONFLICT(comercio_id,marca_id,clave) DO NOTHING;
UPDATE public.taller_vehiculos v SET marca_id=m.id,modelo_id=mo.id
FROM public.taller_marcas m,public.taller_modelos mo
WHERE m.comercio_id=v.comercio_id AND m.clave=public.taller_clave_nombre(v.marca)
AND mo.comercio_id=v.comercio_id AND mo.marca_id=m.id AND mo.clave=public.taller_clave_nombre(v.modelo);
COMMIT;
