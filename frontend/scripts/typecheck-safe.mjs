import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const nextTypesDir = path.join(projectRoot, ".next", "types");
const tscBin = path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(nextTypesDir)) {
  console.log("[typecheck] .next/types missing, running build first to generate Next.js types");
  run(process.execPath, [path.join(projectRoot, "scripts", "build-local-safe.mjs")]);
}

// Run TypeScript directly via Node. This avoids Windows `.cmd` spawn issues (no shell)
// and behaves consistently in local + CI/Vercel environments.
run(process.execPath, [tscBin, "--noEmit", "--pretty", "false"]);
