import { NextResponse } from "next/server";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { buildUfcModelFeaturesFromWarehouse } from "@/services/ufc/fighter-feature-auto-builder";
import { buildEliteUfcFighterProfiles } from "@/services/ufc/elite-fighter-profile-builder";
import { backfillKnownUfcFighterStats } from "@/services/ufc/ufcstats-known-fighter-backfill";
import { hydrateUpcomingUfcFeatureSnapshots } from "@/services/ufc/upcoming-feature-hydration";
import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

type AuditRow = {
  fight_id: string;
  event_label: string;
  fight_date: Date | string;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  a_feature_id: string | null;
  b_feature_id: string | null;
  a_pro_fights: number | null;
  b_pro_fights: number | null;
  a_ufc_fights: number | null;
  b_ufc_fights: number | null;
  a_rounds_fought: number | null;
  b_rounds_fought: number | null;
  a_slpm: number | null;
  b_slpm: number | null;
  a_sapm: number | null;
  b_sapm: number | null;
  a_striking_differential: number | null;
  b_striking_differential: number | null;
  a_takedowns_per_15: number | null;
  b_takedowns_per_15: number | null;
  a_takedown_defense_pct: number | null;
  b_takedown_defense_pct: number | null;
  a_submission_attempts_per_15: number | null;
  b_submission_attempts_per_15: number | null;
  a_control_time_pct: number | null;
  b_control_time_pct: number | null;
  a_opponent_adjusted_strength: number | null;
  b_opponent_adjusted_strength: number | null;
  a_cold_start_active: boolean | null;
  b_cold_start_active: boolean | null;
  a_feature_json: unknown;
  b_feature_json: unknown;
};

type FighterAudit = {
  fighterId: string;
  fighterName: string | null;
  hasFeature: boolean;
  ready: boolean;
  score: number;
  grade: "A" | "B" | "C" | "D";
  coldStartActive: boolean;
  featureSource: string | null;
  missingCritical: string[];
};

type FightAudit = {
  fightId: string;
  eventLabel: string;
  fightDate: string;
  fighterA: FighterAudit;
  fighterB: FighterAudit;
  ready: boolean;
  blockedReasons: string[];
};

function authorized(request: Request) {
  const url = new URL(request.url);
  const envSecret = process.env.UFC_ADMIN_RUN_TOKEN;
  if (envSecret) return url.searchParams.get("token") === envSecret || request.headers.get("x-ufc-admin-token") === envSecret;
  return url.searchParams.get("confirm") === "prepare-sim-card";
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const value = url.searchParams.get(name);
  const parsed = value ? Number(value) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%/g, "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function featureNumber(featureJson: unknown, ...keys: string[]) {
  const root = asRecord(featureJson);
  const sources = [root, asRecord(root.rawFeature), asRecord(root.rawPayload), asRecord(root.stats), asRecord(root.careerStats), asRecord(root.profileDiagnostics)];
  for (const source of sources) {
    for (const key of keys) {
      const value = toNumber(source[key]);
      if (typeof value === "number") return value;
    }
  }
  return null;
}

function featureString(featureJson: unknown, ...keys: string[]) {
  const root = asRecord(featureJson);
  const sources = [root, asRecord(root.rawFeature), asRecord(root.rawPayload), asRecord(root.stats), asRecord(root.careerStats)];
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function present(value: unknown) {
  return typeof value === "number" ? Number.isFinite(value) : value != null;
}

function grade(score: number): FighterAudit["grade"] {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 55) return "C";
  return "D";
}

