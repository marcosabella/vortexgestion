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
  Inbox,
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
  Wrench,
  Car,
  CalendarDays,
  UtensilsCrossed,
  Calculator,
  Hexagon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ModuloSistema } from "@/config/parametrizacion";
import { restauranteSecciones, restaurantePermisoVista } from "@/config/restauranteNavigation";
import { distribucionSecciones } from "@/config/distribucionNavigation";
import { transporteSecciones } from "@/config/transporteNavigation";
import { utilidadesSecciones } from "@/config/utilidadesNavigation";
import { apicolaGruposDisponibles } from "@/config/apicolaNavigation";
import { useIsAppAdmin } from "@/hooks/useAdminComercios";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useComercio } from "@/hooks/useComercio";
import { useRestauranteAcceso } from "@/hooks/useRestauranteUsuarios";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useNotificaciones } from "@/hooks/useNotificaciones";
import { useAccesoComercio } from "@/hooks/useUsuariosComercio";
import { puedeAbrirRuta } from "@/config/usuariosPermisos";

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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MenuItem = {
  title: string;
  url: string;
  icon: typeof Banknote;
  modulo?: ModuloSistema;
  grupo?: string;
};

type GroupKey =
  | "ventas"
  | "compras"
  | "inventario"
  | "tesoreria"
  | "utilidades"
  | "campo"
  | "apicola"
  | "taller"
  | "transporte"
  | "restaurante"
  | "distribucion"
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

const utilidadesItems: MenuItem[] = utilidadesSecciones.map(item => ({ title: item.title, url: `/utilidades/${item.vista}`, icon: item.icon, modulo: "utilidades" }));

const configuracionItems: MenuItem[] = [
  { title: "Usuarios y permisos", url: "/usuarios", icon: Users },
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
  { title: "Consultas de la landing", url: "/admin/consultas-landing", icon: Inbox },
  { title: "Referidos y bonificaciones", url: "/admin/referidos", icon: Users },
  { title: "Incidentes", url: "/admin/incidentes", icon: Activity },
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

const tallerItems: MenuItem[] = [
  { title: "Resumen del taller", url: "/taller", icon: Wrench },
  { title: "Vehículos", url: "/taller/vehiculos", icon: Car },
  { title: "Órdenes de trabajo", url: "/taller/ordenes", icon: ClipboardList },
  { title: "Agenda y próximos servicios", url: "/taller/agenda", icon: CalendarDays },
  { title: "Técnicos", url: "/taller/tecnicos", icon: Users },
];
const apicolaItems: MenuItem[] = apicolaGruposDisponibles.flatMap(grupo => grupo.opciones.map(item => ({ title: item.titulo, url: item.url, icon: item.icon, grupo: grupo.opciones.length > 1 ? grupo.titulo : undefined })));

const restauranteItems: MenuItem[] = restauranteSecciones.map(({ title, vista, icon }) => ({ title, url: `/restaurante/${vista}`, icon }));
const distribucionItems: MenuItem[] = distribucionSecciones.map(({ title, url, icon }) => ({ title, url, icon }));

const extintoresItems: MenuItem[] = [
  { title: "Extintores", url: "/extintores", icon: Flame },
  { title: "Órdenes de trabajo", url: "/extintores/ordenes-trabajo", icon: ClipboardList },
];

const emptyOpenGroups = (): Record<GroupKey, boolean> => ({
  ventas: false,
  compras: false,
  inventario: false,
  tesoreria: false,
  utilidades: false,
  campo: false,
  apicola: false,
  taller: false,
  transporte: false,
  distribucion: false,
  restaurante: false,
  extintores: false,
  informes: false,
  configuracion: false,
  administracion: false,
});

const appBuildDate = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Buenos_Aires",
}).format(new Date(__APP_BUILD_DATE__));

const pathMatches = (currentPath: string, path: string) =>
  currentPath === path || currentPath.startsWith(`${path}/`);

