import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  calculateMlbHitterOverall,
  calculateMlbPitcherOverall,
  classifyMlbHitterRole,
  classifyMlbStarterRole,
  ensureMlbRosterIntelligenceTables,
  type MlbHitterSkillInput,
  type MlbPitcherSkillInput
} from "@/services/simulation/mlb-roster-intelligence";

export type MlbHitterRatingPayload = MlbHitterSkillInput & {
  playerId?: string | null;
  playerName: string;
  team: string;
  season?: number | null;
  primaryPosition?: string | null;
  source?: string | null;
  metrics?: Record<string, unknown> | null;
};

export type MlbPitcherRatingPayload = MlbPitcherSkillInput & {
  pitcherId?: string | null;
  pitcherName: string;
  team: string;
  season?: number | null;
  source?: string | null;
  metrics?: Record<string, unknown> | null;
};

export type MlbLineupSnapshotPayload = {
  gameId: string;
  team: string;
  confirmed?: boolean | null;
  battingOrder?: Array<Record<string, unknown>> | null;
  bench?: Array<Record<string, unknown>> | null;
  startingPitcherId?: string | null;
  startingPitcherName?: string | null;
  availableRelievers?: Array<Record<string, unknown>> | null;
  unavailableRelievers?: Array<Record<string, unknown>> | null;
  injuries?: Array<Record<string, unknown>> | null;
  source?: string | null;
};

export type MlbRosterIntelligenceIngestPayload = {
  hitters?: MlbHitterRatingPayload[];
  pitchers?: MlbPitcherRatingPayload[];
  lineups?: MlbLineupSnapshotPayload[];
};

function currentSeason() {
  return new Date().getUTCFullYear();
}

function slugId(prefix: string, team: string, name: string) {
  const slug = `${team}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${prefix}:${slug || crypto.randomUUID()}`;
}

function safeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function insertHitterRating(payload: MlbHitterRatingPayload) {
  const team = safeText(payload.team, "UNKNOWN");
  const playerName = safeText(payload.playerName, "Unknown Player");
  const playerId = safeText(payload.playerId, slugId("hitter", team, playerName));
  const season = Number.isFinite(Number(payload.season)) ? Number(payload.season) : currentSeason();
  const overall = calculateMlbHitterOverall(payload);
  const roleTier = classifyMlbHitterRole(overall);
  await prisma.$executeRaw`
    INSERT INTO mlb_player_ratings (
      id, player_id, player_name, team, season, primary_position, role_tier,
      contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form, overall,
      metrics_json, source, snapshot_at
    ) VALUES (
      ${crypto.randomUUID()}, ${playerId}, ${playerName}, ${team}, ${season}, ${payload.primaryPosition ?? null}, ${roleTier},
      ${payload.contact}, ${payload.power}, ${payload.discipline}, ${payload.vsLhp}, ${payload.vsRhp}, ${payload.baserunning}, ${payload.fielding}, ${payload.currentForm}, ${overall},
      ${safeJson(payload.metrics)}::jsonb, ${payload.source ?? "manual-ingest"}, now()
    );
  `;
  return { playerId, playerName, team, season, overall, roleTier };
}

async function insertPitcherRating(payload: MlbPitcherRatingPayload) {
  const team = safeText(payload.team, "UNKNOWN");
  const pitcherName = safeText(payload.pitcherName, "Unknown Pitcher");
  const pitcherId = safeText(payload.pitcherId, slugId("pitcher", team, pitcherName));
  const season = Number.isFinite(Number(payload.season)) ? Number(payload.season) : currentSeason();
  const overall = calculateMlbPitcherOverall(payload);
  const roleTier = classifyMlbStarterRole(overall);
  await prisma.$executeRaw`
    INSERT INTO mlb_pitcher_ratings (
      id, pitcher_id, pitcher_name, team, season, role_tier,
      xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, overall,
      metrics_json, source, snapshot_at
    ) VALUES (
      ${crypto.randomUUID()}, ${pitcherId}, ${pitcherName}, ${team}, ${season}, ${roleTier},
      ${payload.xeraQuality}, ${payload.fipQuality}, ${payload.kBb}, ${payload.hrRisk}, ${payload.groundballRate}, ${payload.platoonSplit}, ${payload.stamina}, ${payload.recentWorkload}, ${payload.arsenalQuality}, ${overall},
      ${safeJson(payload.metrics)}::jsonb, ${payload.source ?? "manual-ingest"}, now()
    );
  `;
  return { pitcherId, pitcherName, team, season, overall, roleTier };
}

