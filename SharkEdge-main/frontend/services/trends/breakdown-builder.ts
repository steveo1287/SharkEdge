import { computeWindowMetrics, round } from "./metrics";
import { filterRowsByConditions } from "./discovery/helpers";
import type { CandidateTrendSystem, HistoricalBetOpportunity } from "./types";

type BreakdownRow = {
  label: string;
  sample: number;
  wins: number;
  losses: number;
  pushes: number;
  roi: number | null;
  hitRate: number | null;
  totalProfit: number | null;
};

function summarizeBucket(label: string, rows: HistoricalBetOpportunity[]) {
  const metrics = computeWindowMetrics(rows);

  return {
    label,
    sample: metrics.sampleSize,
    wins: metrics.wins,
    losses: metrics.losses,
    pushes: metrics.pushes,
    roi: typeof metrics.roi === "number" ? round(metrics.roi * 100, 2) : null,
    hitRate: typeof metrics.hitRate === "number" ? round(metrics.hitRate * 100, 2) : null,
    totalProfit: metrics.totalProfit
  } satisfies BreakdownRow;
}

function groupRows(
  rows: HistoricalBetOpportunity[],
  labelFor: (row: HistoricalBetOpportunity) => string | null,
  limit = 8
) {
  const groups = new Map<string, HistoricalBetOpportunity[]>();

  for (const row of rows) {
    const label = labelFor(row);
    if (!label) {
      continue;
    }

    const bucket = groups.get(label) ?? [];
    bucket.push(row);
    groups.set(label, bucket);
  }

  return Array.from(groups.entries())
    .map(([label, bucket]) => summarizeBucket(label, bucket))
    .sort((left, right) => (right.totalProfit ?? -999) - (left.totalProfit ?? -999))
    .slice(0, limit);
}

function oddsBucket(odds: number) {
  if (odds <= -200) return "<= -200";
  if (odds <= -150) return "-199 to -151";
  if (odds <= -110) return "-150 to -111";
  if (odds < 100) return "-110 to +99";
  if (odds < 130) return "+100 to +129";
  if (odds < 170) return "+130 to +169";
  return ">= +170";
}

export function buildPersistedTrendBreakdowns(
  system: CandidateTrendSystem,
  rows: HistoricalBetOpportunity[]
) {
  const relevantRows = rows.filter(
    (row) =>
      row.league === system.league &&
      row.sport === system.sport &&
      row.marketType === system.marketType &&
      row.side === system.side
  );
  const matchedRows = filterRowsByConditions(relevantRows, system.conditions);

  const seasonRows = Array.from(new Set(matchedRows.map((row) => row.season)))
    .sort((a, b) => b - a)
    .map((season) =>
      summarizeBucket(
        String(season),
        matchedRows.filter((row) => row.season === season)
      )
    );

  const teamRows = groupRows(matchedRows, (row) => row.teamName, 10);
  const opponentRows = groupRows(matchedRows, (row) => row.opponentName, 10);
  const lineRows = groupRows(
    matchedRows,
    (row) => {
      if (row.marketType === "moneyline") return oddsBucket(row.oddsAmerican);
      if (typeof row.line === "number") return String(row.line);
      return row.lineBucket ?? row.totalBucket ?? null;
    },
    10
  );

  return {
    seasons: seasonRows,
    teams: teamRows,
    opponents: opponentRows,
    lines: lineRows
  };
}
