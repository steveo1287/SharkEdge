import { prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { ensureMlbIntelV7Ledgers } from "@/services/simulation/mlb-intel-v7-ledgers";
import type { MlbIntelV7ProbabilityResult } from "@/services/simulation/mlb-intel-v7-probability";
import { buildMainSimProjection } from "@/services/simulation/main-sim-brain";
import type { MlbPremiumPickPolicyResult } from "@/services/simulation/mlb-premium-pick-policy";

type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
  scoreboard?: string | null;
};

type RuntimeMlbIntel = NonNullable<Awaited<ReturnType<typeof buildMainSimProjection>>["mlbIntel"]> & {
  v7?: MlbIntelV7ProbabilityResult;
  premiumPolicy?: MlbPremiumPickPolicyResult;
  mainBrain?: unknown;
};

const MODEL_VERSION = "main-sim-brain-v1";

function parseMatchup(label: string) {
  const atSplit = label.split(" @ ");
  if (atSplit.length === 2) return { away: atSplit[0]?.trim() || "Away", home: atSplit[1]?.trim() || "Home" };
  const vsSplit = label.split(" vs ");
  if (vsSplit.length === 2) return { away: vsSplit[0]?.trim() || "Away", home: vsSplit[1]?.trim() || "Home" };
  return { away: "Away", home: "Home" };
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function sideProbabilityFromHome(side: "HOME" | "AWAY", homeProbability: number) {
  return side === "HOME" ? homeProbability : 1 - homeProbability;
}

async function fetchMlbGames() {
  const sections = await buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null });
  return sections.flatMap((section) => section.leagueKey === "MLB"
    ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))
    : []) as SimGame[];
}

async function insertSnapshot(args: {
  game: SimGame;
  side: "HOME" | "AWAY";
  rawSideProbability: number;
  calibratedSideProbability: number;
  marketSideProbability: number | null;
  edge: number | null;
  predictionJson: Record<string, unknown>;
}) {
  const matchup = parseMatchup(args.game.label);
  const capturedAt = new Date();
  const snapshotKey = `MLB:${args.game.id}:moneyline:${MODEL_VERSION}:${capturedAt.toISOString().slice(0, 13)}`;
  await prisma.$executeRaw`
    INSERT INTO mlb_model_snapshot_ledger (
      id, snapshot_key, game_id, event_label, away_team, home_team, start_time, market, side, model_version,
      captured_at, raw_probability, calibrated_probability, market_no_vig_probability, edge, prediction_json
    ) VALUES (
      ${crypto.randomUUID()}, ${snapshotKey}, ${args.game.id}, ${args.game.label}, ${matchup.away}, ${matchup.home}, ${new Date(args.game.startTime)}, 'moneyline', ${args.side}, ${MODEL_VERSION},
      ${capturedAt}, ${args.rawSideProbability}, ${args.calibratedSideProbability}, ${args.marketSideProbability}, ${args.edge}, ${safeJson(args.predictionJson)}::jsonb
    )
    ON CONFLICT (snapshot_key) DO UPDATE SET
      captured_at = EXCLUDED.captured_at,
      raw_probability = EXCLUDED.raw_probability,
      calibrated_probability = EXCLUDED.calibrated_probability,
      market_no_vig_probability = EXCLUDED.market_no_vig_probability,
      edge = EXCLUDED.edge,
      prediction_json = EXCLUDED.prediction_json,
      updated_at = now();
  `;
}

async function insertOfficialPick(args: {
  game: SimGame;
  side: "HOME" | "AWAY";
  rawSideProbability: number;
  calibratedSideProbability: number;
  marketSideProbability: number | null;
  edge: number | null;
  predictionJson: Record<string, unknown>;
}) {
  const matchup = parseMatchup(args.game.label);
  const capturedAt = new Date();
  await prisma.$executeRaw`
    INSERT INTO mlb_official_pick_ledger (
      id, game_id, event_label, away_team, home_team, start_time, market, side, model_version,
      captured_at, released_at, raw_probability, calibrated_probability, market_no_vig_probability, edge, prediction_json
    ) VALUES (
      ${crypto.randomUUID()}, ${args.game.id}, ${args.game.label}, ${matchup.away}, ${matchup.home}, ${new Date(args.game.startTime)}, 'moneyline', ${args.side}, ${MODEL_VERSION},
      ${capturedAt}, ${capturedAt}, ${args.rawSideProbability}, ${args.calibratedSideProbability}, ${args.marketSideProbability}, ${args.edge}, ${safeJson(args.predictionJson)}::jsonb
    )
    ON CONFLICT (game_id, market, side, model_version) DO UPDATE SET
      captured_at = EXCLUDED.captured_at,
      raw_probability = EXCLUDED.raw_probability,
      calibrated_probability = EXCLUDED.calibrated_probability,
      market_no_vig_probability = EXCLUDED.market_no_vig_probability,
      edge = EXCLUDED.edge,
      prediction_json = EXCLUDED.prediction_json,
      updated_at = now();
  `;
}

