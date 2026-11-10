import { Link } from 'react-router-dom';
import { useComercio } from '@/hooks/useComercio';
import { useRestauranteUsuarios } from '@/hooks/useRestauranteUsuarios';
import type { ResumenRestaurante } from '@/types/restaurante';
import { Button } from '@/components/ui/button';
import { RestaurantePin } from './RestaurantePin';

export function RestauranteUsuarios(_props: { data: ResumenRestaurante }) {
  const { comercio } = useComercio();
  const { query } = useRestauranteUsuarios(comercio?.id);
  return <div className="space-y-6">
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Usuarios y permisos</h2>
      <p className="text-sm text-muted-foreground">Las cuentas, sus roles y el acceso a Restaurante se administran en Configuración de Vortex Gestión. Allí también se asignan las funciones de mozo, cocina, barra y repartidor.</p>
      <Button asChild><Link to="/usuarios">Administrar usuarios y permisos</Link></Button>
    </section>
    {query.isPending ? <p>Cargando accesos de terminal…</p> : query.error ? <p role="alert">No se pudieron cargar los accesos de terminal.</p> : query.data && <RestaurantePin usuarios={query.data} />}
  </div>;
}