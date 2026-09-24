import {
  Activity,
  Banknote,
  Bell,
  Building2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Database,
  FileKey,
  FileText,
  Flame,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Package,
  PackagePlus,
  QrCode,
  Receipt,
  ReceiptText,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sprout,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ModuloSistema } from "@/config/parametrizacion";
import { useIsAppAdmin } from "@/hooks/useAdminComercios";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useComercio } from "@/hooks/useComercio";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useNotificaciones } from "@/hooks/useNotificaciones";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MenuItem = {
  title: string;
  url: string;
  icon: typeof Banknote;
  modulo?: ModuloSistema;
};

type GroupKey =
  | "ventas"
  | "compras"
  | "inventario"
  | "tesoreria"
  | "campo"
  | "extintores"
  | "informes"
  | "configuracion"
  | "administracion";

const ventasItems: MenuItem[] = [
  { title: "Ventas", url: "/ventas", icon: ShoppingCart, modulo: "ventas" },
  { title: "Presupuestos", url: "/presupuestos", icon: ClipboardList, modulo: "presupuestos" },
  { title: "Pedidos Online", url: "/pedidos-online", icon: ShoppingBag, modulo: "pedidos_online" },
  { title: "Clientes", url: "/clientes", icon: Users, modulo: "clientes" },
  { title: "Cta. cte. clientes", url: "/cuenta-corriente", icon: CreditCard, modulo: "cuenta_corriente" },
];

const comprasItems: MenuItem[] = [
  { title: "Compras", url: "/compras", icon: PackagePlus, modulo: "compras" },
  { title: "Proveedores", url: "/proveedores", icon: Truck, modulo: "proveedores" },
  { title: "Cta. cte. proveedores", url: "/compras/cuenta-corriente", icon: CreditCard, modulo: "compras" },
];

const inventarioItems: MenuItem[] = [
  { title: "Productos", url: "/productos", icon: Package, modulo: "productos" },
];

const tesoreriaItems: MenuItem[] = [
  { title: "Caja Diaria", url: "/caja", icon: Banknote, modulo: "caja" },
  { title: "Gastos y egresos", url: "/gastos-egresos", icon: ReceiptText, modulo: "gastos_egresos" },
  { title: "Cartera de Cheques", url: "/cheques", icon: Receipt, modulo: "cheques" },
];

const configuracionItems: MenuItem[] = [
  { title: "Mi Comercio", url: "/comercio", icon: Store },
  { title: "Bancos", url: "/bancos", icon: Building2, modulo: "bancos" },
  { title: "Tarjetas", url: "/tarjetas", icon: CreditCard, modulo: "tarjetas" },
  { title: "Mercado Pago", url: "/mercado-pago", icon: QrCode, modulo: "mercado_pago" },
  { title: "Tienda online", url: "/tienda-online", icon: ShoppingBag, modulo: "pedidos_online" },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle, modulo: "whatsapp" },
  { title: "ARCA", url: "/afip", icon: FileKey, modulo: "afip" },
  { title: "Seguridad", url: "/seguridad", icon: KeyRound, modulo: "seguridad" },
];

const listadosItems: MenuItem[] = [
  { title: "Clientes", url: "/listados/clientes", icon: Users },
  { title: "Proveedores", url: "/listados/proveedores", icon: Truck },
  { title: "Productos", url: "/listados/productos", icon: Package },
  { title: "Ventas", url: "/listados/ventas", icon: ShoppingCart },
  { title: "Caja", url: "/listados/caja", icon: Banknote },
  { title: "Gastos y egresos", url: "/listados/gastos-egresos", icon: ReceiptText },
  { title: "Cuenta Corriente", url: "/listados/cuenta-corriente", icon: CreditCard },
];

const adminItems: MenuItem[] = [
  { title: "Comercios", url: "/admin", icon: Shield },
  { title: "Notificaciones administrativas", url: "/admin/notificaciones", icon: Bell },
  { title: "Migraciones", url: "/admin/migraciones", icon: Database },
];

