function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function hasCurrentOddsBackendBaseUrl() {
  return Boolean(process.env.SHARKEDGE_BACKEND_URL?.trim());
}

export function getCurrentOddsBackendBaseUrl() {
  const explicit = process.env.SHARKEDGE_BACKEND_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  return "";
}
