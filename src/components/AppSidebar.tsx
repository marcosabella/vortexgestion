import {
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
  Package,
  QrCode,
  Receipt,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Fragment, useState } from "react";
import { useIsAppAdmin } from "@/hooks/useAdminComercios";
import { useComercio } from "@/hooks/useComercio";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useNotificaciones } from "@/hooks/useNotificaciones";
import { ModuloSistema } from "@/config/parametrizacion";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
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

const menuItems: Array<
  { title: string; url: string; icon: typeof Banknote; modulo?: ModuloSistema }
> = [
  { title: "Caja Diaria", url: "/caja", icon: Banknote, modulo: "caja" },
  { title: "Clientes", url: "/clientes", icon: Users, modulo: "clientes" },
  {
    title: "Proveedores",
    url: "/proveedores",
    icon: Truck,
    modulo: "proveedores",
  },
  { title: "Productos", url: "/productos", icon: Package, modulo: "productos" },
  { title: "Ventas", url: "/ventas", icon: ShoppingCart, modulo: "ventas" },
  {
    title: "Pedidos Online",
    url: "/pedidos-online",
    icon: ShoppingBag,
    modulo: "pedidos_online",
  },
  {
    title: "Presupuestos",
    url: "/presupuestos",
    icon: ClipboardList,
    modulo: "presupuestos",
  },
  {
    title: "Cuenta Corriente",
    url: "/cuenta-corriente",
    icon: CreditCard,
    modulo: "cuenta_corriente",
  },
  {
    title: "Cartera de Cheques",
    url: "/cheques",
    icon: Receipt,
    modulo: "cheques",
  },
  { title: "Notificaciones", url: "/notificaciones", icon: Bell },
];

const configuracionItems: Array<
  { title: string; url: string; icon: typeof Store; modulo?: ModuloSistema }
> = [
  { title: "Mi Comercio", url: "/comercio", icon: Store },
  { title: "Bancos", url: "/bancos", icon: Building2, modulo: "bancos" },
  { title: "Tarjetas", url: "/tarjetas", icon: CreditCard, modulo: "tarjetas" },
  {
    title: "Mercado Pago",
    url: "/mercado-pago",
    icon: QrCode,
    modulo: "mercado_pago",
  },
  { title: "ARCA", url: "/afip", icon: FileKey, modulo: "afip" },
  {
    title: "Seguridad",
    url: "/seguridad",
    icon: KeyRound,
    modulo: "seguridad",
  },
];

