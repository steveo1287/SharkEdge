function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function normalizeHost(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function buildBackendUrlFromHost(value: string) {
  return `https://${normalizeHost(value)}`;
}

export function getCurrentOddsBackendBaseUrl() {
  const explicit = process.env.SHARKEDGE_BACKEND_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return buildBackendUrlFromHost(productionHost);
  }

  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (deploymentHost) {
    return buildBackendUrlFromHost(deploymentHost);
  }

  return "http://localhost:3000";
}
