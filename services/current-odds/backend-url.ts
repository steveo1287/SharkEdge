function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function getCurrentOddsBackendBaseUrl() {
  const explicit = [
    process.env.SHARKEDGE_BACKEND_URL?.trim(),
    process.env.NEXT_PUBLIC_SHARKEDGE_BACKEND_URL?.trim(),
    process.env.CURRENT_ODDS_BACKEND_URL?.trim(),
    process.env.BACKEND_URL?.trim()
  ].find((value) => Boolean(value));

  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  return "https://shark-odds-1.onrender.com";
}
