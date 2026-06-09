type SmokeCheck = {
  path: string;
  expectJson?: boolean;
  expectText?: string;
};

const checks: SmokeCheck[] = [
  { path: "/api/health/railway", expectJson: true },
  { path: "/api/results", expectJson: true },
  { path: "/api/results?market=moneyline", expectJson: true },
  { path: "/api/results?market=nrfi", expectJson: true },
  { path: "/api/results?market=props", expectJson: true },
  { path: "/api/results?market=trends", expectJson: true },
  { path: "/api/proof", expectJson: true },
  { path: "/api/tickets", expectJson: true },
  { path: "/results", expectText: "Results" },
  { path: "/results/moneyline", expectText: "Results" },
  { path: "/results/nrfi", expectText: "Results" },
  { path: "/results/props", expectText: "Results" },
  { path: "/results/trends", expectText: "Results" },
  { path: "/proof", expectText: "Proof Room" },
  { path: "/tickets", expectText: "Locked Tickets" }
];

function baseUrlFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--url="));
  const fromArg = arg?.slice("--url=".length).trim();
  const fromEnv = process.env.SHARKEDGE_RAILWAY_URL
    ?? process.env.RAILWAY_WEB_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.RAILWAY_WEB_INTERNAL_URL;
  const raw = fromArg || fromEnv;
  if (!raw) {
    throw new Error("Missing Railway base URL. Set SHARKEDGE_RAILWAY_URL or pass --url=https://<railway-web-domain>.");
  }
  return raw.replace(/\/$/, "");
}

async function check(baseUrl: string, item: SmokeCheck) {
  const url = `${baseUrl}${item.path}`;
  const started = Date.now();
  const response = await fetch(url, {
    headers: { Accept: item.expectJson ? "application/json" : "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(20_000)
  });
  const ms = Date.now() - started;
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${item.path} returned ${response.status}: ${body.slice(0, 240)}`);
  }
  if (item.expectJson) {
    try {
      JSON.parse(body);
    } catch {
      throw new Error(`${item.path} did not return valid JSON.`);
    }
  }
  if (item.expectText && !body.includes(item.expectText)) {
    throw new Error(`${item.path} did not include expected text: ${item.expectText}`);
  }
  return { path: item.path, status: response.status, ms };
}

async function main() {
  const baseUrl = baseUrlFromArgs();
  console.log(`Railway smoke target: ${baseUrl}`);
  const results = [];
  for (const item of checks) {
    const result = await check(baseUrl, item);
    results.push(result);
    console.log(`OK ${result.status} ${result.ms}ms ${result.path}`);
  }
  console.log(`Railway smoke passed: ${results.length}/${checks.length} checks.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
