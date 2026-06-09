import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbPlayerDataPipeTables } from "@/services/players/mlb-player-data-pipe";

export type MlbPitcherDiversityAuditRow = {
  pitcherId: string;
  pitcherName: string;
  team: string;
  season: number;
  source: string;
  overall: number | null;
  roleTier: string | null;
  snapshotAt: string | null;
  rawMetrics: {
    innings: number | null;
    starts: number | null;
    inningsPerStart: number | null;
    kRate: number | null;
    strikeoutsPer9: number | null;
    bbRate: number | null;
    walksPer9: number | null;
    hrPer9: number | null;
    pitchCountAvg: number | null;
    velocity: number | null;
    stuffPlus: number | null;
  };
  ratingTraits: {
    xeraQuality: number | null;
    fipQuality: number | null;
    kBb: number | null;
    hrRisk: number | null;
    stamina: number | null;
    arsenalQuality: number | null;
  };
  diversityScore: number;
  genericRisk: "LOW" | "MEDIUM" | "HIGH";
  issues: string[];
};

export type MlbPitcherDiversityAudit = {
  ok: boolean;
  generatedAt: string;
  source: string | null;
  season: number | null;
  summary: {
    pitchers: number;
    lowRisk: number;
    mediumRisk: number;
    highRisk: number;
    avgDiversityScore: number | null;
    missingKRate: number;
    missingInnings: number;
    missingStarts: number;
    missingPitchCount: number;
    missingStuffVelocity: number;
  };
  rows: MlbPitcherDiversityAuditRow[];
  warnings: string[];
};

type PitcherRow = {
  pitcher_id: string;
  pitcher_name: string;
  team: string;
  season: number;
  role_tier: string | null;
  xera_quality: number | null;
  fip_quality: number | null;
  k_bb: number | null;
  hr_risk: number | null;
  stamina: number | null;
  arsenal_quality: number | null;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
  source: string;
  snapshot_at: Date | string | null;
};

type GenericRisk = MlbPitcherDiversityAuditRow["genericRisk"];

