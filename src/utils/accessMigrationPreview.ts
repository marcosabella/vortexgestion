export type AccessRow = Record<string, unknown>;

export type LegacyTableShape = { name: string; columns: string[]; rows: number };
export type LegacyCompatibility = {
  compatible: boolean;
  resolved: Record<string, string>;
  errors: string[];
  warnings: string[];
};

const normalizeIdentifier = (input: string) => input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

const LEGACY_TABLES = [
  { canonical: "Rubro", aliases: ["Rubro", "Rubros"], required: [["idRubro", "id_rubro", "id"], ["descripcion", "nombre"]] },
  { canonical: "Marca", aliases: ["Marca", "Marcas"], required: [["idMarca", "id_marca", "id"], ["descripcion", "nombre"]] },
  { canonical: "Proveedores", aliases: ["Proveedores", "Proveedor"], required: [["idProveedor", "id_proveedor", "id"], ["razon_social", "razonSocial", "nombre"]] },
  { canonical: "Articulos", aliases: ["Articulos", "Artículos", "Articulo", "Productos"], required: [["idArticulo", "id_articulo", "id"], ["descripcion", "nombre"]] },
  { canonical: "Clientes", aliases: ["Clientes", "Cliente"], required: [["IdCliente", "id_cliente", "id"], ["nombre", "razon_social", "apellido"]] },
  { canonical: "Domicilio_x_cliente", aliases: ["Domicilio_x_cliente", "Domicilios_x_cliente", "DomicilioCliente", "DomiciliosClientes"], required: [], optional: true },
  { canonical: "Localidades", aliases: ["Localidades", "Localidad"], required: [], optional: true },
  { canonical: "Provincias", aliases: ["Provincias", "Provincia"], required: [], optional: true },
  { canonical: "CondIva", aliases: ["CondIva", "CondicionIva", "CondicionesIva", "Condicion_IVA"], required: [], optional: true },
] as const;

export function inspectLegacySchema(tables: LegacyTableShape[]): LegacyCompatibility {
  const resolved: Record<string, string> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const descriptor of LEGACY_TABLES) {
    const table = tables.find((candidate) => descriptor.aliases.some((alias) => normalizeIdentifier(alias) === normalizeIdentifier(candidate.name)));
    if (!table) {
      ("optional" in descriptor && descriptor.optional ? warnings : errors).push(`No se encontró ${descriptor.canonical} (${descriptor.aliases.join(" / ")}).`);
      continue;
    }
    resolved[descriptor.canonical] = table.name;
    for (const alternatives of descriptor.required) {
      if (!alternatives.some((column) => table.columns.some((actual) => normalizeIdentifier(actual) === normalizeIdentifier(column)))) {
        errors.push(`${table.name}: falta una columna compatible con ${alternatives.join(" / ")}.`);
      }
    }
  }
  if (!resolved.Domicilio_x_cliente) warnings.push("Los clientes se importarán sin domicilio porque la tabla auxiliar no está disponible.");
  if (!resolved.CondIva) warnings.push("Se usarán condiciones fiscales predeterminadas porque no existe la tabla CondIva.");
  return { compatible: errors.length === 0, resolved, errors, warnings };
}

export type PreviewRow = {
  sourceId: string;
  data: Record<string, unknown>;
  warnings: string[];
};

export type MigrationMapping = {
  module: string;
  sourceTable: string;
  targetTable: string | null;
  dependencies: string[];
  transform?: (row: AccessRow, comercioId: string) => PreviewRow;
};

