import { readFile } from "node:fs/promises";

import { getStringArg, logStep, parseArgs } from "./_runtime-utils";
import { importCombatSourceProfiles, type RawCombatSourceProfile } from "@/services/modeling/ufc-source-ingest-service";

async function readProfiles(filepath: string): Promise<RawCombatSourceProfile[]> {
  const raw = await readFile(filepath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed as RawCombatSourceProfile[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { profiles?: unknown[] }).profiles)) {
    return (parsed as { profiles: RawCombatSourceProfile[] }).profiles;
  }
  throw new Error("Input file must be a JSON array or an object with a profiles array.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = getStringArg(args, "input");
  if (!input) {
    throw new Error("Missing required --input=/path/to/profiles.json argument.");
  }
  const profiles = await readProfiles(input);
  logStep("worker:ufc-source-import:start", { input, profiles: profiles.length });
  const result = await importCombatSourceProfiles(profiles);
  logStep("worker:ufc-source-import:done", result);
}

main().catch((error) => {
  console.error("[runtime] worker:ufc-source-import:error", error);
  process.exitCode = 1;
});
