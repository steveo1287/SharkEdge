function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function buildVercelBackendUrl(value: string) {
  const host = value.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}/_/backend`;
}

/**
 * Resolves the SharkEdge Python backend base URL in this priority order:
 * 1. SHARKEDGE_BACKEND_URL env var (explicit override)
 * 2. VERCEL_PROJECT_PRODUCTION_URL (Vercel production deployment)
 * 3. VERCEL_URL (Vercel preview deployment)
 * 4. localhost fallback for local development
 */
export function getBackendBaseUrl(): string {
  const explicit = process.env.SHARKEDGE_BACKEND_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return buildVercelBackendUrl(productionHost);
  }

  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (deploymentHost) {
    return buildVercelBackendUrl(deploymentHost);
  }

  return "http://127.0.0.1:8000";
}
