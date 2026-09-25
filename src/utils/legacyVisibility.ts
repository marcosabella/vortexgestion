const LEGACY_DELETED_CLIENT_PATTERN = /^cliente\s+(?:legacy|historico|histórico)\s+eliminado\s+#\d+$/i;

export const isLegacyDeletedClientName = (name?: string | null) =>
  LEGACY_DELETED_CLIENT_PATTERN.test((name || "").trim());

export const isLegacyDeletedClient = (client?: { nombre?: string | null } | null) =>
  isLegacyDeletedClientName(client?.nombre);

