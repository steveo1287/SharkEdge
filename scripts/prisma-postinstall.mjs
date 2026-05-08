import { spawnSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.POSTGRES_URL?.trim();

function run(label, command, args) {
  console.log(`[prisma-postinstall] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("generate client", "npx", ["prisma", "generate"]);

if (!dbUrl) {
  console.log("[prisma-postinstall] DATABASE_URL/POSTGRES_PRISMA_URL/POSTGRES_URL not set; skipping migrate deploy.");
  process.exit(0);
}

run("deploy migrations", "npx", ["prisma", "migrate", "deploy"]);