const listadosItems = [
  { title: "Clientes", url: "/listados/clientes", icon: Users },
  { title: "Proveedores", url: "/listados/proveedores", icon: Truck },
  { title: "Productos", url: "/listados/productos", icon: Package },
  { title: "Ventas", url: "/listados/ventas", icon: ShoppingCart },
  { title: "Caja", url: "/listados/caja", icon: Banknote },
  {
    title: "Cuenta Corriente",
    url: "/listados/cuenta-corriente",
    icon: CreditCard,
  },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";
  const [configuracionOpen, setConfiguracionOpen] = useState(false);
  const [listadosOpen, setListadosOpen] = useState(false);
  const [extintoresOpen, setExtintoresOpen] = useState(
    currentPath.startsWith("/extintores"),
  );
  const { data: isAdmin } = useIsAppAdmin();
  const { comercio, isLoading: isComercioLoading } = useComercio();
  const { data: parametrizacion } = useComercioParametrizacion();
  const { notificaciones } = useNotificaciones(true);
  const comercioName = comercio?.nombre_comercio ||
    (isComercioLoading ? "Cargando..." : "Comercio");
  const isModuloEnabled = (modulo?: ModuloSistema) =>
    !modulo || parametrizacion.modulos[modulo];
  const enabledMenuItems = menuItems.filter((item) =>
    isModuloEnabled(item.modulo)
  );
  const enabledConfiguracionItems = configuracionItems.filter((item) =>
    isModuloEnabled(item.modulo)
  );
  const pedidosSinVer = notificaciones.filter((notificacion) => {
    const metadata = notificacion.metadata;
    return !notificacion.leida && typeof metadata === "object" &&
      metadata !== null && !Array.isArray(metadata) &&
      metadata.tipo === "pedido_online";
  }).length;

  const isActive = (path: string) => currentPath === path;
  const isConfiguracionActive = currentPath === "/comercio" ||
    enabledConfiguracionItems.some((item) => currentPath === item.url);
  const isListadosActive = parametrizacion.modulos.listados &&
    currentPath.startsWith("/listados");
  const isExtintoresActive = parametrizacion.modulos.extintores &&
    currentPath.startsWith("/extintores");
  const closeMobileMenu = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-sidebar">
        <div className="p-4 border-b border-sidebar-border">
          <h2
            className={`truncate font-bold text-sidebar-foreground ${
              collapsed ? "hidden" : "text-lg"
            }`}
            title={comercioName}
          >
            {!collapsed && comercioName}
          </h2>
        </div>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-sidebar-foreground/70 px-4">
            {!collapsed && "Gestión"}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {enabledMenuItems.map((item) => (
                <Fragment key={item.title}>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={`mx-2 ${
                      isActive(item.url)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <NavLink to={item.url} end onClick={closeMobileMenu}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="ml-3">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                  {item.url === "/pedidos-online" && pedidosSinVer > 0 && (
                    <SidebarMenuBadge className="bg-destructive text-destructive-foreground">
                      {pedidosSinVer > 99 ? "99+" : pedidosSinVer}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
                {item.url === "/productos" && parametrizacion.modulos.extintores && (
                  <Collapsible open={extintoresOpen} onOpenChange={setExtintoresOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild><SidebarMenuButton className={`mx-2 ${isExtintoresActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}><Flame className="h-4 w-4" />{!collapsed && <span className="ml-3">Extintores</span>}{!collapsed && <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${extintoresOpen ? "rotate-180" : ""}`} />}</SidebarMenuButton></CollapsibleTrigger>
                      {!collapsed && <CollapsibleContent><SidebarMenuSub><SidebarMenuSubItem><SidebarMenuSubButton asChild className={isActive("/extintores") ? "bg-sidebar-accent/50" : ""}><NavLink to="/extintores" end onClick={closeMobileMenu}><Flame className="h-4 w-4" /><span className="ml-2">Extintores</span></NavLink></SidebarMenuSubButton></SidebarMenuSubItem><SidebarMenuSubItem><SidebarMenuSubButton asChild className={isActive("/extintores/ordenes-trabajo") ? "bg-sidebar-accent/50" : ""}><NavLink to="/extintores/ordenes-trabajo" end onClick={closeMobileMenu}><ClipboardList className="h-4 w-4" /><span className="ml-2">Órdenes de trabajo</span></NavLink></SidebarMenuSubButton></SidebarMenuSubItem></SidebarMenuSub></CollapsibleContent>}
                    </SidebarMenuItem>
                  </Collapsible>
                )}
                </Fragment>
              ))}

              {false && parametrizacion.modulos.extintores && (
                <Collapsible
                  open={extintoresOpen}
                  onOpenChange={setExtintoresOpen}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className={`mx-2 ${
                          isExtintoresActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <Flame className="h-4 w-4" />
                        {!collapsed && <span className="ml-3">Extintores</span>}
                        {!collapsed && (
                          <ChevronDown
                            className={`ml-auto h-4 w-4 transition-transform ${
                              extintoresOpen ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    {!collapsed && (
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              className={isActive("/extintores")
                                ? "bg-sidebar-accent/50"
                                : ""}
                            >
                              <NavLink
                                to="/extintores"
                                end
                                onClick={closeMobileMenu}
                              >
                                <Flame className="h-4 w-4" />
                                <span className="ml-2">Extintores</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              className={isActive("/extintores/ordenes-trabajo")
                                ? "bg-sidebar-accent/50"
                                : ""}
                            >
                              <NavLink
                                to="/extintores/ordenes-trabajo"
                                end
                                onClick={closeMobileMenu}
                              >
                                <ClipboardList className="h-4 w-4" />
                                <span className="ml-2">Órdenes de trabajo</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    )}
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {isAdmin && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={`mx-2 ${
                        isActive("/admin")
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <NavLink to="/admin" end onClick={closeMobileMenu}>
                        <Shield className="h-4 w-4" />
                        {!collapsed && (
                          <span className="ml-3">Administrador Comercio</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={`mx-2 ${
                        isActive("/admin/notificaciones")
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <NavLink
                        to="/admin/notificaciones"
                        end
                        onClick={closeMobileMenu}
                      >
                        <Bell className="h-4 w-4" />
                        {!collapsed && (
                          <span className="ml-3">Notificaciones Admin</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className={`mx-2 ${
                        isActive("/admin/migraciones")
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <NavLink
                        to="/admin/migraciones"
                        end
                        onClick={closeMobileMenu}
                      >
                        <Database className="h-4 w-4" />
                        {!collapsed && (
                          <span className="ml-3">Migraciones</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

              {enabledConfiguracionItems.length > 0 && (
                <Collapsible
                  open={configuracionOpen}
                  onOpenChange={setConfiguracionOpen}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className={`mx-2 ${
                          isConfiguracionActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <Settings className="h-4 w-4" />
                        {!collapsed && (
                          <span className="ml-3">Configuración</span>
                        )}
                        {!collapsed && (
                          <ChevronDown
                            className={`ml-auto h-4 w-4 transition-transform ${
                              configuracionOpen ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    {!collapsed && (
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {enabledConfiguracionItems.map((item) => (
                            <SidebarMenuSubItem key={item.title}>
                              <SidebarMenuSubButton
                                asChild
                                className={isActive(item.url)
                                  ? "bg-sidebar-accent/50"
                                  : ""}
                              >
                                <NavLink
                                  to={item.url}
                                  onClick={closeMobileMenu}
                                >
                                  <item.icon className="h-4 w-4" />
                                  <span className="ml-2">{item.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    )}
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {parametrizacion.modulos.listados && (
                <Collapsible open={listadosOpen} onOpenChange={setListadosOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className={`mx-2 ${
                          isListadosActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <FileText className="h-4 w-4" />
                        {!collapsed && <span className="ml-3">Listados</span>}
                        {!collapsed && (
                          <ChevronDown
                            className={`ml-auto h-4 w-4 transition-transform ${
                              listadosOpen ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    {!collapsed && (
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {listadosItems.map((item) => (
                            <SidebarMenuSubItem key={item.title}>
                              <SidebarMenuSubButton
                                asChild
                                className={isActive(item.url)
                                  ? "bg-sidebar-accent/50"
                                  : ""}
                              >
                                <NavLink
                                  to={item.url}
                                  onClick={closeMobileMenu}
                                >
                                  <item.icon className="h-4 w-4" />
                                  <span className="ml-2">{item.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    )}
                  </SidebarMenuItem>
                </Collapsible>
              )}
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