function auditFighter(input: {
  fighterId: string;
  fighterName: string | null;
  featureId: string | null;
  featureJson: unknown;
  proFights: number | null;
  ufcFights: number | null;
  roundsFought: number | null;
  slpm: number | null;
  sapm: number | null;
  strikingDifferential: number | null;
  takedownsPer15: number | null;
  takedownDefensePct: number | null;
  submissionAttemptsPer15: number | null;
  controlTimePct: number | null;
  opponentAdjustedStrength: number | null;
  coldStartActive: boolean | null;
}): FighterAudit {
  const sigStrikeDefensePct = featureNumber(input.featureJson, "sigStrikeDefensePct", "sig_strike_defense_pct", "strikeDefensePct");
  const submissionDefensePct = featureNumber(input.featureJson, "submissionDefensePct", "submission_defense_pct", "subDefense");
  const controlEscapePct = featureNumber(input.featureJson, "controlEscapePct", "control_escape_pct", "escapePct");
  const staminaScore = featureNumber(input.featureJson, "staminaScore", "cardioScore", "lateRoundPerformance");
  const featureSource = featureString(input.featureJson, "source", "profileSource", "provider");
  const required = [
    ["Feature snapshot", input.featureId],
    ["Pro fights", input.proFights],
    ["UFC/major fights", input.ufcFights],
    ["Rounds fought", input.roundsFought],
    ["SLpM", input.slpm],
    ["SApM", input.sapm],
    ["Striking differential", input.strikingDifferential],
    ["Strike defense", sigStrikeDefensePct],
    ["Takedowns/15", input.takedownsPer15],
    ["Takedown defense", input.takedownDefensePct],
    ["Submission attempts/15", input.submissionAttemptsPer15],
    ["Submission defense", submissionDefensePct],
    ["Control time", input.controlTimePct],
    ["Control escape", controlEscapePct],
    ["Opponent-adjusted strength", input.opponentAdjustedStrength],
    ["Stamina/cardio", staminaScore]
  ] as const;
  const missingCritical = required.filter(([, value]) => !present(value)).map(([label]) => label);
  const presentCount = required.length - missingCritical.length;
  const samplePenalty = input.coldStartActive ? 10 : 0;
  const score = Math.max(0, Math.min(100, Math.round((presentCount / required.length) * 100 - samplePenalty)));
  const hasFeature = Boolean(input.featureId);
  const ready = hasFeature && score >= 72 && !input.coldStartActive && missingCritical.length <= 3;
  return {
    fighterId: input.fighterId,
    fighterName: input.fighterName,
    hasFeature,
    ready,
    score,
    grade: grade(score),
    coldStartActive: Boolean(input.coldStartActive),
    featureSource,
    missingCritical
  };
}

function auditFight(row: AuditRow): FightAudit {
  const fighterA = auditFighter({
    fighterId: row.fighter_a_id,
    fighterName: row.fighter_a_name,
    featureId: row.a_feature_id,
    featureJson: row.a_feature_json,
    proFights: row.a_pro_fights,
    ufcFights: row.a_ufc_fights,
    roundsFought: row.a_rounds_fought,
    slpm: row.a_slpm,
    sapm: row.a_sapm,
    strikingDifferential: row.a_striking_differential,
    takedownsPer15: row.a_takedowns_per_15,
    takedownDefensePct: row.a_takedown_defense_pct,
    submissionAttemptsPer15: row.a_submission_attempts_per_15,
    controlTimePct: row.a_control_time_pct,
    opponentAdjustedStrength: row.a_opponent_adjusted_strength,
    coldStartActive: row.a_cold_start_active
  });
  const fighterB = auditFighter({
    fighterId: row.fighter_b_id,
    fighterName: row.fighter_b_name,
    featureId: row.b_feature_id,
    featureJson: row.b_feature_json,
    proFights: row.b_pro_fights,
    ufcFights: row.b_ufc_fights,
    roundsFought: row.b_rounds_fought,
    slpm: row.b_slpm,
    sapm: row.b_sapm,
    strikingDifferential: row.b_striking_differential,
    takedownsPer15: row.b_takedowns_per_15,
    takedownDefensePct: row.b_takedown_defense_pct,
    submissionAttemptsPer15: row.b_submission_attempts_per_15,
    controlTimePct: row.b_control_time_pct,
    opponentAdjustedStrength: row.b_opponent_adjusted_strength,
    coldStartActive: row.b_cold_start_active
  });
  const blockedReasons = [
    !fighterA.ready ? `${fighterA.fighterName ?? fighterA.fighterId}: ${fighterA.missingCritical.join(", ") || (fighterA.coldStartActive ? "cold start" : "profile score too low")}` : null,
    !fighterB.ready ? `${fighterB.fighterName ?? fighterB.fighterId}: ${fighterB.missingCritical.join(", ") || (fighterB.coldStartActive ? "cold start" : "profile score too low")}` : null
  ].filter((item): item is string => Boolean(item));
  return {
    fightId: row.fight_id,
    eventLabel: row.event_label,
    fightDate: toIso(row.fight_date),
    fighterA,
    fighterB,
    ready: fighterA.ready && fighterB.ready,
    blockedReasons
  };
}

