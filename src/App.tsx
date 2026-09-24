import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ModuleHelp } from "@/components/ModuleHelp";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Bell, Building2, CalendarClock, LogOut } from "lucide-react";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useNotificaciones } from "@/hooks/useNotificaciones";
import { useComercio } from "@/hooks/useComercio";
import type { Comercio } from "@/types/comercio";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import Extintores from "./pages/Extintores";
import OrdenesTrabajoExtintores from "./pages/OrdenesTrabajoExtintores";
import NotFound from "./pages/NotFound";
import ListadoClientes from "./pages/listados/ListadoClientes";
import ListadoProveedores from "./pages/listados/ListadoProveedores";
import ListadoProductos from "./pages/listados/ListadoProductos";
import ListadoVentas from "./pages/listados/ListadoVentas";
import ListadoCuentaCorriente from "./pages/listados/ListadoCuentaCorriente";
import ListadoCaja from "./pages/listados/ListadoCaja";
import GastosEgresos from "./pages/GastosEgresos";
import ListadoGastosEgresos from "./pages/listados/ListadoGastosEgresos";
import WhatsApp from "./pages/WhatsApp";
import TiendaOnline from "./pages/TiendaOnline";
import { DataDeletion, PrivacyPolicy } from "./pages/Privacy";
import CampoEstablecimientos from "./pages/CampoEstablecimientos";
import CampoLotes from "./pages/CampoLotes";
import CampoOrdenes from "./pages/CampoOrdenes";
import CampoOrdenDetalle from "./pages/CampoOrdenDetalle";
import CampoOperarios from "./pages/CampoOperarios";
import CampoOperadores from "./pages/CampoOperadores";
import CampoMaquinarias from "./pages/CampoMaquinarias";
import CampoInsumos from "./pages/CampoInsumos";
import CampoTarifas from "./pages/CampoTarifas";
import CampoParteDetalle from "./pages/CampoParteDetalle";
import CampoPartesPendientes from "./pages/CampoPartesPendientes";
import CampoTelemetria from "./pages/CampoTelemetria";
import CampoTelemetriaDetalle from "./pages/CampoTelemetriaDetalle";
import InicioOperativo from "./pages/InicioOperativo";
import Compras from "./pages/Compras";
import NuevaCompra from "./pages/NuevaCompra";
import EditarCompra from "./pages/EditarCompra";
import CuentaCorrienteProveedores from "./pages/CuentaCorrienteProveedores";
import CuentaCorrienteProveedorDetalle from "./pages/CuentaCorrienteProveedorDetalle";
import CuentaCorrienteClienteDetalle from "./pages/CuentaCorrienteClienteDetalle";

const queryClient = new QueryClient();

