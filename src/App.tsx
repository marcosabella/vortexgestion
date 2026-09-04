import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ModuleHelp } from "@/components/ModuleHelp";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Bell, LogOut } from "lucide-react";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useNotificaciones } from "@/hooks/useNotificaciones";
import { ModuloSistema } from "@/config/parametrizacion";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Clientes from "./pages/Clientes";
import Proveedores from "./pages/Proveedores";
import Productos from "./pages/Productos";
import Ventas from "./pages/Ventas";
import Presupuestos from "./pages/Presupuestos";
import CuentaCorriente from "./pages/CuentaCorriente";
import Bancos from "./pages/Bancos";
import Tarjetas from "./pages/Tarjetas";
import Comercio from "./pages/Comercio";
import Afip from "./pages/Afip";
import Cheques from "./pages/Cheques";
import CajaDiaria from "./pages/CajaDiaria";
import NuevoCliente from "./pages/NuevoCliente";
import NuevoProveedor from "./pages/NuevoProveedor";
import NuevoProducto from "./pages/NuevoProducto";
import NuevaVenta from "./pages/NuevaVenta";
import EditarVenta from "./pages/EditarVenta";
import NuevoPresupuesto from "./pages/NuevoPresupuesto";
import EditarPresupuesto from "./pages/EditarPresupuesto";
import NuevoMovimientoCuentaCorriente from "./pages/NuevoMovimientoCuentaCorriente";
import NuevoBanco from "./pages/NuevoBanco";
import NuevaTarjeta from "./pages/NuevaTarjeta";
import NuevoCheque from "./pages/NuevoCheque";
import AdminComercios from "./pages/AdminComercios";
import AdminComercioParametrizacion from "./pages/AdminComercioParametrizacion";
import AdminNotificaciones from "./pages/AdminNotificaciones";
import AdminMigraciones from "./pages/AdminMigraciones";
import Notificaciones from "./pages/Notificaciones";
import Seguridad from "./pages/Seguridad";
import PedidosOnline from "./pages/PedidosOnline";
import MercadoPago from "./pages/MercadoPago";
import NotFound from "./pages/NotFound";
import ListadoClientes from "./pages/listados/ListadoClientes";
import ListadoProveedores from "./pages/listados/ListadoProveedores";
import ListadoProductos from "./pages/listados/ListadoProductos";
import ListadoVentas from "./pages/listados/ListadoVentas";
import ListadoCuentaCorriente from "./pages/listados/ListadoCuentaCorriente";
import ListadoCaja from "./pages/listados/ListadoCaja";
import CampoEstablecimientos from "./pages/CampoEstablecimientos";
import CampoLotes from "./pages/CampoLotes";
import CampoOrdenes from "./pages/CampoOrdenes";
import CampoOrdenDetalle from "./pages/CampoOrdenDetalle";
import CampoOperarios from "./pages/CampoOperarios";
import CampoMaquinarias from "./pages/CampoMaquinarias";
import CampoInsumos from "./pages/CampoInsumos";
import CampoParteDetalle from "./pages/CampoParteDetalle";
import CampoPartesPendientes from "./pages/CampoPartesPendientes";

const queryClient = new QueryClient();

function ParametrizedRoute({ modulo, children }: { modulo: ModuloSistema; children: JSX.Element }) {
  const { data: parametrizacion, isLoading } = useComercioParametrizacion();

  if (isLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  if (!parametrizacion.modulos[modulo]) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-2xl font-bold">Modulo no habilitado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este comercio no tiene habilitado el acceso a esta funcion.
        </p>
      </div>
    );
  }

  return children;
}

