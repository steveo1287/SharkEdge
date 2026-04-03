import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const buildDir = join(process.cwd(), ".next");

if (existsSync(buildDir)) {
  rmSync(buildDir, { recursive: true, force: true });
  console.log(`[build] cleaned ${buildDir}`);
}