const value = (row: AccessRow, ...names: string[]) => {
  const entry = Object.entries(row).find(([key]) => names.some((name) => key.toLowerCase() === name.toLowerCase()));
  return entry?.[1] ?? null;
};
const string = (input: unknown) => input == null ? "" : String(input).trim();
const nullable = (input: unknown) => string(input) || null;
const number = (input: unknown) => {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const parsed = Number(string(input).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const sourceId = (row: AccessRow, ...keys: string[]) => string(value(row, ...keys)) || "sin-id";
const afipSituation = (input: unknown) => {
  const normalized = normalizedText(input);
  if (normalized.includes("inscripto")) return "Responsable Inscripto";
  if (normalized.includes("monotributo")) return "Responsable Monotributo";
  if (normalized.includes("consumidor")) return "Consumidor Final";
  if (normalized.includes("exento")) return "Exento";
  return "No Responsable";
};
const isoDate = (input: unknown) => {
  if (input instanceof Date) return input.toISOString();
  const raw = string(input);
  const legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (legacy) return new Date(Date.UTC(Number(legacy[3]), Number(legacy[2]) - 1, Number(legacy[1]))).toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const withRequiredWarnings = (data: Record<string, unknown>, required: string[]) =>
  required.filter((field) => data[field] === "" || data[field] == null).map((field) => `Falta ${field}`);

export const MIGRATION_MAPPINGS: MigrationMapping[] = [
  {
    module: "Rubros", sourceTable: "Rubro", targetTable: "rubros", dependencies: [],
    transform: (row, comercioId) => {
      const data = { comercio_id: comercioId, nombre: string(value(row, "descripcion", "nombre")), descripcion: nullable(value(row, "descripcion", "nombre")), source_id: sourceId(row, "idRubro", "id_rubro", "id") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["nombre"]) };
    },
  },
  {
    module: "Marcas", sourceTable: "Marca", targetTable: "marcas", dependencies: [],
    transform: (row, comercioId) => {
      const data = { comercio_id: comercioId, nombre: string(value(row, "descripcion", "nombre")), descripcion: nullable(value(row, "descripcion", "nombre")), source_id: sourceId(row, "idMarca", "id_marca", "id") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["nombre"]) };
    },
  },
  {
    module: "Proveedores", sourceTable: "Proveedores", targetTable: "proveedores", dependencies: [],
    transform: (row, comercioId) => {
      const razonSocial = string(value(row, "razon_social", "razonSocial", "nombre"));
      const data = { comercio_id: comercioId, tipo_persona: "juridica", nombre: razonSocial, apellido: null, razon_social: razonSocial || null, cuit: string(value(row, "cuit")), ingresos_brutos: nullable(value(row, "iibb", "ingresos_brutos")), situacion_afip: "No Responsable", email: null, telefono: null, calle: "", numero: "", codigo_postal: "", localidad: "", provincia: "", source_id: sourceId(row, "idProveedor", "id_proveedor", "id") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["nombre"]) };
    },
  },
  {
    module: "Productos", sourceTable: "Articulos", targetTable: "productos", dependencies: ["Rubro", "Marca", "Proveedores"],
    transform: (row, comercioId) => {
      const costo = number(value(row, "costo"));
      const utilidad = number(value(row, "utilidad"));
      const iva = number(value(row, "iva"));
      const descuento = number(value(row, "descuento"));
      const monedaOrigen = string(value(row, "moneda")).toUpperCase();
      const tipoMoneda = monedaOrigen.includes("BLUE") ? "USD_BLUE" : monedaOrigen.includes("U$D") || monedaOrigen.includes("USD") || monedaOrigen.includes("DOL") ? "USD" : "ARS";
      const data = { comercio_id: comercioId, cod_producto: string(value(row, "cod_art", "codigo", "idArticulo", "id_articulo", "id")), cod_barras: nullable(value(row, "codigo_barras", "cod_barras")), descripcion: string(value(row, "descripcion", "nombre")), proveedor_source_id: string(value(row, "idProveedor", "id_proveedor")) || null, rubro_source_id: string(value(row, "idRubro", "id_rubro")) || null, marca_source_id: string(value(row, "idMarca", "id_marca")) || null, subrubro_id: null, precio_costo: costo, porcentaje_iva: iva, porcentaje_utilidad: utilidad, porcentaje_descuento: descuento, stock: Math.trunc(number(value(row, "stock"))), tipo_moneda: tipoMoneda, observaciones: nullable(value(row, "comentario", "observaciones")), source_id: sourceId(row, "idArticulo", "id_articulo", "id") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["cod_producto", "descripcion"]) };
    },
  },
  {
    module: "Clientes", sourceTable: "Clientes", targetTable: "clientes", dependencies: [],
    transform: (row, comercioId) => {
      const apellidoOrigen = string(value(row, "apellido"));
      const nombreOrigen = string(value(row, "nombre", "razon_social"));
      // En las bases históricas el código de tipo de persona no es consistente:
      // las personas jurídicas se reconocen de forma fiable porque no almacenan apellido.
      const tipoPersona = apellidoOrigen ? "fisica" : "juridica";
      const data = { comercio_id: comercioId, tipo_persona: tipoPersona, nombre: nombreOrigen || "SIN NOMBRE", apellido: tipoPersona === "juridica" ? "" : apellidoOrigen, cuit: string(value(row, "cuit")), email: nullable(value(row, "mail", "email")), ingresos_brutos: null, situacion_afip: "Consumidor Final", telefono: null, calle: "", numero: "", codigo_postal: "", localidad: "", provincia: "", source_id: sourceId(row, "IdCliente", "id_cliente", "id") };
      const required = tipoPersona === "fisica"
        ? ["nombre", "apellido", "cuit", "calle", "numero", "codigo_postal", "localidad", "provincia"]
        : ["nombre", "cuit", "calle", "numero", "codigo_postal", "localidad", "provincia"];
      const warnings = withRequiredWarnings(data, required);
      if (!nombreOrigen) warnings.push("Nombre vacío en Access: se propone SIN NOMBRE");
      return { sourceId: data.source_id, data, warnings };
    },
  },
  {
    module: "Ventas", sourceTable: "Ventas", targetTable: "ventas", dependencies: ["Clientes"],
    transform: (row, comercioId) => {
      const total = number(value(row, "monto"));
      const date = isoDate(value(row, "fecha_venta"));
      const data = { comercio_id: comercioId, numero_comprobante: sourceId(row, "idVenta"), fecha_venta: date, cliente_source_id: string(value(row, "idCliente")) || null, tipo_pago: `[equivalencia CondicionVenta:${string(value(row, "idCondicion_venta"))}]`, tipo_comprobante: `[equivalencia Comprobantes:${string(value(row, "idComprobante"))}]`, porcentaje_descuento: number(value(row, "descuento_venta")), porcentaje_recargo: number(value(row, "recargo_venta")), subtotal: total, total_iva: 0, total, observaciones: nullable(value(row, "observaciones")), source_id: sourceId(row, "idVenta") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["fecha_venta"]) };
    },
  },
  {
    module: "Detalle de ventas", sourceTable: "Detalle_Venta", targetTable: "venta_items", dependencies: ["Ventas", "Articulos"],
    transform: (row, comercioId) => {
      const cantidad = number(value(row, "cantidad")), precio = number(value(row, "precioUnitario"));
      const data = { comercio_id: comercioId, venta_source_id: string(value(row, "idVenta")) || null, producto_source_id: string(value(row, "idArticulo")) || null, cantidad, precio_unitario: precio, porcentaje_iva: 0, porcentaje_descuento: 0, porcentaje_recargo: 0, subtotal: cantidad * precio, monto_iva: 0, monto_descuento: 0, monto_recargo: 0, total: cantidad * precio, source_id: sourceId(row, "IdDetalle_venta") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["venta_source_id", "producto_source_id"]) };
    },
  },
  {
    module: "Pagos", sourceTable: "Pagos", targetTable: "cuenta_corriente", dependencies: ["Clientes"],
    transform: (row, comercioId) => {
      const condition = string(value(row, "idCondicion_venta"));
      const data = { comercio_id: comercioId, cliente_source_id: string(value(row, "idCliente")) || null, fecha_movimiento: isoDate(value(row, "fecha_pago")), tipo_movimiento: "credito", monto: number(value(row, "importe")), concepto: `Pago historico #${sourceId(row, "idPago")}`, tipo_pago_origen: condition, observaciones: nullable(value(row, "observaciones")), source_id: sourceId(row, "idPago") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["cliente_source_id", "fecha_movimiento", "monto"]) };
    },
  },
  {
    module: "Cheques", sourceTable: "Cheques", targetTable: "cheques", dependencies: ["Banco"],
    transform: (row, comercioId) => {
      const data = { comercio_id: comercioId, numero_cheque: string(value(row, "nroCheque")), banco_source_id: string(value(row, "idBanco")) || null, monto: number(value(row, "monto")), fecha_emision: isoDate(value(row, "fecha")), fecha_vencimiento: isoDate(value(row, "vencimiento")), emisor_nombre: string(value(row, "emisor")) || "EMISOR NO INFORMADO", estado: value(row, "enCartera") === false ? "depositado" : "en_cartera", source_id: sourceId(row, "Id") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["numero_cheque", "monto", "fecha_emision", "fecha_vencimiento"]) };
    },
  },
  {
    module: "Bancos (auxiliar)", sourceTable: "Banco", targetTable: null, dependencies: [],
    transform: (row, comercioId) => {
      const data = { comercio_id: comercioId, nombre_banco: string(value(row, "nombre")), sucursal: nullable(value(row, "sucursal")), uso: "Resolver banco emisor de cheques", source_id: sourceId(row, "Id") };
      return { sourceId: data.source_id, data, warnings: withRequiredWarnings(data, ["nombre_banco"]) };
    },
  },
  { module: "Compras", sourceTable: "Compras", targetTable: null, dependencies: [] },
];

