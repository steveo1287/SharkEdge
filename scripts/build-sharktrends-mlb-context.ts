#!/usr/bin/env tsx
import { buildMlbGameContext } from "../src/server/sharktrends/mlb-context-builder";

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function readCsvArg(name: string) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).split(",").map((item) => item.trim()).filter(Boolean) : undefined;
}

function readNumberArg(name: string) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  const value = Number(arg.slice(prefix.length));
  return Number.isFinite(value) ? value : undefined;
}

async function main() {
  const started = Date.now();
  const result = await buildMlbGameContext({
    dryRun: hasFlag("--dry-run"),
    rebuild: hasFlag("--rebuild"),
    seasons: readCsvArg("--seasons")?.map(Number).filter(Number.isFinite),
    sourceKeys: readCsvArg("--source-keys"),
    marketTypes: readCsvArg("--markets") as any,
    limit: readNumberArg("--limit")
  });
  console.log(JSON.stringify({ ...result, totalElapsedMs: Date.now() - started }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[sharktrends:mlb-context] failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