type PitcherDiversityScore = {
  diversityScore: number;
  genericRisk: GenericRisk;
  issues: string[];
};

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function metric(row: PitcherRow, key: string) {
  return n(row.metrics_json?.[key]);
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function riskFromScore(diversityScore: number): GenericRisk {
  if (diversityScore >= 82) return "LOW";
  if (diversityScore >= 62) return "MEDIUM";
  return "HIGH";
}

function scoreRow(row: PitcherRow): PitcherDiversityScore {
  let score = 100;
  const issues: string[] = [];
  const kRate = metric(row, "kRate");
  const innings = metric(row, "innings");
  const starts = metric(row, "starts");
  const pitchCountAvg = metric(row, "pitchCountAvg");
  const velocity = metric(row, "velocity");
  const stuffPlus = metric(row, "stuffPlus");
  const strikeoutsPer9 = metric(row, "strikeoutsPer9") ?? metric(row, "kPer9");
  if (kRate == null && strikeoutsPer9 == null) { score -= 24; issues.push("Missing K rate/K9; strikeout props will collapse toward default."); }
  if (innings == null) { score -= 18; issues.push("Missing innings; outs and workload projection will be generic."); }
  if (starts == null) { score -= 14; issues.push("Missing starts; starter role depth is weaker."); }
  if (pitchCountAvg == null) { score -= 14; issues.push("Missing pitch-count average; outs ceiling will be generic."); }
  if (velocity == null && stuffPlus == null) { score -= 14; issues.push("Missing velocity/Stuff+; ace-vs-back-end separation is weaker."); }
  if (row.overall == null || row.k_bb == null || row.stamina == null) { score -= 16; issues.push("Missing compiled rating traits."); }
  const diversityScore = Math.max(0, Math.min(100, Math.round(score)));
  return { diversityScore, genericRisk: riskFromScore(diversityScore), issues };
}

async function rows(source?: string | null, season?: number | null) {
  if (source && season) return prisma.$queryRaw<PitcherRow[]>`
    SELECT DISTINCT ON (pitcher_id) pitcher_id, pitcher_name, team, season, role_tier, xera_quality, fip_quality, k_bb, hr_risk, stamina, arsenal_quality, overall, metrics_json, source, snapshot_at
    FROM mlb_pitcher_ratings
    WHERE source = ${source} AND season = ${season}
    ORDER BY pitcher_id, snapshot_at DESC;
  `;
  if (source) return prisma.$queryRaw<PitcherRow[]>`
    SELECT DISTINCT ON (pitcher_id) pitcher_id, pitcher_name, team, season, role_tier, xera_quality, fip_quality, k_bb, hr_risk, stamina, arsenal_quality, overall, metrics_json, source, snapshot_at
    FROM mlb_pitcher_ratings
    WHERE source = ${source}
    ORDER BY pitcher_id, snapshot_at DESC;
  `;
  if (season) return prisma.$queryRaw<PitcherRow[]>`
    SELECT DISTINCT ON (pitcher_id) pitcher_id, pitcher_name, team, season, role_tier, xera_quality, fip_quality, k_bb, hr_risk, stamina, arsenal_quality, overall, metrics_json, source, snapshot_at
    FROM mlb_pitcher_ratings
    WHERE season = ${season}
    ORDER BY pitcher_id, snapshot_at DESC;
  `;
  return prisma.$queryRaw<PitcherRow[]>`
    SELECT DISTINCT ON (pitcher_id) pitcher_id, pitcher_name, team, season, role_tier, xera_quality, fip_quality, k_bb, hr_risk, stamina, arsenal_quality, overall, metrics_json, source, snapshot_at
    FROM mlb_pitcher_ratings
    ORDER BY pitcher_id, snapshot_at DESC;
  `;
}

export async function getMlbPitcherDiversityAudit(args: { source?: string | null; season?: number | null; limit?: number | null } = {}): Promise<MlbPitcherDiversityAudit> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), source: args.source ?? null, season: args.season ?? null, summary: { pitchers: 0, lowRisk: 0, mediumRisk: 0, highRisk: 0, avgDiversityScore: null, missingKRate: 0, missingInnings: 0, missingStarts: 0, missingPitchCount: 0, missingStuffVelocity: 0 }, rows: [], warnings: ["No usable server database URL is configured."] };
  }
  await ensureMlbPlayerDataPipeTables();
  const source = args.source?.trim() || null;
  const data = await rows(source, args.season ?? null);
  const mapped: MlbPitcherDiversityAuditRow[] = data.map((row): MlbPitcherDiversityAuditRow => {
    const scored = scoreRow(row);
    return {
      pitcherId: row.pitcher_id,
      pitcherName: row.pitcher_name,
      team: row.team,
      season: row.season,
      source: row.source,
      overall: row.overall,
      roleTier: row.role_tier,
      snapshotAt: iso(row.snapshot_at),
      rawMetrics: {
        innings: metric(row, "innings"),
        starts: metric(row, "starts"),
        inningsPerStart: metric(row, "inningsPerStart"),
        kRate: metric(row, "kRate"),
        strikeoutsPer9: metric(row, "strikeoutsPer9") ?? metric(row, "kPer9"),
        bbRate: metric(row, "bbRate"),
        walksPer9: metric(row, "walksPer9") ?? metric(row, "bbPer9"),
        hrPer9: metric(row, "hrPer9"),
        pitchCountAvg: metric(row, "pitchCountAvg"),
        velocity: metric(row, "velocity"),
        stuffPlus: metric(row, "stuffPlus")
      },
      ratingTraits: {
        xeraQuality: row.xera_quality,
        fipQuality: row.fip_quality,
        kBb: row.k_bb,
        hrRisk: row.hr_risk,
        stamina: row.stamina,
        arsenalQuality: row.arsenal_quality
      },
      diversityScore: scored.diversityScore,
      genericRisk: scored.genericRisk,
      issues: scored.issues
    };
  }).sort((a, b) => a.diversityScore - b.diversityScore || a.pitcherName.localeCompare(b.pitcherName));
  const limited = mapped.slice(0, Math.max(1, Math.min(250, Math.round(args.limit ?? 80))));
  const avg = mapped.length ? Number((mapped.reduce((sum, row) => sum + row.diversityScore, 0) / mapped.length).toFixed(1)) : null;
  const summary = {
    pitchers: mapped.length,
    lowRisk: mapped.filter((row) => row.genericRisk === "LOW").length,
    mediumRisk: mapped.filter((row) => row.genericRisk === "MEDIUM").length,
    highRisk: mapped.filter((row) => row.genericRisk === "HIGH").length,
    avgDiversityScore: avg,
    missingKRate: mapped.filter((row) => row.rawMetrics.kRate == null && row.rawMetrics.strikeoutsPer9 == null).length,
    missingInnings: mapped.filter((row) => row.rawMetrics.innings == null).length,
    missingStarts: mapped.filter((row) => row.rawMetrics.starts == null).length,
    missingPitchCount: mapped.filter((row) => row.rawMetrics.pitchCountAvg == null).length,
    missingStuffVelocity: mapped.filter((row) => row.rawMetrics.velocity == null && row.rawMetrics.stuffPlus == null).length
  };
  const warnings: string[] = [];
  if (!mapped.length) warnings.push("No pitcher rating rows found for this source/season filter.");
  if (summary.highRisk > 0) warnings.push(`${summary.highRisk} pitcher rows still have high generic-risk and need richer raw stats.`);
  return { ok: mapped.length > 0, generatedAt: new Date().toISOString(), source, season: args.season ?? null, summary, rows: limited, warnings };
}
