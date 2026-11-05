// Formato de presentacion: no modifica los datos originales ni los payloads.
export const mostrarEnMayusculas = (texto: string | null | undefined) =>
  (texto ?? "").toLocaleUpperCase("es-AR");