async function insertLineupSnapshot(payload: MlbLineupSnapshotPayload) {
  const team = safeText(payload.team, "UNKNOWN");
  const gameId = safeText(payload.gameId, "UNKNOWN_GAME");
  await prisma.$executeRaw`
    INSERT INTO mlb_lineup_snapshots (
      id, game_id, team, confirmed, batting_order_json, bench_json, starting_pitcher_id, starting_pitcher_name,
      available_relievers_json, unavailable_relievers_json, injuries_json, source, captured_at
    ) VALUES (
      ${crypto.randomUUID()}, ${gameId}, ${team}, ${payload.confirmed === true},
      ${safeJson(payload.battingOrder ?? [])}::jsonb,
      ${safeJson(payload.bench ?? [])}::jsonb,
      ${payload.startingPitcherId ?? null}, ${payload.startingPitcherName ?? null},
      ${safeJson(payload.availableRelievers ?? [])}::jsonb,
      ${safeJson(payload.unavailableRelievers ?? [])}::jsonb,
      ${safeJson(payload.injuries ?? [])}::jsonb,
      ${payload.source ?? "manual-ingest"}, now()
    );
  `;
  return { gameId, team, confirmed: payload.confirmed === true };
}

export async function ingestMlbRosterIntelligence(payload: MlbRosterIntelligenceIngestPayload) {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, databaseReady: false, error: "No usable server database URL is configured.", hitters: 0, pitchers: 0, lineups: 0 };
  }
  const databaseReady = await ensureMlbRosterIntelligenceTables();
  if (!databaseReady) {
    return { ok: false, databaseReady, error: "Unable to initialize MLB roster intelligence tables.", hitters: 0, pitchers: 0, lineups: 0 };
  }

  const hitterResults = [];
  for (const hitter of payload.hitters ?? []) hitterResults.push(await insertHitterRating(hitter));

  const pitcherResults = [];
  for (const pitcher of payload.pitchers ?? []) pitcherResults.push(await insertPitcherRating(pitcher));

  const lineupResults = [];
  for (const lineup of payload.lineups ?? []) lineupResults.push(await insertLineupSnapshot(lineup));

  return {
    ok: true,
    databaseReady,
    hitters: hitterResults.length,
    pitchers: pitcherResults.length,
    lineups: lineupResults.length,
    hitterResults: hitterResults.slice(0, 20),
    pitcherResults: pitcherResults.slice(0, 20),
    lineupResults: lineupResults.slice(0, 20)
  };
}

export function mlbRosterIntelligenceSamplePayload(): MlbRosterIntelligenceIngestPayload {
  return {
    hitters: [{
      playerName: "Example Star Hitter",
      team: "Example",
      contact: 86,
      power: 91,
      discipline: 82,
      vsLhp: 84,
      vsRhp: 88,
      baserunning: 68,
      fielding: 70,
      currentForm: 87,
      source: "sample"
    }],
    pitchers: [{
      pitcherName: "Example Ace",
      team: "Example",
      xeraQuality: 90,
      fipQuality: 88,
      kBb: 86,
      hrRisk: 22,
      groundballRate: 70,
      platoonSplit: 78,
      stamina: 84,
      recentWorkload: 20,
      arsenalQuality: 90,
      source: "sample"
    }],
    lineups: [{
      gameId: "example-game-id",
      team: "Example",
      confirmed: false,
      battingOrder: [],
      bench: [],
      availableRelievers: [],
      unavailableRelievers: [],
      injuries: [],
      source: "sample"
    }]
  };
}
