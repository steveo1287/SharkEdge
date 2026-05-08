import { spawnSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.POSTGRES_URL?.trim();
const shouldDeploy = process.env.RUN_PRISMA_MIGRATIONS === "1" || process.env.PRISMA_MIGRATE_DEPLOY === "1";

function run(label, command, args) {
  console.log(`[prisma-postinstall] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
  });
  if (result.status !== 0) {
    console.error(`[prisma-postinstall] failed: ${[command, ...args].join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

// Always run prisma generate
run("generate client", "npx", ["prisma", "generate"]);

if (!dbUrl) {
  console.log("[prisma-postinstall] DATABASE_URL not set; skipping migrate deploy.");
  process.exit(0);
}

if (!shouldDeploy) {
  console.log("[prisma-postinstall] Migration deploy skipped (set RUN_PRISMA_MIGRATIONS=1 or PRISMA_MIGRATE_DEPLOY=1 to enable).");
  process.exit(0);
}

run("deploy migrations", "npx", ["prisma", "migrate", "deploy"]);
