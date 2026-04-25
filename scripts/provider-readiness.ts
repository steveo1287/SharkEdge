import { loadEnvConfig } from "@next/env";

import type { LeagueKey } from "@/lib/types/domain";
import { getLiveOddsReadinessReport } from "@/services/current-odds/provider-readiness-service";

loadEnvConfig(process.cwd());

const ALLOWED_LEAGUES = new Set<LeagueKey>(["NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]);

function parseLeagues(argv: string[]) {
  const raw = argv.find((value) => value.startsWith("--leagues="))?.split("=")[1]?.trim();
  if (!raw) {
    return undefined;
  }

  const leagues = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is LeagueKey => ALLOWED_LEAGUES.has(value as LeagueKey));

  return leagues.length ? leagues : undefined;
}

function printHeader(title: string) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

async function main() {
  const report = await getLiveOddsReadinessReport({ leagues: parseLeagues(process.argv.slice(2)) });

  console.log(JSON.stringify({
    generatedAt: report.generatedAt,
    overallState: report.overallState,
    selectedBoardProvider: report.selectedBoardProvider,
    warnings: report.warnings,
    notes: report.notes
  }, null, 2));

  printHeader("Board providers");
  for (const provider of report.boardProviders) {
    console.log(`${provider.label}: ${provider.state}`);
    console.log(`  configured: ${provider.configured}`);
    console.log(`  generatedAt: ${provider.generatedAt ?? "n/a"}`);
    console.log(`  freshnessMinutes: ${provider.freshnessMinutes ?? "n/a"}`);
    console.log(`  sports/game count: ${provider.sportsCount}/${provider.gameCount}`);
    console.log(`  warnings: ${provider.warnings.length ? provider.warnings.join(" | ") : "none"}`);
  }

  printHeader("Book feeds");
  for (const feed of report.bookFeeds) {
    console.log(`${feed.label}: ${feed.state}`);
    console.log(`  configured: ${feed.configured}`);
    console.log(`  sourceUrl: ${feed.sourceUrl ?? "n/a"}`);
    console.log(`  reason: ${feed.reason ?? "n/a"}`);
    console.log(`  lastSuccessAt: ${feed.lastSuccessAt ?? "n/a"}`);
    console.log(`  warnings: ${feed.warnings.length ? feed.warnings.join(" | ") : "none"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
