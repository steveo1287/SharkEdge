import { spawn } from "node:child_process";
import path from "node:path";

import { getBooleanArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptPath = path.resolve(process.cwd(), "../backend/live_odds_scraper.py");
  const command = process.env.PYTHON_BIN?.trim() || "python";
  const env = {
    ...process.env,
    RUN_ONCE: getBooleanArg(args, "loop") ? "false" : "true"
  };

  logStep("worker:scrape:start", { scriptPath, runOnce: env.RUN_ONCE });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [scriptPath], {
      cwd: path.resolve(process.cwd(), "../backend"),
      env,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Scrape worker exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
