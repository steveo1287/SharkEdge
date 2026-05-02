import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { getNbaRotationLock, type NbaRotationLock } from "@/services/simulation/nba-rotation-lock";
import { buildNbaWinnerConfidence, type NbaWinnerConfidence } from "@/services/simulation/nba-winner-confidence";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };

export type NbaSimControlSnapshot = {
  ok: boolean;
  generatedAt: string;
  gameId: string;
  eventLabel: string;
  matchup: { away: string; home: string };
  rotationLock: NbaRotationLock | null;
  winnerConfidence: NbaWinnerConfidence | null;
  formula: {
    version: "nba-sim-control-v1";
    model: string;
    inputs: string[];
    notes: string[];
  };
  error?: string;
};

function parseMatchup(label: string) {
  const at = label.split(" @ ");
  if (at.length === 2) return { away: at[0]?.trim() || "Away", home: at[1]?.trim() || "Home" };
  const vs = label.split(" vs ");
  if (vs.length === 2) return { away: vs[0]?.trim() || "Away", home: vs[1]?.trim() || "Home" };
  return { away: "Away", home: "Home" };
}

async function findGame(gameId: string): Promise<SimGame | null> {
  const sections = await buildBoardSportSections({ selectedLeague: "NBA", gamesByLeague: {}, maxScoreboardGames: null });
  const games: SimGame[] = sections.flatMap((section) =>
    section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))
  );
  return games.find((game) => game.id === gameId) ?? null;
}

export async function buildNbaSimControlForGame(game: SimGame): Promise<NbaSimControlSnapshot> {
  const projection = await buildSimProjection(game);
  const matchup = projection.matchup ?? parseMatchup(game.label);
  const rotationLock = await getNbaRotationLock(matchup.away, matchup.home);

  if (!projection.realityIntel) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      gameId: game.id,
      eventLabel: game.label,
      matchup,
      rotationLock,
      winnerConfidence: null,
      formula: baseFormula(),
      error: "NBA real-data reality intelligence is unavailable for this game."
    };
  }

  const winnerConfidence = buildNbaWinnerConfidence({
    homeWinPct: projection.distribution.homeWinPct,
    awayWinPct: projection.distribution.awayWinPct,
    realityIntel: projection.realityIntel,
    rotationLock
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    gameId: game.id,
    eventLabel: game.label,
    matchup,
    rotationLock,
    winnerConfidence,
    formula: baseFormula()
  };
}

function baseFormula(): NbaSimControlSnapshot["formula"] {
  return {
    version: "nba-sim-control-v1",
    model: "calibrated probability = market-aware model probability + learned/history correction + rotation certainty gate",
    inputs: [
      "team efficiency and net rating",
      "player impact and projected minutes",
      "rotation availability and usage redistribution",
      "four-factor style shot/turnover/rebound/free-throw matchup components",
      "rest/travel/location/context factors",
      "no-vig market probability baseline",
      "learned calibration and graded-pick history tuner",
      "volatility and source-health penalties"
    ],
    notes: [
      "Confidence is separated from win probability.",
      "Low lineup certainty, high usage redistribution, missing market baseline, and calibration-pass flags force lower confidence.",
      "This layer does not replace the existing projection engine; it governs whether the NBA winner signal is trustworthy enough to surface."
    ]
  };
}

export async function getNbaSimControl(gameId: string): Promise<NbaSimControlSnapshot> {
  const game = await findGame(gameId);
  if (!game) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      gameId,
      eventLabel: gameId,
      matchup: { away: "Away", home: "Home" },
      rotationLock: null,
      winnerConfidence: null,
      formula: baseFormula(),
      error: "NBA game not found in current board data."
    };
  }
  return buildNbaSimControlForGame(game);
}