const campoItems: Array<MenuItem & { adminOnly?: boolean }> = [
  { title: "Tarifas comerciales", url: "/campo/tarifas", icon: Banknote },
  { title: "Establecimientos", url: "/campo/establecimientos", icon: Sprout },
  { title: "Órdenes de trabajo", url: "/campo/ordenes", icon: ClipboardList },
  { title: "Partes pendientes", url: "/campo/partes-pendientes", icon: FileText, adminOnly: true },
  { title: "Operarios", url: "/campo/operarios", icon: Users },
  { title: "Usuarios y operadores", url: "/campo/operadores", icon: Shield, adminOnly: true },
  { title: "Maquinarias", url: "/campo/maquinarias", icon: Truck },
  { title: "Insumos", url: "/campo/insumos", icon: Package },
  { title: "Telemetría", url: "/campo/telemetria", icon: Activity, adminOnly: true },
];

const extintoresItems: MenuItem[] = [
  { title: "Extintores", url: "/extintores", icon: Flame },
  { title: "Órdenes de trabajo", url: "/extintores/ordenes-trabajo", icon: ClipboardList },
];

const emptyOpenGroups = (): Record<GroupKey, boolean> => ({
  ventas: false,
  compras: false,
  inventario: false,
  tesoreria: false,
  campo: false,
  extintores: false,
  informes: false,
  configuracion: false,
  administracion: false,
});

const pathMatches = (currentPath: string, path: string) =>
  currentPath === path || currentPath.startsWith(`${path}/`);