async function auditUpcomingFights(modelVersion: string, horizonDays: number, limit: number) {
  const rows = await prisma.$queryRaw<AuditRow[]>`
    SELECT
      f.id AS fight_id,
      f.event_label,
      f.fight_date,
      f.fighter_a_id,
      f.fighter_b_id,
      fa.full_name AS fighter_a_name,
      fb.full_name AS fighter_b_name,
      af.id AS a_feature_id,
      bf.id AS b_feature_id,
      af.pro_fights AS a_pro_fights,
      bf.pro_fights AS b_pro_fights,
      af.ufc_fights AS a_ufc_fights,
      bf.ufc_fights AS b_ufc_fights,
      af.rounds_fought AS a_rounds_fought,
      bf.rounds_fought AS b_rounds_fought,
      af.sig_strikes_landed_per_min AS a_slpm,
      bf.sig_strikes_landed_per_min AS b_slpm,
      af.sig_strikes_absorbed_per_min AS a_sapm,
      bf.sig_strikes_absorbed_per_min AS b_sapm,
      af.striking_differential AS a_striking_differential,
      bf.striking_differential AS b_striking_differential,
      af.takedowns_per_15 AS a_takedowns_per_15,
      bf.takedowns_per_15 AS b_takedowns_per_15,
      af.takedown_defense_pct AS a_takedown_defense_pct,
      bf.takedown_defense_pct AS b_takedown_defense_pct,
      af.submission_attempts_per_15 AS a_submission_attempts_per_15,
      bf.submission_attempts_per_15 AS b_submission_attempts_per_15,
      af.control_time_pct AS a_control_time_pct,
      bf.control_time_pct AS b_control_time_pct,
      af.opponent_adjusted_strength AS a_opponent_adjusted_strength,
      bf.opponent_adjusted_strength AS b_opponent_adjusted_strength,
      af.cold_start_active AS a_cold_start_active,
      bf.cold_start_active AS b_cold_start_active,
      af.feature_json AS a_feature_json,
      bf.feature_json AS b_feature_json
    FROM ufc_fights f
    LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    LEFT JOIN LATERAL (
      SELECT * FROM ufc_model_features mf
      WHERE mf.fight_id = f.id AND mf.fighter_id = f.fighter_a_id AND mf.model_version = ${modelVersion} AND mf.snapshot_at <= f.fight_date
      ORDER BY mf.snapshot_at DESC
      LIMIT 1
    ) af ON true
    LEFT JOIN LATERAL (
      SELECT * FROM ufc_model_features mf
      WHERE mf.fight_id = f.id AND mf.fighter_id = f.fighter_b_id AND mf.model_version = ${modelVersion} AND mf.snapshot_at <= f.fight_date
      ORDER BY mf.snapshot_at DESC
      LIMIT 1
    ) bf ON true
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND f.status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY f.fight_date ASC, f.bout_order NULLS LAST, f.event_label
    LIMIT ${limit};
  `;
  const fights = rows.map(auditFight);
  return {
    fightCount: fights.length,
    readyFights: fights.filter((fight) => fight.ready),
    blockedFights: fights.filter((fight) => !fight.ready),
    missingByFighter: fights.flatMap((fight) => [fight.fighterA, fight.fighterB])
      .filter((fighter) => !fighter.ready)
      .map((fighter) => ({ fighterId: fighter.fighterId, fighterName: fighter.fighterName, grade: fighter.grade, score: fighter.score, coldStartActive: fighter.coldStartActive, featureSource: fighter.featureSource, missingCritical: fighter.missingCritical }))
  };
}

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=prepare-sim-card" }, { status: 401 });
  }
  if (!hasUsableServerDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: "No usable server database URL is configured." }, { status: 500 });
  }

  const startedAt = new Date().toISOString();
  const url = new URL(request.url);
  const dryRun = boolParam(url, "dryRun", false);
  const skipBackfill = boolParam(url, "skipBackfill", false);
  const skipElite = boolParam(url, "skipElite", false);
  const skipFeatureBuild = boolParam(url, "skipFeatureBuild", false);
  const skipHydrate = boolParam(url, "skipHydrate", false);
  const simulate = boolParam(url, "simulate", false);
  const modelVersion = url.searchParams.get("modelVersion") || DEFAULT_MODEL_VERSION;
  const horizonDays = numberParam(url, "horizonDays", 120, 1, 365);
  const limit = numberParam(url, "limit", 25, 1, 100);
  const backfillLimit = numberParam(url, "backfillLimit", Math.max(40, limit * 2), 1, 100);
  const simulations = numberParam(url, "simulations", 25000, 1000, 100000);
  const seed = numberParam(url, "seed", 1287, 1, 2147483647);

  try {
    const before = await auditUpcomingFights(modelVersion, horizonDays, limit);
    const backfill = skipBackfill ? null : await backfillKnownUfcFighterStats({ limit: backfillLimit, horizonDays, dryRun });
    const eliteProfiles = skipElite ? null : await buildEliteUfcFighterProfiles({ modelVersion, limit: Math.max(backfillLimit, limit * 2), horizonDays, dryRun });
    const featureBuild = skipFeatureBuild ? null : await buildUfcModelFeaturesFromWarehouse({ modelVersion, limit, horizonDays, dryRun });
    const hydration = skipHydrate ? null : await hydrateUpcomingUfcFeatureSnapshots({ modelVersion, limit, horizonDays, dryRun });
    const after = await auditUpcomingFights(modelVersion, horizonDays, limit);
    const sim = simulate ? await runUfcUpcomingToSimPipeline({ dryRun, skipIngest: true, modelVersion, horizonDays, limit, simulations, seed, recordShadow: true, allowFallbackFeatures: false, forceRegenerate: true }) : null;

    const ok = (!backfill || backfill.ok) && (!eliteProfiles || eliteProfiles.ok) && (!featureBuild || featureBuild.ok) && (!hydration || hydration.ok) && (!sim || sim.ok);
    return NextResponse.json({
      ok,
      mode: dryRun ? "dry-run" : "repair",
      startedAt,
      finishedAt: new Date().toISOString(),
      config: { modelVersion, horizonDays, limit, backfillLimit, simulations, seed, skipBackfill, skipElite, skipFeatureBuild, skipHydrate, simulate, allowFallbackFeatures: false },
      before: { fightCount: before.fightCount, readyFightCount: before.readyFights.length, blockedFightCount: before.blockedFights.length, blockedFights: before.blockedFights },
      repair: {
        backfill,
        eliteProfiles,
        featureBuild,
        hydration
      },
      after: {
        fightCount: after.fightCount,
        readyFightCount: after.readyFights.length,
        blockedFightCount: after.blockedFights.length,
        readyFights: after.readyFights,
        blockedFights: after.blockedFights,
        missingByFighter: after.missingByFighter
      },
      sim,
      next: after.blockedFights.length > 0
        ? "Review after.missingByFighter, then rerun after adding missing fighter data."
        : simulate
          ? "/sim/ufc"
          : "Run again with &simulate=1 to generate operational sim outputs."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UFC sim profile repair failed";
    console.error("[admin/ufc/prepare-sim-card]", message);
    return NextResponse.json({ ok: false, error: message, startedAt, finishedAt: new Date().toISOString() }, { status: 500 });
  }
}