export async function captureCurrentMlbPremiumLedgers() {
  const databaseReady = await ensureMlbIntelV7Ledgers();
  if (!databaseReady) {
    return { ok: false, databaseReady, capturedSnapshots: 0, officialPicks: 0, skipped: 0, premiumBlocked: 0, error: "No usable server database URL is configured." };
  }

  const games = await fetchMlbGames();
  let capturedSnapshots = 0;
  let officialPicks = 0;
  let premiumBlocked = 0;
  let skipped = 0;

  for (const game of games) {
    if (game.status === "FINAL" || game.status === "POSTPONED" || game.status === "CANCELED") {
      skipped += 1;
      continue;
    }

    const projection = await buildMainSimProjection(game);
    const mlbIntel = (projection.mlbIntel ?? null) as RuntimeMlbIntel | null;
    const v7 = mlbIntel?.v7;
    const premiumPolicy = mlbIntel?.premiumPolicy;
    if (!v7) {
      skipped += 1;
      continue;
    }

    const snapshotSide: "HOME" | "AWAY" = v7.finalHomeWinPct >= 0.5 ? "HOME" : "AWAY";
    const rawSideProbability = sideProbabilityFromHome(snapshotSide, v7.rawHomeWinPct);
    const calibratedSideProbability = sideProbabilityFromHome(snapshotSide, v7.finalHomeWinPct);
    const marketSideProbability = v7.marketHomeNoVigProbability == null ? null : sideProbabilityFromHome(snapshotSide, v7.marketHomeNoVigProbability);
    const edge = marketSideProbability == null ? null : round(calibratedSideProbability - marketSideProbability, 4);
    const predictionJson = {
      version: "main-sim-brain-v1+premium-policy",
      gameId: game.id,
      eventLabel: game.label,
      matchup: projection.matchup,
      distribution: projection.distribution,
      mainBrain: mlbIntel?.mainBrain ?? null,
      premiumPolicy: premiumPolicy ?? null,
      v7,
      mlbIntel: {
        modelVersion: mlbIntel?.modelVersion ?? null,
        dataSource: mlbIntel?.dataSource ?? null,
        playerImpact: mlbIntel?.playerImpact ?? null,
        premiumPolicy: premiumPolicy ?? null,
        market: mlbIntel?.market ?? null,
        governor: mlbIntel?.governor ?? null,
        calibration: mlbIntel?.calibration ?? null,
        uncertainty: mlbIntel?.uncertainty ?? null,
        lock: mlbIntel?.lock ?? null,
        runModel: mlbIntel?.runModel ?? null,
        factors: mlbIntel?.factors ?? null,
        features: mlbIntel?.features ?? null
      }
    };

    await insertSnapshot({ game, side: snapshotSide, rawSideProbability, calibratedSideProbability, marketSideProbability, edge, predictionJson });
    capturedSnapshots += 1;

    if (premiumPolicy?.pickSide && !premiumPolicy.noBet) {
      const officialSide = premiumPolicy.pickSide;
      const officialRawProbability = sideProbabilityFromHome(officialSide, v7.rawHomeWinPct);
      const officialCalibratedProbability = sideProbabilityFromHome(officialSide, v7.finalHomeWinPct);
      const officialMarketProbability = v7.marketHomeNoVigProbability == null ? null : sideProbabilityFromHome(officialSide, v7.marketHomeNoVigProbability);
      const officialEdge = officialMarketProbability == null ? null : round(officialCalibratedProbability - officialMarketProbability, 4);
      await insertOfficialPick({ game, side: officialSide, rawSideProbability: officialRawProbability, calibratedSideProbability: officialCalibratedProbability, marketSideProbability: officialMarketProbability, edge: officialEdge, predictionJson });
      officialPicks += 1;
    } else {
      premiumBlocked += 1;
    }
  }

  return { ok: true, databaseReady, capturedSnapshots, officialPicks, premiumBlocked, skipped, modelVersion: MODEL_VERSION };
}
