function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function buildVercelBackendUrl(value: string) {
  const host = value.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}/_/backend`;
}

export function getCurrentOddsBackendBaseUrl() {
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