const getGroupForPath = (path: string): GroupKey | null => {
  if (path.startsWith("/campo")) return "campo";
  if (path.startsWith("/extintores")) return "extintores";
  if (path.startsWith("/listados")) return "informes";
  if (path.startsWith("/admin")) return "administracion";
  if (["/ventas", "/presupuestos", "/pedidos-online", "/clientes", "/cuenta-corriente"].some((item) => pathMatches(path, item))) return "ventas";
  if (["/compras", "/proveedores"].some((item) => pathMatches(path, item))) return "compras";
  if (pathMatches(path, "/productos")) return "inventario";
  if (["/caja", "/gastos-egresos", "/cheques"].some((item) => pathMatches(path, item))) return "tesoreria";
  if (["/comercio", "/bancos", "/tarjetas", "/mercado-pago", "/tienda-online", "/whatsapp", "/afip", "/seguridad"].some((item) => pathMatches(path, item))) return "configuracion";
  return null;
};

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const currentPath = useLocation().pathname;
  const collapsed = state === "collapsed";
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>(() => {
    const initial = emptyOpenGroups();
    const activeGroup = getGroupForPath(currentPath);
    if (activeGroup) initial[activeGroup] = true;
    return initial;
  });
  const { data: isAdmin } = useIsAppAdmin();
  const { comercio, isLoading: isComercioLoading } = useComercio();
  const campoAccess = useCampoAccess(comercio?.id);
  const { data: parametrizacion } = useComercioParametrizacion();
  const { notificaciones } = useNotificaciones(true);

  const comercioName = comercio?.nombre_comercio ||
    (isComercioLoading ? "Cargando..." : "Comercio");
  const isModuloEnabled = (modulo?: ModuloSistema) =>
    !modulo || parametrizacion.modulos[modulo];
  const enabledVentasItems = ventasItems.filter((item) => isModuloEnabled(item.modulo));
  const enabledComprasItems = comprasItems.filter((item) => isModuloEnabled(item.modulo));
  const enabledInventarioItems = inventarioItems.filter((item) => isModuloEnabled(item.modulo));
  const enabledTesoreriaItems = tesoreriaItems.filter((item) => isModuloEnabled(item.modulo));
  const enabledConfiguracionItems = configuracionItems.filter((item) => isModuloEnabled(item.modulo));
  const enabledCampoItems = campoItems.filter((item) => !item.adminOnly || campoAccess.isAdmin);
  const pedidosSinVer = notificaciones.filter((notificacion) => {
    const metadata = notificacion.metadata;
    return !notificacion.leida && typeof metadata === "object" &&
      metadata !== null && !Array.isArray(metadata) &&
      metadata.tipo === "pedido_online";
  }).length;

  useEffect(() => {
    const activeGroup = getGroupForPath(currentPath);
    if (!activeGroup) return;
    setOpenGroups((current) => current[activeGroup]
      ? current
      : { ...current, [activeGroup]: true });
  }, [currentPath]);

  const isActive = (path: string) => currentPath === path;
  const closeMobileMenu = () => {
    if (isMobile) setOpenMobile(false);
  };
  const setGroupOpen = (key: GroupKey, open: boolean) => {
    setOpenGroups((current) => ({ ...current, [key]: open }));
  };
  const isGroupActive = (items: MenuItem[]) =>
    items.some((item) => pathMatches(currentPath, item.url));

  const unreadBadge = (item: MenuItem) => item.url === "/pedidos-online" && pedidosSinVer > 0
    ? pedidosSinVer > 99 ? "99+" : String(pedidosSinVer)
    : null;

  const renderSubItems = (items: MenuItem[]) => items.map((item) => {
    const badge = unreadBadge(item);
    return (
      <SidebarMenuSubItem key={item.url}>
        <SidebarMenuSubButton asChild className={isActive(item.url) ? "bg-sidebar-accent/50" : ""}>
          <NavLink to={item.url} end onClick={closeMobileMenu}>
            <item.icon className="h-4 w-4" />
            <span className="ml-2">{item.title}</span>
            {badge && <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">{badge}</span>}
          </NavLink>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  });

  const renderCollapsedGroup = (
    label: string,
    icon: typeof Banknote,
    items: MenuItem[],
  ) => {
    const GroupIcon = icon;
    const active = isGroupActive(items);
    return (
      <DropdownMenu>
        <SidebarMenuItem>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              aria-label={label}
              className={`mx-2 ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
            >
              <GroupIcon className="h-4 w-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
        </SidebarMenuItem>
        <DropdownMenuContent side="right" align="start" className="w-64">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {items.map((item) => {
            const badge = unreadBadge(item);
            return (
              <DropdownMenuItem key={item.url} asChild>
                <NavLink
                  to={item.url}
                  end
                  onClick={closeMobileMenu}
                  className={isActive(item.url) ? "bg-accent" : ""}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.title}</span>
                  {badge && <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">{badge}</span>}
                </NavLink>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderCollapsibleGroup = (
    key: GroupKey,
    label: string,
    icon: typeof Banknote,
    items: MenuItem[],
  ) => {
    if (items.length === 0) return null;
    if (collapsed) return renderCollapsedGroup(label, icon, items);

    const GroupIcon = icon;
    const active = isGroupActive(items);
    return (
      <Collapsible asChild open={openGroups[key]} onOpenChange={(open) => setGroupOpen(key, open)}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className={`mx-2 ${active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <GroupIcon className="h-4 w-4" />
              <span className="ml-3">{label}</span>
              <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${openGroups[key] ? "rotate-180" : ""}`} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>{renderSubItems(items)}</SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-sidebar">
        <div className="border-b border-sidebar-border p-4">
          <h2
            className={`truncate font-bold text-sidebar-foreground ${collapsed ? "hidden" : "text-lg"}`}
            title={comercioName}
          >
            {!collapsed && comercioName}
          </h2>
        </div>

        <SidebarGroup className="mt-2 pb-3">
          <SidebarGroupContent>
            <SidebarMenu>
              {parametrizacion.inicio.habilitado && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={`mx-2 ${isActive("/inicio")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <NavLink to="/inicio" end onClick={closeMobileMenu} aria-label="Inicio">
                      <LayoutDashboard className="h-4 w-4" />
                      {!collapsed && <span className="ml-3">Inicio</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {renderCollapsibleGroup("ventas", "Ventas", ShoppingCart, enabledVentasItems)}
              {renderCollapsibleGroup("compras", "Compras", PackagePlus, enabledComprasItems)}
              {renderCollapsibleGroup("inventario", "Inventario", Package, enabledInventarioItems)}
              {renderCollapsibleGroup("tesoreria", "Tesorería", Banknote, enabledTesoreriaItems)}
              {parametrizacion.modulos.campo && renderCollapsibleGroup("campo", "Vortex Campo", Sprout, enabledCampoItems)}
              {parametrizacion.modulos.extintores && renderCollapsibleGroup("extintores", "Extintores", Flame, extintoresItems)}
              {parametrizacion.modulos.listados && renderCollapsibleGroup("informes", "Informes", FileText, listadosItems)}
              {renderCollapsibleGroup("configuracion", "Configuración", Settings, enabledConfiguracionItems)}
              {isAdmin && renderCollapsibleGroup("administracion", "Administración", Shield, adminItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="shrink-0 border-t border-sidebar-border bg-sidebar p-0">
        {!collapsed && (
          <img
            src="/logo.png"
            alt="VORTEX"
            className="block h-auto w-full object-cover"
          />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
