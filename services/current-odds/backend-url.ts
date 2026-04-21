function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function getCurrentOddsBackendBaseUrl() {
  const explicit = process.env.SHARKEDGE_BACKEND_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  return "https://shark-odds-1.onrender.com";
}
