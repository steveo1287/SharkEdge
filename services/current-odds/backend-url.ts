function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function isUsableEnvValue(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== "undefined" && normalized !== "null";
}

export function getCurrentOddsBackendBaseUrl() {
  const explicit = [
    process.env.SHARKEDGE_BACKEND_URL?.trim(),
    process.env.NEXT_PUBLIC_SHARKEDGE_BACKEND_URL?.trim(),
    process.env.CURRENT_ODDS_BACKEND_URL?.trim(),
    process.env.NEXT_PUBLIC_CURRENT_ODDS_BACKEND_URL?.trim(),
    process.env.BACKEND_URL?.trim(),
    process.env.RENDER_BACKEND_URL?.trim()
  ].find((value) => isUsableEnvValue(value));

  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  return "https://shark-odds-1.onrender.com";
}
