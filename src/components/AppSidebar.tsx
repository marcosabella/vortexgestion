import { Users, Truck, Package, ShoppingCart, CreditCard, Building2, FileText, ChevronDown, Settings, Store, FileKey, Receipt, Shield, KeyRound, Banknote } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useState } from "react"
import { useIsAppAdmin } from "@/hooks/useAdminComercios"
import { useComercio } from "@/hooks/useComercio"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const menuItems = [
  { title: "Caja Diaria", url: "/caja", icon: Banknote },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Proveedores", url: "/proveedores", icon: Truck },
  { title: "Productos", url: "/productos", icon: Package },
  { title: "Ventas", url: "/ventas", icon: ShoppingCart },
  { title: "Cuenta Corriente", url: "/cuenta-corriente", icon: CreditCard },
  { title: "Cartera de Cheques", url: "/cheques", icon: Receipt },
]

const configuracionItems = [
  { title: "Mi Comercio", url: "/comercio", icon: Store },
  { title: "Bancos", url: "/bancos", icon: Building2 },
  { title: "Tarjetas", url: "/tarjetas", icon: CreditCard },
  { title: "AFIP", url: "/afip", icon: FileKey },
  { title: "Seguridad", url: "/seguridad", icon: KeyRound },
]

const listadosItems = [
  { title: "Clientes", url: "/listados/clientes", icon: Users },
  { title: "Proveedores", url: "/listados/proveedores", icon: Truck },
  { title: "Productos", url: "/listados/productos", icon: Package },
  { title: "Ventas", url: "/listados/ventas", icon: ShoppingCart },
  { title: "Caja", url: "/listados/caja", icon: Banknote },
  { title: "Cuenta Corriente", url: "/listados/cuenta-corriente", icon: CreditCard },
]

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar()
  const location = useLocation()
  const currentPath = location.pathname
  const collapsed = state === "collapsed"
  const [configuracionOpen, setConfiguracionOpen] = useState(false)
  const [listadosOpen, setListadosOpen] = useState(false)
  const { data: isAdmin } = useIsAppAdmin()
  const { comercio, isLoading: isComercioLoading } = useComercio()
  const comercioName = comercio?.nombre_comercio || (isComercioLoading ? "Cargando..." : "Comercio")

  const isActive = (path: string) => currentPath === path
  const isConfiguracionActive = currentPath === '/comercio' || currentPath === '/bancos' || currentPath === '/tarjetas' || currentPath === '/afip' || currentPath === '/seguridad'
  const isListadosActive = currentPath.startsWith('/listados')
  const closeMobileMenu = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-sidebar">
        <div className="p-4 border-b border-sidebar-border">
          <h2 className={`truncate font-bold text-sidebar-foreground ${collapsed ? 'hidden' : 'text-lg'}`} title={comercioName}>
            {!collapsed && comercioName}
          </h2>
        </div>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-sidebar-foreground/70 px-4">
            {!collapsed && "Gestión"}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className={`mx-2 ${isActive(item.url)
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    <NavLink to={item.url} end onClick={closeMobileMenu}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="ml-3">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={`mx-2 ${isActive('/admin')
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    <NavLink to="/admin" end onClick={closeMobileMenu}>
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span className="ml-3">Administrador Comercio</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <Collapsible open={configuracionOpen} onOpenChange={setConfiguracionOpen}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={`mx-2 ${isConfiguracionActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }`}
                    >
                      <Settings className="h-4 w-4" />
                      {!collapsed && <span className="ml-3">Configuración</span>}
                      {!collapsed && (
                        <ChevronDown
                          className={`ml-auto h-4 w-4 transition-transform ${configuracionOpen ? 'rotate-180' : ''}`}
                        />
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  {!collapsed && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {configuracionItems.map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton
                              asChild
                              className={isActive(item.url) ? 'bg-sidebar-accent/50' : ''}
                            >
                              <NavLink to={item.url} onClick={closeMobileMenu}>
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

              <Collapsible open={listadosOpen} onOpenChange={setListadosOpen}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={`mx-2 ${isListadosActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      {!collapsed && <span className="ml-3">Listados</span>}
                      {!collapsed && (
                        <ChevronDown
                          className={`ml-auto h-4 w-4 transition-transform ${listadosOpen ? 'rotate-180' : ''}`}
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
                              className={isActive(item.url) ? 'bg-sidebar-accent/50' : ''}
                            >
                              <NavLink to={item.url} onClick={closeMobileMenu}>
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
  )
}
