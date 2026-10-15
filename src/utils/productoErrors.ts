export const esCodigoProductoDuplicado = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  return code === "23505" && typeof message === "string" &&
    /\b(?:ind_productos_comercio_cod_producto|idx_productos_comercio_cod_producto|productos_cod_producto_key)\b/.test(message);
};

export const mensajeCodigoProductoDuplicado = (codigo: string) =>
  `Ya existe un producto con el código "${codigo}" en este comercio. Buscalo para agregarlo a la compra o ingresá otro código para crear un producto diferente.`;