export function getMapping(tableName: string) {
  const descriptor = LEGACY_TABLES.find((item) => item.aliases.some((alias) => normalizeIdentifier(alias) === normalizeIdentifier(tableName)));
  const canonical = descriptor?.canonical || tableName;
  return MIGRATION_MAPPINGS.find((mapping) => normalizeIdentifier(mapping.sourceTable) === normalizeIdentifier(canonical));
}

export function previewRows(tableName: string, rows: AccessRow[], comercioId: string) {
  const mapping = getMapping(tableName);
  if (!mapping?.transform) return [];
  return rows.map((row) => mapping.transform!(row, comercioId));
}

const normalizedText = (input: unknown) => string(input)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("es-AR");

export function previewClientRows(
  clients: AccessRow[],
  addresses: AccessRow[],
  localities: AccessRow[],
  provinces: AccessRow[],
  comercioId: string,
  ivaConditions: AccessRow[] = [],
) {
  const mapping = getMapping("Clientes");
  if (!mapping?.transform) return [];

  const addressesByClient = new Map<string, AccessRow[]>();
  for (const address of addresses) {
    const clientId = string(value(address, "idCliente"));
    if (!clientId) continue;
    addressesByClient.set(clientId, [...(addressesByClient.get(clientId) || []), address]);
  }

  const provincesById = new Map(
    provinces.map((province) => [string(value(province, "idProvincia")), string(value(province, "Nombre"))]),
  );
  const ivaById = new Map(ivaConditions.map((item) => [string(value(item, "IdCondicion")), afipSituation(value(item, "descripcion"))]));
  const localitiesByName = new Map<string, AccessRow[]>();
  for (const locality of localities) {
    const key = normalizedText(value(locality, "Nombre"));
    if (!key) continue;
    localitiesByName.set(key, [...(localitiesByName.get(key) || []), locality]);
  }

  return clients.map((client) => {
    const result = mapping.transform!(client, comercioId);
    result.data.situacion_afip = ivaById.get(string(value(client, "idIva"))) || "Consumidor Final";
    const clientAddresses = addressesByClient.get(sourceId(client, "IdCliente")) || [];
    const primary = [...clientAddresses].sort((a, b) => number(value(a, "idTipo_domicilio")) - number(value(b, "idTipo_domicilio")))[0];

    if (!primary) {
      result.warnings.push("Cliente sin domicilio");
      return result;
    }
    if (clientAddresses.length > 1) result.warnings.push(`${clientAddresses.length} domicilios: se usa el principal`);

    result.data.calle = string(value(primary, "calle"));
    result.data.numero = string(value(primary, "numero"));
    result.data.codigo_postal = string(value(primary, "cp"));
    result.data.localidad = string(value(primary, "localidad"));

    const localityMatches = localitiesByName.get(normalizedText(value(primary, "localidad"))) || [];
    const provinceNames = [...new Set(localityMatches
      .map((locality) => provincesById.get(string(value(locality, "idProvincia"))))
      .filter((name): name is string => Boolean(name)))];

    if (localityMatches.length === 0) {
      result.data.provincia = "";
      result.warnings.push("Localidad sin coincidencia en Localidades");
    } else if (provinceNames.length === 1) {
      result.data.provincia = provinceNames[0];
      if (localityMatches.length > 1) result.warnings.push("Localidad repetida, pero coincide la provincia");
    } else {
      result.data.provincia = "";
      result.warnings.push(`Localidad ambigua en ${provinceNames.length || localityMatches.length} provincias`);
    }

    result.warnings = result.warnings.filter((warning) =>
      !["Falta calle", "Falta numero", "Falta codigo_postal", "Falta localidad", "Falta provincia"].includes(warning),
    );
    result.warnings.push(...withRequiredWarnings(result.data, ["calle", "numero", "codigo_postal", "localidad", "provincia"]));
    return result;
  });
}

