import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Clientes from "./pages/Clientes";
import Proveedores from "./pages/Proveedores";
import Productos from "./pages/Productos";
import Ventas from "./pages/Ventas";
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
import NuevoMovimientoCuentaCorriente from "./pages/NuevoMovimientoCuentaCorriente";
import NuevoBanco from "./pages/NuevoBanco";
import NuevaTarjeta from "./pages/NuevaTarjeta";
import NuevoCheque from "./pages/NuevoCheque";
import AdminComercios from "./pages/AdminComercios";
import Seguridad from "./pages/Seguridad";
import NotFound from "./pages/NotFound";
import ListadoClientes from "./pages/listados/ListadoClientes";
import ListadoProveedores from "./pages/listados/ListadoProveedores";
import ListadoProductos from "./pages/listados/ListadoProductos";
import ListadoVentas from "./pages/listados/ListadoVentas";
import ListadoCuentaCorriente from "./pages/listados/ListadoCuentaCorriente";
import ListadoCaja from "./pages/listados/ListadoCaja";

const queryClient = new QueryClient();

function AuthenticatedLayout() {
  const { session, isLoading, signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </header>
          <main className="flex-1 bg-background">
            <Routes>
              <Route path="/" element={<Navigate to="/caja" replace />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/nuevo" element={<NuevoCliente />} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/proveedores/nuevo" element={<NuevoProveedor />} />
              <Route path="/productos" element={<Productos />} />
              <Route path="/productos/nuevo" element={<NuevoProducto />} />
              <Route path="/ventas" element={<Ventas />} />
              <Route path="/ventas/nueva" element={<NuevaVenta />} />
              <Route path="/caja" element={<CajaDiaria />} />
              <Route path="/cuenta-corriente" element={<CuentaCorriente />} />
              <Route path="/cuenta-corriente/nuevo" element={<NuevoMovimientoCuentaCorriente />} />
              <Route path="/comercio" element={<Comercio />} />
              <Route path="/bancos" element={<Bancos />} />
              <Route path="/bancos/nuevo" element={<NuevoBanco />} />
              <Route path="/tarjetas" element={<Tarjetas />} />
              <Route path="/tarjetas/nueva" element={<NuevaTarjeta />} />
              <Route path="/afip" element={<Afip />} />
              <Route path="/seguridad" element={<Seguridad />} />
              <Route path="/admin" element={<AdminComercios />} />
              <Route path="/cheques" element={<Cheques />} />
              <Route path="/cheques/nuevo" element={<NuevoCheque />} />
              <Route path="/listados/clientes" element={<ListadoClientes />} />
              <Route path="/listados/proveedores" element={<ListadoProveedores />} />
              <Route path="/listados/productos" element={<ListadoProductos />} />
              <Route path="/listados/ventas" element={<ListadoVentas />} />
              <Route path="/listados/caja" element={<ListadoCaja />} />
              <Route path="/listados/cuenta-corriente" element={<ListadoCuentaCorriente />} />
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
