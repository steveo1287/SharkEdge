import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const nextTypesDir = path.join(projectRoot, ".next", "types");

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

if (process.platform === "win32") {
  run("npx.cmd", ["tsc", "--noEmit", "--pretty", "false"]);
} else {
  const tscBin = path.join(projectRoot, "node_modules", ".bin", "tsc");
  run(tscBin, ["--noEmit", "--pretty", "false"]);
}