export function previewProviderRows(
  providers: AccessRow[],
  ivaConditions: AccessRow[],
  comercioId: string,
) {
  const mapping = getMapping("Proveedores");
  if (!mapping?.transform) return [];
  const ivaById = new Map(ivaConditions.map((item) => [string(value(item, "IdCondicion")), afipSituation(value(item, "descripcion"))]));
  return providers.map((provider) => {
    const result = mapping.transform!(provider, comercioId);
    result.data.situacion_afip = ivaById.get(string(value(provider, "idCondIva"))) || "No Responsable";
    return result;
  });
}

export function previewProductRows(
  previewProducts: AccessRow[],
  allProducts: AccessRow[],
  categories: AccessRow[],
  brands: AccessRow[],
  suppliers: AccessRow[],
  comercioId: string,
) {
  const mapping = getMapping("Articulos");
  if (!mapping?.transform) return [];

  const categoriesById = new Map(categories.map((item) => [string(value(item, "idRubro")), string(value(item, "descripcion"))]));
  const brandsById = new Map(brands.map((item) => [string(value(item, "idMarca")), string(value(item, "descripcion"))]));
  const suppliersById = new Map(suppliers.map((item) => [string(value(item, "idProveedor")), string(value(item, "razon_social"))]));
  const codeCounts = new Map<string, number>();
  for (const product of allProducts) {
    const code = string(value(product, "cod_art", "idArticulo"));
    if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }

  return previewProducts.map((product) => {
    const result = mapping.transform!(product, comercioId);
    const rawCode = string(value(product, "cod_art"));
    const fallbackCode = sourceId(product, "idArticulo", "id_articulo", "id");
    if (!rawCode || rawCode === "0") {
      result.data.cod_producto = fallbackCode;
      result.warnings.push("Código 0/vacío: se utiliza el ID de artículo");
    } else if ((codeCounts.get(rawCode) || 0) > 1) {
      result.data.cod_producto = `${rawCode}-${fallbackCode}`;
      result.warnings.push("Código repetido: se combina con el ID de artículo");
    }
    const supplierId = string(value(product, "idProveedor"));
    const categoryId = string(value(product, "idRubro"));
    const brandId = string(value(product, "idMarca"));
    const supplierName = supplierId ? suppliersById.get(supplierId) : null;
    const categoryName = categoryId ? categoriesById.get(categoryId) : null;
    const brandName = brandId ? brandsById.get(brandId) : null;

    result.data.proveedor_referencia = supplierName || null;
    result.data.rubro_referencia = categoryName || null;
    result.data.marca_referencia = brandName || null;

    if (supplierId && !supplierName) result.warnings.push(`Proveedor ${supplierId} inexistente`);
    if (categoryId && !categoryName) result.warnings.push(`Rubro ${categoryId} inexistente`);
    if (brandId && !brandName) result.warnings.push(`Marca ${brandId} inexistente`);
    if (number(result.data.precio_costo) < 0) result.warnings.push("Costo negativo");
    if (number(result.data.stock) < 0) result.warnings.push("Stock negativo");
    for (const field of ["porcentaje_iva", "porcentaje_utilidad", "porcentaje_descuento"]) {
      const fieldValue = number(result.data[field]);
      if (fieldValue < 0 || fieldValue > 100) result.warnings.push(`${field} fuera del rango 0–100`);
    }
    const moneda = string(value(product, "moneda")).toUpperCase();
    if (moneda && !["AR$", "U$D OFICIAL", "USD", "PESOS", "DOLARES", "DÓLARES"].includes(moneda)) {
      result.warnings.push(`Moneda no reconocida: ${moneda}; se propone pesos`);
    }
    return result;
  });
}

export function previewColumns(rows: PreviewRow[]) {
  return rows[0] ? Object.keys(rows[0].data) : [];
}
