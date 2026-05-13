import type { SharkTrendFilter } from "./types";

type TrendResult = {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  winRate: number;
  winRateExPushes?: number;
  roiFlatStake: number;
  unitsFlatStake: number;
  avgOddsAmerican?: number | null;
  avgClosingOddsAmerican?: number | null;
  avgLine?: number | null;
  avgClosingLine?: number | null;
  clvAverage?: number | null;
  confidenceGrade: string;
  dataQualityScore: number;
  warningFlags?: string[];
};

type SplitRow = {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  roi: number;
};

type SplitBucket = Record<string, SplitRow>;
type SplitGroups = Record<string, SplitBucket | undefined>;

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function units(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function price(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function rangeLabel(min: number | undefined, max: number | undefined, suffix = "") {
  if (min !== undefined && max !== undefined) return `${min}${suffix} to ${max}${suffix}`;
  if (min !== undefined) return `${min}${suffix}+`;
  if (max !== undefined) return `<= ${max}${suffix}`;
  return null;
}

function travelLabel(value: string | undefined) {
  if (value === "home_stand") return "staying on a homestand";
  if (value === "road_trip") return "continuing a road trip";
  if (value === "home_to_road") return "leaving home for the road";
  if (value === "road_to_home") return "returning home from the road";
  return null;
}

export function describeSharkTrendFilters(filters: SharkTrendFilter) {
  const conditions: string[] = [];
  if (filters.team) conditions.push(`${filters.team}`);
  if (filters.opponent) conditions.push(`vs ${filters.opponent}`);
  if (filters.homeAway === "HOME") conditions.push("home");
  if (filters.homeAway === "AWAY") conditions.push("road");
  if (filters.side === "FAVORITE") conditions.push("favorites");
  if (filters.side === "UNDERDOG") conditions.push("underdogs");
  if (filters.side === "OVER") conditions.push("overs");
  if (filters.side === "UNDER") conditions.push("unders");
  if (filters.favoriteMinAbsPrice !== undefined || filters.favoriteMaxAbsPrice !== undefined) {
    const label = rangeLabel(filters.favoriteMinAbsPrice, filters.favoriteMaxAbsPrice);
    if (label) conditions.push(`favorite price ${label}`);
  } else if (filters.oddsMin !== undefined || filters.oddsMax !== undefined) {
    const label = [price(filters.oddsMin), price(filters.oddsMax)].filter(Boolean).join(" to ");
    if (label) conditions.push(`odds ${label}`);
  }
  if (filters.totalMin !== undefined || filters.totalMax !== undefined) {
    const label = rangeLabel(filters.totalMin, filters.totalMax);
    if (label) conditions.push(`total ${label}`);
  }
  if (filters.spreadMin !== undefined || filters.spreadMax !== undefined) {
    const label = rangeLabel(filters.spreadMin, filters.spreadMax);
    if (label) conditions.push(`spread ${label}`);
  }
  if (filters.divisionGame === true) conditions.push("division game");
  if (filters.dayGame === true) conditions.push("day game");
  if (filters.nightGame === true) conditions.push("night game");
  if (filters.daysRestMin !== undefined || filters.daysRestMax !== undefined) {
    const label = rangeLabel(filters.daysRestMin, filters.daysRestMax, " day");
    if (label) conditions.push(`team rest ${label}`);
  }
  if (filters.opponentDaysRestMin !== undefined || filters.opponentDaysRestMax !== undefined) {
    const label = rangeLabel(filters.opponentDaysRestMin, filters.opponentDaysRestMax, " day");
    if (label) conditions.push(`opponent rest ${label}`);
  }
  const travel = travelLabel(filters.travelSpot);
  if (travel) conditions.push(travel);
  if (filters.previousRunsScoredMax !== undefined) conditions.push(`scored ${filters.previousRunsScoredMax} or fewer last game`);
  if (filters.previousRunsAllowedMin !== undefined) conditions.push(`allowed ${filters.previousRunsAllowedMin}+ last game`);
  if (filters.lastTwoRunsScoredMax !== undefined) conditions.push(`last two games <= ${filters.lastTwoRunsScoredMax} runs`);
  if (filters.lastThreeRunsScoredMax !== undefined) conditions.push(`last three games <= ${filters.lastThreeRunsScoredMax} runs`);
  if (filters.windOut) conditions.push("wind blowing out");
  if (filters.windIn) conditions.push("wind blowing in");
  if (filters.windMphMin !== undefined || filters.windMphMax !== undefined) {
    const label = rangeLabel(filters.windMphMin, filters.windMphMax, " mph");
    if (label) conditions.push(`wind ${label}`);
  }
  if (filters.venue) conditions.push(`venue contains ${filters.venue}`);
  if (filters.parkId) conditions.push(`park ${filters.parkId}`);
  if (filters.starterRollingGameScoreMin !== undefined || filters.starterRollingGameScoreMax !== undefined) {
    const label = rangeLabel(filters.starterRollingGameScoreMin, filters.starterRollingGameScoreMax);
    if (label) conditions.push(`starter rolling game score ${label}`);
  }
  if (filters.eloDiffMin !== undefined || filters.eloDiffMax !== undefined) {
    const label = rangeLabel(filters.eloDiffMin, filters.eloDiffMax);
    if (label) conditions.push(`Elo diff ${label}`);
  }
  if (filters.sportsbookKey) conditions.push(`book ${filters.sportsbookKey}`);
  if (filters.minDataQualityScore !== undefined) conditions.push(`quality >= ${filters.minDataQualityScore}`);
  if (filters.seasons?.length) {
    const min = Math.min(...filters.seasons);
    const max = Math.max(...filters.seasons);
    conditions.push(min === max ? `season ${min}` : `seasons ${min}-${max}`);
  }
  return conditions.length ? conditions : ["all stored MLB historical games"];
}

function marketLabel(filters: SharkTrendFilter) {
  if (filters.marketType === "total") return filters.side === "UNDER" ? "unders" : filters.side === "OVER" ? "overs" : "totals";
  if (filters.marketType === "spread") return "run-line spots";
  if (filters.side === "FAVORITE") return "favorites";
  if (filters.side === "UNDERDOG") return "underdogs";
  return "moneyline spots";
}

function splitTitle(key: string) {
  return key
    .replace(/^by/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();
}

export function buildSplitHighlights(splits: SplitGroups) {
  const rows: Array<SplitRow & { group: string; bucket: string; label: string }> = [];
  for (const [group, bucket] of Object.entries(splits)) {
    for (const [bucketName, row] of Object.entries(bucket ?? {})) {
      if (!row.sampleSize) continue;
      rows.push({
        ...row,
        group,
        bucket: bucketName,
        label: `${splitTitle(group)}: ${bucketName}`
      });
    }
  }
  const ranked = rows.sort((a, b) => {
    const sampleBias = Math.min(b.sampleSize, 100) - Math.min(a.sampleSize, 100);
    return b.units - a.units || b.roi - a.roi || sampleBias;
  });
  const best = ranked.slice(0, 5).map((row) => ({
    label: row.label,
    record: `${row.wins}-${row.losses}${row.pushes ? `-${row.pushes}` : ""}`,
    sampleSize: row.sampleSize,
    units: row.units,
    roi: row.roi,
    summary: `${row.label} is ${row.wins}-${row.losses}${row.pushes ? `-${row.pushes}` : ""}, ${units(row.units)}, ${pct(row.roi)} ROI`
  }));
  const worst = [...rows]
    .sort((a, b) => a.units - b.units || a.roi - b.roi)
    .slice(0, 3)
    .map((row) => ({
      label: row.label,
      record: `${row.wins}-${row.losses}${row.pushes ? `-${row.pushes}` : ""}`,
      sampleSize: row.sampleSize,
      units: row.units,
      roi: row.roi,
      summary: `${row.label} is ${row.wins}-${row.losses}${row.pushes ? `-${row.pushes}` : ""}, ${units(row.units)}, ${pct(row.roi)} ROI`
    }));
  return { best, worst };
}

export function buildSharkTrendProof(args: {
  filters: SharkTrendFilter;
  result: TrendResult;
  splits: SplitGroups;
  warnings?: string[];
  coverage?: {
    minDate?: string | null;
    maxDate?: string | null;
    seasonsAvailable?: number[];
    sourceKeys?: string[];
    marketCount?: number;
    snapshotCount?: number;
  };
}) {
  const { filters, result, splits, warnings = [], coverage } = args;
  const conditions = describeSharkTrendFilters(filters);
  const record = `${result.wins}-${result.losses}${result.pushes ? `-${result.pushes}` : ""}`;
  const sample = result.sampleSize;
  const market = marketLabel(filters);
  const conditionText = conditions.join(", ");
  const headline = sample
    ? `MLB ${market} matching ${conditionText} are ${record} (${pct(result.winRate)}, ${units(result.unitsFlatStake)}, ${pct(result.roiFlatStake)} ROI) across ${sample} graded games.`
    : `No graded MLB ${market} matched ${conditionText}.`;
  const splitHighlights = buildSplitHighlights(splits);
  const evidenceBullets = [
    `${sample} graded bet${sample === 1 ? "" : "s"} with ${result.voids} void/ungraded row${result.voids === 1 ? "" : "s"} excluded.`,
    `Average open price ${price(result.avgOddsAmerican) ?? "N/A"} and average close ${price(result.avgClosingOddsAmerican) ?? "N/A"}.`,
    `CLV average ${result.clvAverage === null || result.clvAverage === undefined ? "N/A" : result.clvAverage.toFixed(1)} with confidence grade ${result.confidenceGrade}.`,
    `Data quality score ${result.dataQualityScore}/100.`
  ];
  if (coverage?.sourceKeys?.length) evidenceBullets.push(`Source coverage: ${coverage.sourceKeys.join(", ")}.`);
  if (coverage?.minDate && coverage?.maxDate) evidenceBullets.push(`Historical window: ${coverage.minDate.slice(0, 10)} to ${coverage.maxDate.slice(0, 10)}.`);
  const cautionFlags = [...new Set([
    ...warnings,
    sample < 20 ? "Small sample. Treat this as research until more rows qualify." : "",
    result.dataQualityScore < 70 ? "Data quality below preferred TrendsCenter-style threshold." : ""
  ].filter(Boolean))];
  return {
    headline,
    conditionText,
    conditions,
    evidenceBullets,
    splitHighlights,
    cautionFlags,
    market,
    record,
    sampleSize: sample
  };
}
