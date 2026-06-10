import { prisma } from "@/lib/db/prisma";

import { rawContextToRow, rowMatchesFilter, summarizeBacktestRows } from "./backtest-engine";
import { describeSharkTrendFilters } from "./proof";
import type { SharkTrendContextRow, SharkTrendFilter } from "./types";

type RawDiscoveryRow = Record<string, unknown>;

export type SharkTrendDiscoveryCard = {
  id: string;
  title: string;
  headline: string;
  filters: SharkTrendFilter;
  conditions: string[];
  record: string;
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  roi: number;
  winRate: number;
  confidenceGrade: string;
  dataQualityScore: number;
  warnings: string[];
  examples: Array<{
    eventId: string;
    date: string | null;
    team: string;
    opponent: string | null;
    result: string;
    oddsAmerican: number | null;
    score: string;
  }>;
};

export type SharkTrendDiscoveryFeed = {
  generatedAt: string;
  cards: SharkTrendDiscoveryCard[];
  dataGaps: string[];
  scannedRows: number;
  candidateCount: number;
  warnings: string[];
};

type Candidate = {
  id: string;
  title: string;
  filters: SharkTrendFilter;
  minSample?: number;
};

function keyPart(value: unknown) {
  return String(value ?? "any").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values));
}

function n(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function priceBandTitle(min: number, max: number) {
  return `favored -${min} to -${max}`;
}

function favoriteBand(min: number, max: number): Pick<SharkTrendFilter, "favoriteMinAbsPrice" | "favoriteMaxAbsPrice" | "side" | "marketType"> {
  return { marketType: "moneyline", side: "FAVORITE", favoriteMinAbsPrice: min, favoriteMaxAbsPrice: max };
}

function dogBand(min: number, max: number): Pick<SharkTrendFilter, "oddsMin" | "oddsMax" | "side" | "marketType"> {
  return { marketType: "moneyline", side: "UNDERDOG", oddsMin: min, oddsMax: max };
}

function hasWind(rows: SharkTrendContextRow[]) {
  return rows.some((row) => row.windMph !== null && row.windMph !== undefined);
}

function hasInterleague(rows: SharkTrendContextRow[]) {
  return rows.some((row) => row.interleagueGame !== null && row.interleagueGame !== undefined);
}

function hasGameNumber(rows: SharkTrendContextRow[]) {
  return rows.some((row) => row.gameNumber !== null && row.gameNumber !== undefined);
}

function candidateId(filters: SharkTrendFilter) {
  return [
    filters.marketType,
    filters.team,
    filters.homeAway,
    filters.side,
    filters.favoriteMinAbsPrice,
    filters.favoriteMaxAbsPrice,
    filters.oddsMin,
    filters.oddsMax,
    filters.totalMax,
    filters.windOut ? "wind-out" : "",
    filters.windMphMin,
    filters.previousRunsScoredMax !== undefined ? `prev-rs-${filters.previousRunsScoredMax}` : "",
    filters.previousRunsAllowedMin !== undefined ? `prev-ra-${filters.previousRunsAllowedMin}` : "",
    filters.lastTwoRunsScoredMax !== undefined ? `last2-${filters.lastTwoRunsScoredMax}` : "",
    filters.daysRestMax !== undefined ? `rest-${filters.daysRestMax}` : "",
    filters.travelSpot,
    filters.divisionGame ? "division" : "",
    filters.interleagueGame ? "interleague" : "",
    filters.gameNumber !== undefined ? `game-${filters.gameNumber}` : "",
    filters.venue,
    filters.starterRollingGameScoreMin,
    filters.starterRollingGameScoreMax,
    filters.eloDiffMin
  ].map(keyPart).filter(Boolean).join("-");
}

function titleFor(filters: SharkTrendFilter) {
  const parts = describeSharkTrendFilters(filters).filter((part) => !part.startsWith("quality"));
  const lead = filters.team ? filters.team : "MLB";
  return `${lead}: ${parts.join(" + ")}`;
}

function teamCandidates(rows: SharkTrendContextRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.teamName || row.marketType !== "moneyline") continue;
    counts.set(row.teamName, (counts.get(row.teamName) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= 8).sort((a, b) => b[1] - a[1]).map(([team]) => team);
}

export function buildCandidateFilters(rows: SharkTrendContextRow[]): Candidate[] {
  const candidates: Candidate[] = [];
  const teams = teamCandidates(rows);
  const favoriteBands = [[110, 175], [120, 150], [140, 180], [165, 220]] as const;
  const dogBands = [[100, 150], [100, 180], [150, 220]] as const;
  const contextAtoms: Array<{ label: string; filters: Partial<SharkTrendFilter>; requires?: (rows: SharkTrendContextRow[]) => boolean }> = [
    { label: "wind out 10+ mph", filters: { windOut: true, windMphMin: 10 }, requires: hasWind },
    { label: "after being shut out", filters: { previousRunsScoredMax: 0 } },
    { label: "after scoring 2 or fewer", filters: { previousRunsScoredMax: 2 } },
    { label: "after allowing 8+", filters: { previousRunsAllowedMin: 8 } },
    { label: "cold last two games", filters: { lastTwoRunsScoredMax: 5 } },
    { label: "0 days rest", filters: { daysRestMax: 0 } },
    { label: "short rest", filters: { daysRestMax: 1 } },
    { label: "returning home", filters: { travelSpot: "road_to_home", homeAway: "HOME" } },
    { label: "road trip", filters: { travelSpot: "road_trip", homeAway: "AWAY" } },
    { label: "division game", filters: { divisionGame: true } },
    { label: "interleague game", filters: { interleagueGame: true }, requires: hasInterleague },
    { label: "series game 2", filters: { gameNumber: 2 }, requires: hasGameNumber },
    { label: "hot starter", filters: { starterRollingGameScoreMin: 58 } },
    { label: "cold starter", filters: { starterRollingGameScoreMax: 45 } },
    { label: "Elo edge 25+", filters: { eloDiffMin: 25 } }
  ];
  const totalAtoms: Array<{ label: string; filters: Partial<SharkTrendFilter>; requires?: (rows: SharkTrendContextRow[]) => boolean }> = [
    { label: "total 8.5 or lower", filters: { totalMax: 8.5 } },
    { label: "wind out 10+ mph", filters: { windOut: true, windMphMin: 10 }, requires: hasWind },
    { label: "cold last two games", filters: { lastTwoRunsScoredMax: 5 } },
    { label: "day game", filters: { dayGame: true } },
    { label: "night game", filters: { nightGame: true } },
    { label: "division game", filters: { divisionGame: true } },
    { label: "series game 2", filters: { gameNumber: 2 }, requires: hasGameNumber }
  ];

  for (const [min, max] of favoriteBands) {
    candidates.push({ id: `mlb-fav-${min}-${max}`, title: `MLB ${priceBandTitle(min, max)}`, filters: { league: "MLB", ...favoriteBand(min, max), minDataQualityScore: 45 } });
    candidates.push({ id: `mlb-home-fav-${min}-${max}`, title: `Home teams ${priceBandTitle(min, max)}`, filters: { league: "MLB", ...favoriteBand(min, max), homeAway: "HOME", minDataQualityScore: 45 } });
  }
  for (const [min, max] of dogBands) {
    candidates.push({ id: `mlb-dog-${min}-${max}`, title: `MLB underdogs +${min} to +${max}`, filters: { league: "MLB", ...dogBand(min, max), minDataQualityScore: 45 } });
  }

  for (const team of teams) {
    for (const [min, max] of favoriteBands) {
      const base = { league: "MLB" as const, team, ...favoriteBand(min, max), minDataQualityScore: 45 };
      candidates.push({ id: candidateId(base), title: `${team} ${priceBandTitle(min, max)}`, filters: base });
      for (const atom of contextAtoms) {
        if (atom.requires && !atom.requires(rows)) continue;
        const filters = { ...base, ...atom.filters };
        candidates.push({ id: candidateId(filters), title: `${team} ${priceBandTitle(min, max)} + ${atom.label}`, filters });
      }
    }
    for (const [min, max] of dogBands) {
      const base = { league: "MLB" as const, team, ...dogBand(min, max), minDataQualityScore: 45 };
      candidates.push({ id: candidateId(base), title: `${team} underdogs +${min} to +${max}`, filters: base });
      for (const atom of contextAtoms.slice(0, 10)) {
        if (atom.requires && !atom.requires(rows)) continue;
        const filters = { ...base, ...atom.filters };
        candidates.push({ id: candidateId(filters), title: `${team} underdog + ${atom.label}`, filters });
      }
    }
  }

  for (const side of ["OVER", "UNDER"] as const) {
    const base = { league: "MLB" as const, marketType: "total" as const, side, minDataQualityScore: 45 };
    candidates.push({ id: candidateId(base), title: `MLB ${side.toLowerCase()}s`, filters: base });
    for (const atom of totalAtoms) {
      if (atom.requires && !atom.requires(rows)) continue;
      const filters = { ...base, ...atom.filters };
      candidates.push({ id: candidateId(filters), title: `MLB ${side.toLowerCase()}s + ${atom.label}`, filters });
    }
    for (const team of teams) {
      for (const atom of totalAtoms) {
        if (atom.requires && !atom.requires(rows)) continue;
        const filters = { ...base, team, ...atom.filters };
        candidates.push({ id: candidateId(filters), title: `${team} ${side.toLowerCase()}s + ${atom.label}`, filters });
      }
    }
  }

  const byId = new Map<string, Candidate>();
  for (const candidate of candidates) byId.set(candidate.id, candidate);
  return [...byId.values()];
}

function summarizeCard(candidate: Candidate, rows: SharkTrendContextRow[]): SharkTrendDiscoveryCard | null {
  const matched = rows.filter((row) => rowMatchesFilter(row, candidate.filters));
  const summary = summarizeBacktestRows(matched, candidate.filters, true, 5);
  const result = summary.result;
  if (result.sampleSize < (candidate.minSample ?? 8)) return null;
  if (result.unitsFlatStake <= 0 && result.roiFlatStake <= 0.03 && result.winRate < 0.56) return null;
  const examples = (summary.matches as Array<any>).slice(0, 5).map((row) => ({
    eventId: row.eventId,
    date: row.date,
    team: row.team,
    opponent: row.opponent ?? null,
    result: row.result,
    oddsAmerican: n(row.oddsAmerican),
    score: `${row.teamScore ?? "--"}-${row.opponentScore ?? "--"}`
  }));
  return {
    id: candidate.id,
    title: candidate.title,
    headline: summary.proof.headline,
    filters: candidate.filters,
    conditions: summary.proof.conditions,
    record: `${result.wins}-${result.losses}${result.pushes ? `-${result.pushes}` : ""}`,
    sampleSize: result.sampleSize,
    wins: result.wins,
    losses: result.losses,
    pushes: result.pushes,
    units: Number(result.unitsFlatStake.toFixed(2)),
    roi: Number(result.roiFlatStake.toFixed(4)),
    winRate: Number(result.winRate.toFixed(4)),
    confidenceGrade: result.confidenceGrade,
    dataQualityScore: result.dataQualityScore,
    warnings: summary.warnings,
    examples
  };
}

function dataGaps(rows: SharkTrendContextRow[]) {
  const gaps: string[] = [];
  if (!rows.length) return ["No MLB context rows are available. Run the historical import and `npm run sharktrends:mlb-context`."];
  if (!hasWind(rows)) gaps.push("Wind systems are waiting on historical weather fields (`wind_mph`, `wind_out`, `wind_in`).");
  if (!hasGameNumber(rows)) gaps.push("Series game filters are waiting on `events.gameNumber` coverage.");
  if (!hasInterleague(rows)) gaps.push("Interleague filters are waiting on team league metadata in context rows.");
  if (!rows.some((row) => row.starterRollingGameScore !== null && row.starterRollingGameScore !== undefined)) gaps.push("Starter-form systems are waiting on Retrosheet pitcher rolling snapshots.");
  if (!rows.some((row) => row.lastGameRunsScored !== null && row.lastGameRunsScored !== undefined)) gaps.push("Previous-game offense systems are waiting on sequential team form context.");
  return gaps;
}

export function buildDiscoveryFeedFromRows(rows: SharkTrendContextRow[], limit = 24): SharkTrendDiscoveryFeed {
  const candidates = buildCandidateFilters(rows);
  const cards = candidates
    .map((candidate) => summarizeCard(candidate, rows))
    .filter((card): card is SharkTrendDiscoveryCard => Boolean(card))
    .sort((left, right) => {
      const unitDelta = right.units - left.units;
      if (unitDelta !== 0) return unitDelta;
      const roiDelta = right.roi - left.roi;
      if (roiDelta !== 0) return roiDelta;
      return right.sampleSize - left.sampleSize;
    })
    .slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
  return {
    generatedAt: new Date().toISOString(),
    cards,
    dataGaps: dataGaps(rows),
    scannedRows: rows.length,
    candidateCount: candidates.length,
    warnings: cards.length ? [] : ["No profitable MLB trend systems passed the current sample and ROI gates."]
  };
}

export async function fetchDiscoveryRows(limit = 25000) {
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT c.*, e."gameNumber" AS game_number
    FROM mlb_game_context c
    LEFT JOIN events e ON e.id = c.event_id
    WHERE c.market_type IN ('moneyline','spread','total')
      AND c.data_quality_score >= 35
    ORDER BY c.start_time DESC
    LIMIT ${Math.max(100, Math.min(100000, Math.floor(limit)))}
  `)) as RawDiscoveryRow[];
  return rows.map(rawContextToRow);
}

export async function getSharkTrendDiscovery(args: { limit?: number; rowLimit?: number } = {}) {
  const rows = await fetchDiscoveryRows(args.rowLimit ?? 25000);
  return buildDiscoveryFeedFromRows(rows, args.limit ?? 24);
}