const getGroupForPath = (path: string): GroupKey | null => {
  if (pathMatches(path, "/utilidades")) return "utilidades";
  if (path.startsWith("/campo")) return "campo";
  if (pathMatches(path, "/apicola")) return "apicola";
  if (path.startsWith("/taller")) return "taller";
  if (pathMatches(path, "/transporte")) return "transporte";
  if (pathMatches(path, "/restaurante")) return "restaurante";
  if (pathMatches(path, "/distribucion")) return "distribucion";
  if (path.startsWith("/extintores")) return "extintores";
  if (path.startsWith("/listados")) return "informes";
  if (path.startsWith("/admin")) return "administracion";
  if (["/ventas", "/presupuestos", "/pedidos-online", "/clientes", "/cuenta-corriente"].some((item) => pathMatches(path, item))) return "ventas";
  if (["/compras", "/proveedores"].some((item) => pathMatches(path, item))) return "compras";
  if (pathMatches(path, "/productos")) return "inventario";
  if (["/caja", "/gastos-egresos", "/cheques"].some((item) => pathMatches(path, item))) return "tesoreria";
  if (["/usuarios", "/comercio", "/bancos", "/tarjetas", "/mercado-pago", "/tienda-online", "/whatsapp", "/afip", "/seguridad"].some((item) => pathMatches(path, item))) return "configuracion";
  return null;
};

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const currentPath = useLocation().pathname;
  const collapsed = state === "collapsed";
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>(() => {
    const initial = emptyOpenGroups();
    const activeGroup = getGroupForPath(currentPath);
    if (activeGroup) initial[activeGroup] = true;
    return initial;
  });
  const { data: isAdmin } = useIsAppAdmin();
  const { comercio, isLoading: isComercioLoading } = useComercio();
  const campoAccess = useCampoAccess(comercio?.id);
  const restauranteAccess = useRestauranteAcceso(comercio?.id);
  const usuarioAccess = useAccesoComercio();
  const soloRestaurante = restauranteAccess.data?.solo_restaurante;
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
  const enabledCampoItems = campoItems.filter((item) => (!item.adminOnly || campoAccess.isAdmin) && (item.url !== '/campo/operadores' || usuarioAccess.data?.admin));
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
  useEffect(() => {
    const section = apicolaItems.find(item => pathMatches(currentPath, item.url))?.grupo;
    if (section) setOpenSections(current => current[section] ? current : { ...current, [section]: true });
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

  const renderSubItems = (items: MenuItem[]): ReactNode => items.map((item, index) => {
    if (item.grupo) {
      if (item.grupo === items[index - 1]?.grupo) return null;
      const grupo = item.grupo;
      const children = items.filter(child => child.grupo === grupo).map(child => ({ ...child, grupo: undefined }));
      const SectionIcon = children[0].icon;
      const open = openSections[grupo] ?? isGroupActive(children);
      return <Collapsible asChild key={grupo} open={open} onOpenChange={value => setOpenSections(current => ({ ...current, [grupo]: value }))}>
        <SidebarMenuSubItem>
          <CollapsibleTrigger asChild><SidebarMenuSubButton asChild className={`w-full gap-1.5 ${isGroupActive(children) ? "bg-sidebar-accent/50" : ""}`}><button type="button" title={grupo}><SectionIcon className="h-4 w-4" /><span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">{grupo}</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} /></button></SidebarMenuSubButton></CollapsibleTrigger>
          <CollapsibleContent><SidebarMenuSub className="mx-0 ml-2 px-1">{renderSubItems(children)}</SidebarMenuSub></CollapsibleContent>
        </SidebarMenuSubItem>
      </Collapsible>;
    }
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

  const renderDropdownItems = (items: MenuItem[]): ReactNode => items.map((item, index) => {
    if (item.grupo) {
      if (item.grupo === items[index - 1]?.grupo) return null;
      const children = items.filter(child => child.grupo === item.grupo).map(child => ({ ...child, grupo: undefined }));
      return <DropdownMenuSub key={item.grupo}><DropdownMenuSubTrigger>{item.grupo}</DropdownMenuSubTrigger><DropdownMenuSubContent className="w-60">{renderDropdownItems(children)}</DropdownMenuSubContent></DropdownMenuSub>;
    }
    const badge = unreadBadge(item);
    return <DropdownMenuItem key={item.url} asChild><NavLink to={item.url} end onClick={closeMobileMenu} className={isActive(item.url) ? "bg-accent" : ""}><item.icon className="mr-2 h-4 w-4" /><span>{item.title}</span>{badge && <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">{badge}</span>}</NavLink></DropdownMenuItem>;
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
          {renderDropdownItems(items)}
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
    items = items.filter(item => puedeAbrirRuta(usuarioAccess.data, item.url));
    if (soloRestaurante) {
      if (key === "restaurante") items = items.filter(item => restauranteAccess.data?.permisos.includes(restaurantePermisoVista(item.url.split("/")[2])));
      else if (key === "configuracion") items = items.filter(item => item.url === "/seguridad");
      else return null;
    }
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
        <div className="shrink-0 border-b border-sidebar-border p-4">
          <h2
            className={`min-w-0 whitespace-normal break-words text-center font-bold leading-snug text-sidebar-foreground ${collapsed ? "hidden" : "text-lg"}`}
            title={comercioName}
          >
            {!collapsed && comercioName}
          </h2>
        </div>

        <SidebarGroup className="mt-2 pb-3">
          <SidebarGroupContent>
            <SidebarMenu>
              {!soloRestaurante && parametrizacion.inicio.habilitado && puedeAbrirRuta(usuarioAccess.data, '/inicio') && (
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
              {parametrizacion.modulos.utilidades && renderCollapsibleGroup("utilidades", "Utilidades", Calculator, utilidadesItems)}
              {parametrizacion.modulos.campo && renderCollapsibleGroup("campo", "Vortex Campo", Sprout, enabledCampoItems)}
              {parametrizacion.modulos.apicola && renderCollapsibleGroup("apicola", "Vortex Apícola", Hexagon, apicolaItems)}
              {parametrizacion.modulos.taller && renderCollapsibleGroup("taller", "Vortex Taller", Wrench, tallerItems)}
              {parametrizacion.modulos.transporte && renderCollapsibleGroup("transporte", "Vortex Transporte", Truck, transporteSecciones.map(s => ({ title: s.title, url: `/transporte/${s.vista}`, icon: s.icon })))}
              {parametrizacion.modulos.restaurante && renderCollapsibleGroup("restaurante", "Vortex Restaurante", UtensilsCrossed, restauranteItems)}
              {parametrizacion.modulos.distribucion && renderCollapsibleGroup("distribucion", "Vortex Distribución", Truck, distribucionItems)}
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
          <div className="relative">
            <img
              src="/logo.png"
              alt="VORTEX"
              className="block h-auto w-full object-contain"
            />
            <p className="absolute inset-x-0 bottom-0 bg-white px-1 py-1 text-center text-[10px] leading-tight text-black">
              Build: {appBuildDate} (AR)
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
