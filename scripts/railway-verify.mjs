import { spawnSync } from "node:child_process";

const steps = [
  ["prisma generate", "npm", ["run", "prisma:generate"]],
  ["typecheck", "npm", ["run", "typecheck"]],
  ["build", "npm", ["run", "build"]]
];

function run(label, command, args) {
  console.log(`\n[railway-verify] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      SHARKEDGE_ALLOW_DEGRADED_BOOT: process.env.SHARKEDGE_ALLOW_DEGRADED_BOOT || "true"
    }
  });
  if (result.status !== 0) {
    console.error(`[railway-verify] failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

for (const [label, command, args] of steps) {
  run(label, command, args);
}

console.log("\n[railway-verify] passed");
