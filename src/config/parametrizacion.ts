export type ModuloSistema =
  | "caja"
  | "clientes"
  | "proveedores"
  | "productos"
  | "ventas"
  | "presupuestos"
  | "cuenta_corriente"
  | "cheques"
  | "bancos"
  | "tarjetas"
  | "afip"
  | "seguridad"
  | "listados";

export type FuncionSistema =
  | "venta_items_manuales"
  | "descuentos_recargos"
  | "facturacion_afip"
  | "impresion_comprobantes"
  | "impresion_etiquetas_productos"
  | "imagenes_productos"
  | "exportacion_pdf";

export type FormatoComprobante = "a4" | "58mm";

export type ComercioParametrizacion = {
  modulos: Record<ModuloSistema, boolean>;
  funciones: Record<FuncionSistema, boolean>;
  impresion: {
    formato_comprobante: FormatoComprobante;
  };
};

export const MODULOS_SISTEMA: Array<{ key: ModuloSistema; label: string; description: string }> = [
  { key: "caja", label: "Caja diaria", description: "Apertura, movimientos y cierre de caja." },
  { key: "clientes", label: "Clientes", description: "Alta, edicion y consulta de clientes." },
  { key: "proveedores", label: "Proveedores", description: "Gestion de proveedores." },
  { key: "productos", label: "Productos", description: "Catalogo, stock, marcas, rubros y subrubros." },
  { key: "ventas", label: "Ventas", description: "Registro y consulta de ventas." },
  { key: "presupuestos", label: "Presupuestos", description: "Emision de presupuestos y conversion a ventas." },
  { key: "cuenta_corriente", label: "Cuenta corriente", description: "Movimientos e informes de cuenta corriente." },
  { key: "cheques", label: "Cartera de cheques", description: "Carga y seguimiento de cheques." },
  { key: "bancos", label: "Bancos", description: "Cuentas bancarias para pagos y transferencias." },
  { key: "tarjetas", label: "Tarjetas", description: "Tarjetas y planes de cuotas." },
  { key: "afip", label: "ARCA", description: "Configuracion fiscal y certificados." },
  { key: "seguridad", label: "Seguridad", description: "Cambio de contrasena del comercio." },
  { key: "listados", label: "Listados", description: "Reportes imprimibles y exportables." },
];

export const FUNCIONES_SISTEMA: Array<{ key: FuncionSistema; label: string; description: string }> = [
  { key: "venta_items_manuales", label: "Items manuales en ventas", description: "Permite agregar conceptos sin producto asociado." },
  { key: "descuentos_recargos", label: "Descuentos y recargos", description: "Habilita ajustes por item y sobre el total de la venta." },
  { key: "facturacion_afip", label: "Facturacion ARCA", description: "Permite solicitar CAE y operar con comprobantes fiscales." },
  { key: "impresion_comprobantes", label: "Impresion de comprobantes", description: "Permite imprimir comprobantes desde ventas." },
  { key: "impresion_etiquetas_productos", label: "Impresion de etiquetas de productos", description: "Permite generar etiquetas A4 con codigo de barras desde productos." },
  { key: "imagenes_productos", label: "Imagenes de productos", description: "Permite cargar hasta cinco imagenes por producto." },
  { key: "exportacion_pdf", label: "Exportacion PDF", description: "Permite generar PDFs de comprobantes y listados." },
];

export const DEFAULT_PARAMETRIZACION: ComercioParametrizacion = {
  modulos: MODULOS_SISTEMA.reduce(
    (acc, modulo) => ({ ...acc, [modulo.key]: true }),
    {} as Record<ModuloSistema, boolean>,
  ),
  funciones: FUNCIONES_SISTEMA.reduce(
    (acc, funcion) => ({ ...acc, [funcion.key]: true }),
    {} as Record<FuncionSistema, boolean>,
  ),
  impresion: {
    formato_comprobante: "a4",
  },
};

export function normalizeParametrizacion(value?: Partial<ComercioParametrizacion> | null): ComercioParametrizacion {
  return {
    modulos: {
      ...DEFAULT_PARAMETRIZACION.modulos,
      ...(value?.modulos || {}),
    },
    funciones: {
      ...DEFAULT_PARAMETRIZACION.funciones,
      ...(value?.funciones || {}),
    },
    impresion: {
      formato_comprobante: value?.impresion?.formato_comprobante === "58mm" ? "58mm" : "a4",
    },
  };
}
