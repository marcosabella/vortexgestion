-- El listado de maquinarias muestra el ancho de trabajo para estimar
-- superficie GPS; el permiso por columna previo no incluía este atributo.
GRANT SELECT (ancho_trabajo_m) ON TABLE public.campo_maquinarias TO authenticated;