function AuthenticatedLayout() {
  const { session, isLoading, signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { noLeidas } = useNotificaciones();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Cargando sesion...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const handleSignOut = async () => {
    await signOut();
    localStorage.removeItem("selectedComercioId");
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-background flex items-center gap-3 px-4">
            <SidebarTrigger />
            <div className="min-w-0 flex-1" />
            <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <ModuleHelp />
            <Button variant="outline" size="sm" onClick={() => navigate("/notificaciones")} className="relative">
              <Bell className="h-4 w-4" />
              {noLeidas > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-xs font-medium text-destructive-foreground">
                  {noLeidas}
                </span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </header>
          <main className="flex-1 bg-background">
            <Routes>
              <Route path="/" element={<Navigate to="/caja" replace />} />
              <Route path="/clientes" element={<ParametrizedRoute modulo="clientes"><Clientes /></ParametrizedRoute>} />
              <Route path="/clientes/nuevo" element={<ParametrizedRoute modulo="clientes"><NuevoCliente /></ParametrizedRoute>} />
              <Route path="/proveedores" element={<ParametrizedRoute modulo="proveedores"><Proveedores /></ParametrizedRoute>} />
              <Route path="/proveedores/nuevo" element={<ParametrizedRoute modulo="proveedores"><NuevoProveedor /></ParametrizedRoute>} />
              <Route path="/productos" element={<ParametrizedRoute modulo="productos"><Productos /></ParametrizedRoute>} />
              <Route path="/productos/nuevo" element={<ParametrizedRoute modulo="productos"><NuevoProducto /></ParametrizedRoute>} />
              <Route path="/ventas" element={<ParametrizedRoute modulo="ventas"><Ventas /></ParametrizedRoute>} />
              <Route path="/pedidos-online" element={<ParametrizedRoute modulo="pedidos_online"><PedidosOnline /></ParametrizedRoute>} />
              <Route path="/mercado-pago" element={<ParametrizedRoute modulo="mercado_pago"><MercadoPago /></ParametrizedRoute>} />
              <Route path="/ventas/nueva" element={<ParametrizedRoute modulo="ventas"><NuevaVenta /></ParametrizedRoute>} />
              <Route path="/ventas/:ventaId/editar" element={<ParametrizedRoute modulo="ventas"><EditarVenta /></ParametrizedRoute>} />
              <Route path="/presupuestos" element={<ParametrizedRoute modulo="presupuestos"><Presupuestos /></ParametrizedRoute>} />
              <Route path="/presupuestos/nuevo" element={<ParametrizedRoute modulo="presupuestos"><NuevoPresupuesto /></ParametrizedRoute>} />
              <Route path="/presupuestos/:presupuestoId/editar" element={<ParametrizedRoute modulo="presupuestos"><EditarPresupuesto /></ParametrizedRoute>} />
              <Route path="/caja" element={<ParametrizedRoute modulo="caja"><CajaDiaria /></ParametrizedRoute>} />
              <Route path="/cuenta-corriente" element={<ParametrizedRoute modulo="cuenta_corriente"><CuentaCorriente /></ParametrizedRoute>} />
              <Route path="/cuenta-corriente/nuevo" element={<ParametrizedRoute modulo="cuenta_corriente"><NuevoMovimientoCuentaCorriente /></ParametrizedRoute>} />
              <Route path="/comercio" element={<Comercio />} />
              <Route path="/bancos" element={<ParametrizedRoute modulo="bancos"><Bancos /></ParametrizedRoute>} />
              <Route path="/bancos/nuevo" element={<ParametrizedRoute modulo="bancos"><NuevoBanco /></ParametrizedRoute>} />
              <Route path="/tarjetas" element={<ParametrizedRoute modulo="tarjetas"><Tarjetas /></ParametrizedRoute>} />
              <Route path="/tarjetas/nueva" element={<ParametrizedRoute modulo="tarjetas"><NuevaTarjeta /></ParametrizedRoute>} />
              <Route path="/afip" element={<ParametrizedRoute modulo="afip"><Afip /></ParametrizedRoute>} />
              <Route path="/seguridad" element={<ParametrizedRoute modulo="seguridad"><Seguridad /></ParametrizedRoute>} />
              <Route path="/notificaciones" element={<Notificaciones />} />
              <Route path="/admin" element={<AdminComercios />} />
              <Route path="/admin/notificaciones" element={<AdminNotificaciones />} />
              <Route path="/admin/migraciones" element={<AdminMigraciones />} />
              <Route path="/admin/comercios/:comercioId/parametrizacion" element={<AdminComercioParametrizacion />} />
              <Route path="/cheques" element={<ParametrizedRoute modulo="cheques"><Cheques /></ParametrizedRoute>} />
              <Route path="/cheques/nuevo" element={<ParametrizedRoute modulo="cheques"><NuevoCheque /></ParametrizedRoute>} />
              <Route path="/campo" element={<Navigate to="/campo/establecimientos" replace />} />
              <Route path="/campo/establecimientos" element={<ParametrizedRoute modulo="campo"><CampoEstablecimientos /></ParametrizedRoute>} />
              <Route path="/campo/establecimientos/:establecimientoId/lotes" element={<ParametrizedRoute modulo="campo"><CampoLotes /></ParametrizedRoute>} />
              <Route path="/campo/ordenes" element={<ParametrizedRoute modulo="campo"><CampoOrdenes /></ParametrizedRoute>} />
              <Route path="/campo/ordenes/:ordenId" element={<ParametrizedRoute modulo="campo"><CampoOrdenDetalle /></ParametrizedRoute>} />
              <Route path="/campo/ordenes/:ordenId/partes/:parteId" element={<ParametrizedRoute modulo="campo"><CampoParteDetalle /></ParametrizedRoute>} />
              <Route path="/campo/partes-pendientes" element={<ParametrizedRoute modulo="campo"><CampoPartesPendientes /></ParametrizedRoute>} />
              <Route path="/campo/operarios" element={<ParametrizedRoute modulo="campo"><CampoOperarios /></ParametrizedRoute>} />
              <Route path="/campo/maquinarias" element={<ParametrizedRoute modulo="campo"><CampoMaquinarias /></ParametrizedRoute>} />
              <Route path="/campo/insumos" element={<ParametrizedRoute modulo="campo"><CampoInsumos /></ParametrizedRoute>} />
              <Route path="/listados/clientes" element={<ParametrizedRoute modulo="listados"><ListadoClientes /></ParametrizedRoute>} />
              <Route path="/listados/proveedores" element={<ParametrizedRoute modulo="listados"><ListadoProveedores /></ParametrizedRoute>} />
              <Route path="/listados/productos" element={<ParametrizedRoute modulo="listados"><ListadoProductos /></ParametrizedRoute>} />
              <Route path="/listados/ventas" element={<ParametrizedRoute modulo="listados"><ListadoVentas /></ParametrizedRoute>} />
              <Route path="/listados/caja" element={<ParametrizedRoute modulo="listados"><ListadoCaja /></ParametrizedRoute>} />
              <Route path="/listados/cuenta-corriente" element={<ParametrizedRoute modulo="listados"><ListadoCuentaCorriente /></ParametrizedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/login/:comercioId" element={<Login />} />
            <Route path="/*" element={<AuthenticatedLayout />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
