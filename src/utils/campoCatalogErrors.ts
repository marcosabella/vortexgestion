export function campoCatalogError(error: unknown, catalogo: string) {
  const safe = error as { code?: string; message?: string };
  const message = safe.message?.toLocaleLowerCase("es") ?? "";
  if (
    safe.code === "42501" || message.includes("row-level security") ||
    message.includes("permission denied")
  ) return `No tenés permisos para modificar ${catalogo}.`;
  if (safe.code === "PGRST116") {
    return "El registro no existe o no pertenece al comercio activo.";
  }
  if (safe.code === "23505") {
    if (message.includes("documento")) {
      return "Ya existe un operario con ese documento.";
    }
    if (message.includes("user_id")) {
      return "Ese usuario ya está asociado a otro operario.";
    }
    if (message.includes("identificacion")) {
      return "Ya existe una maquinaria con esa identificación.";
    }
    return "Ya existe un registro con ese código interno.";
  }
  if (safe.code === "23514") {
    if (message.includes("anio")) {
      return "El año debe ser un entero entre 1900 y 2100.";
    }
    if (message.includes("unidad")) {
      return "La unidad seleccionada no es válida.";
    }
    return "El nombre o tipo ingresado no es válido.";
  }
  return `No se pudo guardar ${catalogo}. Revisá los datos e intentá nuevamente.`;
}