function MembershipReminder({ comercio }: { comercio: Comercio | null }) {
  const [open, setOpen] = useState(false);
  const vencimiento = comercio?.membresia_vigente_hasta || null;

  useEffect(() => {
    if (!vencimiento) { setOpen(false); return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(`${vencimiento}T00:00:00`);
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
    setOpen(daysUntilDue >= 0 && daysUntilDue <= 5);
  }, [vencimiento]);

  if (!vencimiento) return null;
  const dueDate = new Date(`${vencimiento}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
  const remainingText = daysUntilDue === 0 ? "vence hoy" : daysUntilDue === 1 ? "vence mañana" : `vence en ${daysUntilDue} días`;

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><CalendarClock className="h-6 w-6" /></div>
        <DialogTitle>Vencimiento de membresía próximo</DialogTitle>
        <DialogDescription className="pt-2 text-sm leading-6">
          La membresía de <b>{comercio?.nombre_comercio}</b> {remainingText}, el {dueDate.toLocaleDateString("es-AR")}. Comunicate con administración para registrar el pago y mantener el acceso habilitado.
        </DialogDescription>
      </DialogHeader>
      <Button type="button" onClick={() => setOpen(false)}>Entendido</Button>
    </DialogContent>
  </Dialog>;
}

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
  const { comercio, comerciosDisponibles, isLoading: comercioLoading, selectComercio } = useComercio();
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { noLeidas } = useNotificaciones();
  const { data: parametrizacion } = useComercioParametrizacion();
  const [selectingComercioId, setSelectingComercioId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const refreshComercio = () => client.invalidateQueries({ queryKey: ["comercio"] });
    const refreshOnVisible = () => { if (document.visibilityState === "visible") refreshComercio(); };
    refreshComercio();
    window.addEventListener("focus", refreshComercio);
    document.addEventListener("visibilitychange", refreshOnVisible);
    const timer = window.setInterval(refreshComercio, 15 * 60 * 1000);
    return () => { window.removeEventListener("focus", refreshComercio); document.removeEventListener("visibilitychange", refreshOnVisible); window.clearInterval(timer); };
  }, [client, session]);

  useEffect(() => {
    if (comercio) setSelectingComercioId(null);
  }, [comercio]);

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

  if (comercioLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Cargando comercios...
      </div>
    );
  }

  const seleccionRequerida = !comercio && comerciosDisponibles.length > 1;

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
            {seleccionRequerida ? <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6 text-center text-muted-foreground">Seleccioná el comercio con el que querés trabajar.</div> : <Routes>
              <Route path="/" element={<Navigate to={parametrizacion.inicio.habilitado ? "/inicio" : "/caja"} replace />} />
              <Route path="/inicio" element={parametrizacion.inicio.habilitado ? <InicioOperativo /> : <Navigate to="/caja" replace />} />
              <Route path="/clientes" element={<ParametrizedRoute modulo="clientes"><Clientes /></ParametrizedRoute>} />
              <Route path="/clientes/nuevo" element={<ParametrizedRoute modulo="clientes"><NuevoCliente /></ParametrizedRoute>} />
              <Route path="/proveedores" element={<ParametrizedRoute modulo="proveedores"><Proveedores /></ParametrizedRoute>} />
              <Route path="/proveedores/nuevo" element={<ParametrizedRoute modulo="proveedores"><NuevoProveedor /></ParametrizedRoute>} />
              <Route path="/compras" element={<ParametrizedRoute modulo="compras"><Compras /></ParametrizedRoute>} />
              <Route path="/compras/nueva" element={<ParametrizedRoute modulo="compras"><NuevaCompra /></ParametrizedRoute>} />
              <Route path="/compras/:compraId/editar" element={<ParametrizedRoute modulo="compras"><EditarCompra /></ParametrizedRoute>} />
              <Route path="/compras/cuenta-corriente" element={<ParametrizedRoute modulo="compras"><CuentaCorrienteProveedores /></ParametrizedRoute>} />
              <Route path="/compras/cuenta-corriente/:proveedorId" element={<ParametrizedRoute modulo="compras"><CuentaCorrienteProveedorDetalle /></ParametrizedRoute>} />
              <Route path="/productos" element={<ParametrizedRoute modulo="productos"><Productos /></ParametrizedRoute>} />
              <Route path="/productos/nuevo" element={<ParametrizedRoute modulo="productos"><NuevoProducto /></ParametrizedRoute>} />
              <Route path="/ventas" element={<ParametrizedRoute modulo="ventas"><Ventas /></ParametrizedRoute>} />
              <Route path="/pedidos-online" element={<ParametrizedRoute modulo="pedidos_online"><PedidosOnline /></ParametrizedRoute>} />
              <Route path="/mercado-pago" element={<ParametrizedRoute modulo="mercado_pago"><MercadoPago /></ParametrizedRoute>} />
              <Route path="/tienda-online" element={<ParametrizedRoute modulo="pedidos_online"><TiendaOnline /></ParametrizedRoute>} />
              <Route path="/extintores" element={<ParametrizedRoute modulo="extintores"><Extintores /></ParametrizedRoute>} />
              <Route path="/extintores/ordenes-trabajo" element={<ParametrizedRoute modulo="extintores"><OrdenesTrabajoExtintores /></ParametrizedRoute>} />
              <Route path="/ventas/nueva" element={<ParametrizedRoute modulo="ventas"><NuevaVenta /></ParametrizedRoute>} />
              <Route path="/ventas/:ventaId/editar" element={<ParametrizedRoute modulo="ventas"><EditarVenta /></ParametrizedRoute>} />
              <Route path="/presupuestos" element={<ParametrizedRoute modulo="presupuestos"><Presupuestos /></ParametrizedRoute>} />
              <Route path="/presupuestos/nuevo" element={<ParametrizedRoute modulo="presupuestos"><NuevoPresupuesto /></ParametrizedRoute>} />
              <Route path="/presupuestos/:presupuestoId/editar" element={<ParametrizedRoute modulo="presupuestos"><EditarPresupuesto /></ParametrizedRoute>} />
              <Route path="/caja" element={<ParametrizedRoute modulo="caja"><CajaDiaria /></ParametrizedRoute>} />
              <Route path="/gastos-egresos" element={<ParametrizedRoute modulo="gastos_egresos"><GastosEgresos /></ParametrizedRoute>} />
              <Route path="/cuenta-corriente" element={<ParametrizedRoute modulo="cuenta_corriente"><CuentaCorriente /></ParametrizedRoute>} />
              <Route path="/cuenta-corriente/:clienteId" element={<ParametrizedRoute modulo="cuenta_corriente"><CuentaCorrienteClienteDetalle /></ParametrizedRoute>} />
              <Route path="/cuenta-corriente/nuevo" element={<ParametrizedRoute modulo="cuenta_corriente"><NuevoMovimientoCuentaCorriente /></ParametrizedRoute>} />
              <Route path="/comercio" element={<Comercio />} />
              <Route path="/whatsapp" element={<ParametrizedRoute modulo="whatsapp"><WhatsApp /></ParametrizedRoute>} />
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
              <Route path="/campo/operadores" element={<ParametrizedRoute modulo="campo"><CampoOperadores /></ParametrizedRoute>} />
              <Route path="/campo/maquinarias" element={<ParametrizedRoute modulo="campo"><CampoMaquinarias /></ParametrizedRoute>} />
              <Route path="/campo/tarifas" element={<ParametrizedRoute modulo="campo"><CampoTarifas /></ParametrizedRoute>} />
              <Route path="/campo/insumos" element={<ParametrizedRoute modulo="campo"><CampoInsumos /></ParametrizedRoute>} />
              <Route path="/campo/telemetria" element={<ParametrizedRoute modulo="campo"><CampoTelemetria /></ParametrizedRoute>} />
              <Route path="/campo/telemetria/:importacionId" element={<ParametrizedRoute modulo="campo"><CampoTelemetriaDetalle /></ParametrizedRoute>} />
              <Route path="/listados/clientes" element={<ParametrizedRoute modulo="listados"><ListadoClientes /></ParametrizedRoute>} />
              <Route path="/listados/proveedores" element={<ParametrizedRoute modulo="listados"><ListadoProveedores /></ParametrizedRoute>} />
              <Route path="/listados/productos" element={<ParametrizedRoute modulo="listados"><ListadoProductos /></ParametrizedRoute>} />
              <Route path="/listados/ventas" element={<ParametrizedRoute modulo="listados"><ListadoVentas /></ParametrizedRoute>} />
              <Route path="/listados/caja" element={<ParametrizedRoute modulo="listados"><ListadoCaja /></ParametrizedRoute>} />
              <Route path="/listados/gastos-egresos" element={<ParametrizedRoute modulo="listados"><ListadoGastosEgresos /></ParametrizedRoute>} />
              <Route path="/listados/cuenta-corriente" element={<ParametrizedRoute modulo="listados"><ListadoCuentaCorriente /></ParametrizedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>}
          </main>
          <MembershipReminder comercio={comercio} />
          <Dialog open={seleccionRequerida} onOpenChange={() => undefined}>
            <DialogContent className="sm:max-w-xl [&>button]:hidden" onEscapeKeyDown={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
              <DialogHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Building2 className="h-6 w-6" /></div>
                <DialogTitle>Seleccioná un comercio</DialogTitle>
                <DialogDescription>
                  Tu usuario tiene acceso a más de un comercio. Los datos y movimientos que veas pertenecerán únicamente al comercio elegido.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                {comerciosDisponibles.map((item) => {
                  const selecting = selectingComercioId === item.id;
                  return <Button key={item.id} type="button" variant="outline" className="h-auto justify-start p-4 text-left" disabled={Boolean(selectingComercioId)} onClick={() => { setSelectingComercioId(item.id); selectComercio(item.id); }}>
                    <Building2 className="mr-3 h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0"><span className="block truncate font-semibold">{item.nombre_comercio}</span><span className="block text-xs font-normal text-muted-foreground">CUIT {item.cuit || "sin informar"}{selecting ? " · Ingresando..." : ""}</span></span>
                  </Button>;
                })}
              </div>
              <p className="text-xs text-muted-foreground">Podrás cambiar el comercio activo posteriormente desde “Mi Comercio”.</p>
            </DialogContent>
          </Dialog>
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
            <Route path="/privacidad" element={<PrivacyPolicy />} />
            <Route path="/eliminacion-de-datos" element={<DataDeletion />} />
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
