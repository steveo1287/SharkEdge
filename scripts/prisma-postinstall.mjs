import { spawnSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.POSTGRES_URL?.trim();
const shouldDeployMigrations = process.env.RUN_PRISMA_MIGRATIONS === "1" || process.env.PRISMA_MIGRATE_DEPLOY === "1";
const KNOWN_SAFE_FAILED_MIGRATIONS = new Set([
  "20260506040000_trend_perf_indexes"
]);

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function run(label, command, args, options = {}) {
  console.log(`[prisma-postinstall] ${label}`);
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    shell: process.platform === "win32",
    env: process.env,
    encoding: options.capture ? "utf8" : undefined
  });

  if (options.capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  return result;
}

function exitOnFailure(result, command, args) {
  if (result.status !== 0) {
    console.error(`[prisma-postinstall] failed: ${formatCommand(command, args)}`);
    process.exit(result.status ?? 1);
  }
}

function failedMigrationName(output) {
  const match = output.match(/The `([^`]+)` migration started/i);
  return match?.[1] ?? null;
}

function deployMigrations() {
  const command = "npx";
  const args = ["prisma", "migrate", "deploy"];
  const result = run("deploy migrations", command, args, { capture: true });

  if (result.status === 0) return;

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const failedName = failedMigrationName(output);
  const isBlockedByKnownSafeMigration = output.includes("P3009") && failedName && KNOWN_SAFE_FAILED_MIGRATIONS.has(failedName);

  if (!isBlockedByKnownSafeMigration) {
    exitOnFailure(result, command, args);
    return;
  }

  console.warn(`[prisma-postinstall] resolving known safe failed migration as applied: ${failedName}`);
  console.warn("[prisma-postinstall] this migration only creates optional performance indexes; resolving it unblocks later table migrations.");

  const resolveCommand = "npx";
  const resolveArgs = ["prisma", "migrate", "resolve", "--applied", failedName];
  const resolveResult = run(`resolve failed migration ${failedName}`, resolveCommand, resolveArgs);
  exitOnFailure(resolveResult, resolveCommand, resolveArgs);

  const retryResult = run("deploy migrations after resolve", command, args);
  exitOnFailure(retryResult, command, args);
}

const generateCommand = "npx";
const generateArgs = ["prisma", "generate"];
const generateResult = run("generate client", generateCommand, generateArgs);
exitOnFailure(generateResult, generateCommand, generateArgs);

if (!dbUrl) {
  console.log("[prisma-postinstall] DATABASE_URL/POSTGRES_PRISMA_URL/POSTGRES_URL not set; skipping migrate deploy.");
  process.exit(0);
}

if (!shouldDeployMigrations) {
  console.log("[prisma-postinstall] migration deploy skipped. Set RUN_PRISMA_MIGRATIONS=1 or PRISMA_MIGRATE_DEPLOY=1 to run migrations explicitly.");
  process.exit(0);
}

deployMigrations();
