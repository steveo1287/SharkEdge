import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BoardFilters, LeagueKey } from "@/lib/types/domain";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";

loadEnvConfig(process.cwd());

const ALLOWED_LEAGUES = new Set<LeagueKey>(["NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]);

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() || fallback;
}

function parseLeague(value: string): BoardFilters["league"] {
  const raw = value.trim().toUpperCase();
  if (!raw || raw === "ALL") {
    return "ALL";
  }

  return ALLOWED_LEAGUES.has(raw as LeagueKey) ? (raw as LeagueKey) : "ALL";
}

function parseMarket(value: string): BoardFilters["market"] {
  const raw = value.trim().toLowerCase();
  if (raw === "spread" || raw === "moneyline" || raw === "total") {
    return raw;
  }

  return "all";
}

function parseStatus(value: string): BoardFilters["status"] {
  const raw = value.trim().toLowerCase();
  if (raw === "pregame" || raw === "live") {
    return raw;
  }

  return "all";
}

function buildFilters(): BoardFilters {
  return parseBoardFilters({
    league: parseLeague(argValue("league", process.env.SHARKEDGE_SNAPSHOT_LEAGUE ?? "ALL")),
    date: argValue("date", process.env.SHARKEDGE_SNAPSHOT_DATE ?? "all"),
    sportsbook: argValue("sportsbook", process.env.SHARKEDGE_SNAPSHOT_SPORTSBOOK ?? "best"),
    market: parseMarket(argValue("market", process.env.SHARKEDGE_SNAPSHOT_MARKET ?? "all")),
    status: parseStatus(argValue("status", process.env.SHARKEDGE_SNAPSHOT_STATUS ?? "all"))
  });
}

async function main() {
  const outPath = path.resolve(argValue("out", process.env.SHARKEDGE_BOARD_SNAPSHOT_PATH ?? "public/data/latest-board.json"));
  const generatedAt = new Date().toISOString();
  const filters = buildFilters();

  const boardData = await getBoardPageData(filters);
  const snapshot = {
    snapshotSchemaVersion: 1,
    snapshotGeneratedAt: generatedAt,
    ...boardData,
    filters,
    sourceNote: `Precomputed board snapshot generated at ${generatedAt}.`,
    providerHealth: {
      ...boardData.providerHealth,
      summary: `Precomputed board snapshot generated at ${generatedAt}. Requests should read this JSON instead of running live odds/database/simulation work.`,
      freshnessLabel: "Snapshot refreshed just now",
      freshnessMinutes: 0,
      asOf: generatedAt,
      warnings: [
        ...(boardData.providerHealth?.warnings ?? []),
        "Snapshot mode: serve this file from public/data/latest-board.json or SHARKEDGE_BOARD_SNAPSHOT_URL."
      ]
    }
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        generatedAt,
        source: snapshot.source,
        games: snapshot.games.length,
        sections: snapshot.sportSections.length,
        providerHealth: snapshot.providerHealth.state
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
