export type NflConference = "AFC" | "NFC";

export type NflQuarterbackScenario = {
  starterProbability?: number;
  starterAdjustment?: number;
  backupAdjustment?: number;
};

export type NflSeasonTeamInput = {
  id: string;
  name: string;
  abbreviation?: string | null;
  conference: NflConference;
  division: string;
  /** Accepts either a normalized 0..1 power score or an Elo-style rating. */
  powerRating: number;
  offenseAdjustment?: number;
  defenseAdjustment?: number;
  quarterback?: NflQuarterbackScenario;
};

export type NflCompletedGameResult = {
  homeScore: number;
  awayScore: number;
};

export type NflSeasonGameInput = {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  neutralSite?: boolean;
  homeWinProbability?: number;
  tieProbability?: number;
  completedResult?: NflCompletedGameResult | null;
  homeRatingAdjustment?: number;
  awayRatingAdjustment?: number;
  homeQuarterbackStarterProbability?: number;
  awayQuarterbackStarterProbability?: number;
};

export type NflSeasonProjectionInput = {
  teams: NflSeasonTeamInput[];
  games: NflSeasonGameInput[];
  iterations?: number;
  seed?: number;
  homeFieldRating?: number;
};

export type NflProjectedRecord = {
  wins: number;
  losses: number;
  ties: number;
  probabilityPct: number;
};

export type NflTeamSeasonProjection = {
  teamId: string;
  teamName: string;
  abbreviation: string | null;
  conference: NflConference;
  division: string;
  scheduledGames: number;
  meanWins: number;
  meanLosses: number;
  meanTies: number;
  medianWins: number;
  winRange: { p10: number; p90: number };
  mostLikelyRecord: NflProjectedRecord;
  recordDistributionPct: Record<string, number>;
  divisionOddsPct: number;
  playoffOddsPct: number;
  seedOddsPct: Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", number>;
  conferenceTitleOddsPct: number;
  superBowlOddsPct: number;
};

export type NflSeasonProjectionOutput = {
  generatedAt: string;
  iterations: number;
  seed: number;
  teams: NflTeamSeasonProjection[];
  audit: {
    scheduleGames: number;
    totalGameSimulations: number;
    teamGameCounts: Record<string, number>;
    expectedLeagueWins: number;
    expectedLeagueLosses: number;
    expectedTeamTies: number;
    expectedTeamGames: number;
    expectedTeamGamesTarget: number;
    scheduleBalanceDelta: number;
    tiebreakerVersion: "nfl-order-v1";
    postseasonFormat: "14-team-reseeded-v1";
  };
};

type GameLedgerEntry = {
  opponentId: string;
  result: 0 | 0.5 | 1;
  isDivision: boolean;
  isConference: boolean;
};

type StandingState = {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  games: GameLedgerEntry[];
};

type TeamAccumulator = {
  wins: number[];
  losses: number[];
  ties: number[];
  recordCounts: Map<string, number>;
  divisionTitles: number;
  playoffBerths: number;
  seedCounts: number[];
  conferenceTitles: number;
  superBowlTitles: number;
};

type SeededTeam = { team: NflSeasonTeamInput; seed: number };
type RandomSource = () => number;

const DEFAULT_ITERATIONS = 5_000;
const MAX_ITERATIONS = 50_000;
const DEFAULT_HOME_FIELD_RATING = 55;
const DEFAULT_TIE_PROBABILITY = 0.004;
const PLAYOFF_SEEDS = 7;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function hashSeed(seed: number) {
  let value = seed | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function mulberry32(seed: number): RandomSource {
  let state = hashSeed(seed || 1);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizePowerRating(value: number) {
  if (!Number.isFinite(value)) return 1500;
  if (value >= 0 && value <= 1) return 1500 + (value - 0.5) * 800;
  return value;
}

function teamBaseRating(team: NflSeasonTeamInput) {
  return normalizePowerRating(team.powerRating)
    + (team.offenseAdjustment ?? 0)
    - (team.defenseAdjustment ?? 0);
}

function sampleQuarterbackAdjustment(
  team: NflSeasonTeamInput,
  random: RandomSource,
  probabilityOverride?: number
) {
  const scenario = team.quarterback;
  if (!scenario) return 0;
  const probability = clamp(
    probabilityOverride ?? scenario.starterProbability ?? 1,
    0,
    1
  );
  return random() < probability
    ? scenario.starterAdjustment ?? 0
    : scenario.backupAdjustment ?? -90;
}

function logisticWinProbability(ratingDifference: number) {
  return 1 / (1 + 10 ** (-ratingDifference / 400));
}

function regularSeasonProbabilities(
  game: NflSeasonGameInput,
  home: NflSeasonTeamInput,
  away: NflSeasonTeamInput,
  random: RandomSource,
  homeFieldRating: number
) {
  const tieProbability = clamp(
    game.tieProbability ?? DEFAULT_TIE_PROBABILITY,
    0,
    0.2
  );

  if (typeof game.homeWinProbability === "number") {
    const homeConditional = clamp(game.homeWinProbability, 0.01, 0.99);
    return {
      homeWin: homeConditional * (1 - tieProbability),
      awayWin: (1 - homeConditional) * (1 - tieProbability),
      tie: tieProbability
    };
  }

  const homeQb = sampleQuarterbackAdjustment(
    home,
    random,
    game.homeQuarterbackStarterProbability
  );
  const awayQb = sampleQuarterbackAdjustment(
    away,
    random,
    game.awayQuarterbackStarterProbability
  );
  const venueAdjustment = game.neutralSite ? 0 : homeFieldRating;
  const difference =
    teamBaseRating(home)
    + homeQb
    + venueAdjustment
    + (game.homeRatingAdjustment ?? 0)
    - teamBaseRating(away)
    - awayQb
    - (game.awayRatingAdjustment ?? 0);
  const homeConditional = logisticWinProbability(difference);

  return {
    homeWin: homeConditional * (1 - tieProbability),
    awayWin: (1 - homeConditional) * (1 - tieProbability),
    tie: tieProbability
  };
}

function postseasonHomeWinProbability(
  home: NflSeasonTeamInput,
  away: NflSeasonTeamInput,
  random: RandomSource,
  homeFieldRating: number,
  neutralSite: boolean
) {
  const difference =
    teamBaseRating(home)
    + sampleQuarterbackAdjustment(home, random)
    + (neutralSite ? 0 : homeFieldRating)
    - teamBaseRating(away)
    - sampleQuarterbackAdjustment(away, random);
  return logisticWinProbability(difference);
}

function createStanding(teamId: string): StandingState {
  return {
    teamId,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    games: []
  };
}

function winPct(standing: StandingState) {
  const games = standing.wins + standing.losses + standing.ties;
  return games ? (standing.wins + standing.ties * 0.5) / games : 0;
}

function subsetPct(
  entries: GameLedgerEntry[],
  predicate: (entry: GameLedgerEntry) => boolean
) {
  const selected = entries.filter(predicate);
  if (!selected.length) return null;
  return selected.reduce((sum, entry) => sum + entry.result, 0) / selected.length;
}

function headToHeadPct(standing: StandingState, opponentId: string) {
  return subsetPct(standing.games, (entry) => entry.opponentId === opponentId);
}

function divisionPct(standing: StandingState) {
  return subsetPct(standing.games, (entry) => entry.isDivision);
}

function conferencePct(standing: StandingState) {
  return subsetPct(standing.games, (entry) => entry.isConference);
}

function commonGamesPct(left: StandingState, right: StandingState) {
  const leftOpponents = new Set(left.games.map((entry) => entry.opponentId));
  const rightOpponents = new Set(right.games.map((entry) => entry.opponentId));
  const common = new Set(
    [...leftOpponents].filter((opponent) => rightOpponents.has(opponent))
  );
  const leftGames = left.games.filter((entry) => common.has(entry.opponentId));
  const rightGames = right.games.filter((entry) => common.has(entry.opponentId));
  if (leftGames.length < 4 || rightGames.length < 4) return null;
  return {
    left: leftGames.reduce((sum, entry) => sum + entry.result, 0) / leftGames.length,
    right: rightGames.reduce((sum, entry) => sum + entry.result, 0) / rightGames.length
  };
}

function opponentWinPct(opponentId: string, standings: Map<string, StandingState>) {
  return winPct(standings.get(opponentId) ?? createStanding(opponentId));
}

function strengthOfSchedule(
  standing: StandingState,
  standings: Map<string, StandingState>
) {
  if (!standing.games.length) return 0;
  return standing.games.reduce(
    (sum, game) => sum + opponentWinPct(game.opponentId, standings),
    0
  ) / standing.games.length;
}

function strengthOfVictory(
  standing: StandingState,
  standings: Map<string, StandingState>
) {
  const weightedWins = standing.games.filter((game) => game.result > 0);
  const weight = weightedWins.reduce((sum, game) => sum + game.result, 0);
  if (!weight) return 0;
  return weightedWins.reduce(
    (sum, game) => sum + opponentWinPct(game.opponentId, standings) * game.result,
    0
  ) / weight;
}

function pointDifferential(standing: StandingState) {
  return standing.pointsFor - standing.pointsAgainst;
}

function compareMetric(left: number | null, right: number | null) {
  if (left === null || right === null) return 0;
  const difference = left - right;
  if (Math.abs(difference) < 1e-9) return 0;
  return difference > 0 ? -1 : 1;
}

function compareTeams(
  left: NflSeasonTeamInput,
  right: NflSeasonTeamInput,
  standings: Map<string, StandingState>,
  mode: "division" | "conference"
) {
  const leftStanding = standings.get(left.id)!;
  const rightStanding = standings.get(right.id)!;

  let result = compareMetric(winPct(leftStanding), winPct(rightStanding));
  if (result) return result;

  result = compareMetric(
    headToHeadPct(leftStanding, right.id),
    headToHeadPct(rightStanding, left.id)
  );
  if (result) return result;

  if (mode === "division" || left.division === right.division) {
    result = compareMetric(divisionPct(leftStanding), divisionPct(rightStanding));
    if (result) return result;
  }

  const common = commonGamesPct(leftStanding, rightStanding);
  if (common) {
    result = compareMetric(common.left, common.right);
    if (result) return result;
  }

  result = compareMetric(conferencePct(leftStanding), conferencePct(rightStanding));
  if (result) return result;

  result = compareMetric(
    strengthOfVictory(leftStanding, standings),
    strengthOfVictory(rightStanding, standings)
  );
  if (result) return result;

  result = compareMetric(
    strengthOfSchedule(leftStanding, standings),
    strengthOfSchedule(rightStanding, standings)
  );
  if (result) return result;

  result = compareMetric(
    pointDifferential(leftStanding),
    pointDifferential(rightStanding)
  );
  if (result) return result;

  result = compareMetric(teamBaseRating(left), teamBaseRating(right));
  if (result) return result;

  return left.id.localeCompare(right.id);
}

function scoreForResult(
  homeWon: boolean,
  awayWon: boolean,
  tie: boolean,
  homeRating: number,
  awayRating: number
) {
  if (tie) return { homeScore: 23, awayScore: 23 };
  const expectedMargin = clamp((homeRating - awayRating) / 28, -17, 17);
  const winnerBase = 24 + Math.round(Math.abs(expectedMargin) * 0.35);
  const loserBase = Math.max(
    6,
    winnerBase - Math.max(1, Math.round(Math.abs(expectedMargin) + 3))
  );
  return homeWon
    ? { homeScore: winnerBase, awayScore: loserBase }
    : awayWon
      ? { homeScore: loserBase, awayScore: winnerBase }
      : { homeScore: 23, awayScore: 23 };
}

function applyGameResult(
  home: NflSeasonTeamInput,
  away: NflSeasonTeamInput,
  standings: Map<string, StandingState>,
  outcome: NflCompletedGameResult
) {
  const homeStanding = standings.get(home.id)!;
  const awayStanding = standings.get(away.id)!;
  const isDivision = home.division === away.division && home.conference === away.conference;
  const isConference = home.conference === away.conference;
  const homeWon = outcome.homeScore > outcome.awayScore;
  const awayWon = outcome.awayScore > outcome.homeScore;
  const tie = !homeWon && !awayWon;

  if (homeWon) {
    homeStanding.wins += 1;
    awayStanding.losses += 1;
  } else if (awayWon) {
    awayStanding.wins += 1;
    homeStanding.losses += 1;
  } else {
    homeStanding.ties += 1;
    awayStanding.ties += 1;
  }

  homeStanding.pointsFor += outcome.homeScore;
  homeStanding.pointsAgainst += outcome.awayScore;
  awayStanding.pointsFor += outcome.awayScore;
  awayStanding.pointsAgainst += outcome.homeScore;

  homeStanding.games.push({
    opponentId: away.id,
    result: tie ? 0.5 : homeWon ? 1 : 0,
    isDivision,
    isConference
  });
  awayStanding.games.push({
    opponentId: home.id,
    result: tie ? 0.5 : awayWon ? 1 : 0,
    isDivision,
    isConference
  });
}

function rankConference(
  conference: NflConference,
  teams: NflSeasonTeamInput[],
  standings: Map<string, StandingState>
) {
  const conferenceTeams = teams.filter((team) => team.conference === conference);
  const divisions = new Map<string, NflSeasonTeamInput[]>();
  for (const team of conferenceTeams) {
    const group = divisions.get(team.division) ?? [];
    group.push(team);
    divisions.set(team.division, group);
  }

  const divisionWinners = [...divisions.values()]
    .map((divisionTeams) => [...divisionTeams].sort((left, right) =>
      compareTeams(left, right, standings, "division")
    )[0])
    .filter((team): team is NflSeasonTeamInput => Boolean(team))
    .sort((left, right) => compareTeams(left, right, standings, "conference"));

  const winnerIds = new Set(divisionWinners.map((team) => team.id));
  const wildCards = conferenceTeams
    .filter((team) => !winnerIds.has(team.id))
    .sort((left, right) => compareTeams(left, right, standings, "conference"));

  const seeded: SeededTeam[] = [];
  for (const team of divisionWinners.slice(0, 4)) {
    seeded.push({ team, seed: seeded.length + 1 });
  }
  for (const team of wildCards) {
    if (seeded.length >= PLAYOFF_SEEDS) break;
    seeded.push({ team, seed: seeded.length + 1 });
  }

  return { divisionWinners, seeded };
}

function simulatePostseasonGame(
  home: SeededTeam,
  away: SeededTeam,
  random: RandomSource,
  homeFieldRating: number,
  neutralSite = false
) {
  const homeProbability = postseasonHomeWinProbability(
    home.team,
    away.team,
    random,
    homeFieldRating,
    neutralSite
  );
  return random() < homeProbability ? home : away;
}

function simulateConferencePostseason(
  seeded: SeededTeam[],
  random: RandomSource,
  homeFieldRating: number
) {
  if (seeded.length < PLAYOFF_SEEDS) return null;
  const bySeed = new Map(seeded.map((entry) => [entry.seed, entry]));
  const one = bySeed.get(1)!;
  const wildCardWinners = [
    simulatePostseasonGame(bySeed.get(2)!, bySeed.get(7)!, random, homeFieldRating),
    simulatePostseasonGame(bySeed.get(3)!, bySeed.get(6)!, random, homeFieldRating),
    simulatePostseasonGame(bySeed.get(4)!, bySeed.get(5)!, random, homeFieldRating)
  ];

  const divisionalField = [one, ...wildCardWinners]
    .sort((left, right) => left.seed - right.seed);
  const lowestRemaining = divisionalField[divisionalField.length - 1];
  const firstDivisionalWinner = simulatePostseasonGame(
    one,
    lowestRemaining,
    random,
    homeFieldRating
  );
  const middle = divisionalField.filter(
    (entry) => entry.team.id !== one.team.id && entry.team.id !== lowestRemaining.team.id
  );
  const secondDivisionalWinner = simulatePostseasonGame(
    middle[0],
    middle[1],
    random,
    homeFieldRating
  );
  const championshipField = [firstDivisionalWinner, secondDivisionalWinner]
    .sort((left, right) => left.seed - right.seed);
  return simulatePostseasonGame(
    championshipField[0],
    championshipField[1],
    random,
    homeFieldRating
  );
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.ceil(quantile * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index];
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function validateInput(input: NflSeasonProjectionInput) {
  if (!input || !Array.isArray(input.teams) || !Array.isArray(input.games)) {
    throw new Error("teams and games arrays are required");
  }
  if (input.teams.length < 14) {
    throw new Error("NFL season projection requires at least 14 teams");
  }

  const teamIds = new Set<string>();
  const conferenceCounts: Record<NflConference, number> = { AFC: 0, NFC: 0 };
  for (const team of input.teams) {
    if (!team.id || !team.name || !team.division) {
      throw new Error("every team requires id, name, conference, and division");
    }
    if (team.conference !== "AFC" && team.conference !== "NFC") {
      throw new Error(`invalid conference for team ${team.id}`);
    }
    if (teamIds.has(team.id)) throw new Error(`duplicate team id: ${team.id}`);
    if (!Number.isFinite(team.powerRating)) {
      throw new Error(`invalid powerRating for team ${team.id}`);
    }
    teamIds.add(team.id);
    conferenceCounts[team.conference] += 1;
  }
  if (conferenceCounts.AFC < 7 || conferenceCounts.NFC < 7) {
    throw new Error("each conference requires at least seven teams");
  }
  for (const conference of ["AFC", "NFC"] as const) {
    const divisionCount = new Set(
      input.teams
        .filter((team) => team.conference === conference)
        .map((team) => team.division)
    ).size;
    if (divisionCount !== 4) {
      throw new Error(`${conference} requires exactly four divisions`);
    }
  }

  const gameIds = new Set<string>();
  for (const game of input.games) {
    if (!game.id) throw new Error("every game requires an id");
    if (gameIds.has(game.id)) throw new Error(`duplicate game id: ${game.id}`);
    gameIds.add(game.id);
    if (!teamIds.has(game.homeTeamId) || !teamIds.has(game.awayTeamId)) {
      throw new Error(`unknown team in game ${game.id}`);
    }
    if (game.homeTeamId === game.awayTeamId) {
      throw new Error(`game ${game.id} cannot use the same team twice`);
    }
    if (game.completedResult) {
      const { homeScore, awayScore } = game.completedResult;
      if (
        !Number.isFinite(homeScore)
        || !Number.isFinite(awayScore)
        || homeScore < 0
        || awayScore < 0
      ) {
        throw new Error(`invalid completed result for game ${game.id}`);
      }
    }
  }
}

function emptyAccumulator(): TeamAccumulator {
  return {
    wins: [],
    losses: [],
    ties: [],
    recordCounts: new Map<string, number>(),
    divisionTitles: 0,
    playoffBerths: 0,
    seedCounts: Array.from({ length: PLAYOFF_SEEDS + 1 }, () => 0),
    conferenceTitles: 0,
    superBowlTitles: 0
  };
}

export function simulateNflSeason(
  input: NflSeasonProjectionInput
): NflSeasonProjectionOutput {
  validateInput(input);
  const iterations = Math.floor(
    clamp(input.iterations ?? DEFAULT_ITERATIONS, 1, MAX_ITERATIONS)
  );
  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed!) : 20260818;
  const homeFieldRating = clamp(
    input.homeFieldRating ?? DEFAULT_HOME_FIELD_RATING,
    0,
    120
  );
  const random = mulberry32(seed);
  const teamsById = new Map(input.teams.map((team) => [team.id, team]));
  const teamGameCounts: Record<string, number> = Object.fromEntries(
    input.teams.map((team) => [team.id, 0])
  );
  for (const game of input.games) {
    teamGameCounts[game.homeTeamId] += 1;
    teamGameCounts[game.awayTeamId] += 1;
  }

  const accumulators = new Map(
    input.teams.map((team) => [team.id, emptyAccumulator()])
  );
  const orderedGames = [...input.games].sort((left, right) =>
    left.week - right.week || left.id.localeCompare(right.id)
  );

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const standings = new Map(
      input.teams.map((team) => [team.id, createStanding(team.id)])
    );

    for (const game of orderedGames) {
      const home = teamsById.get(game.homeTeamId)!;
      const away = teamsById.get(game.awayTeamId)!;
      let outcome: NflCompletedGameResult;

      if (game.completedResult) {
        outcome = game.completedResult;
      } else {
        const probabilities = regularSeasonProbabilities(
          game,
          home,
          away,
          random,
          homeFieldRating
        );
        const roll = random();
        const homeWon = roll < probabilities.homeWin;
        const tie = !homeWon && roll < probabilities.homeWin + probabilities.tie;
        const awayWon = !homeWon && !tie;
        outcome = scoreForResult(
          homeWon,
          awayWon,
          tie,
          teamBaseRating(home),
          teamBaseRating(away)
        );
      }

      applyGameResult(home, away, standings, outcome);
    }

    const afc = rankConference("AFC", input.teams, standings);
    const nfc = rankConference("NFC", input.teams, standings);

    for (const team of input.teams) {
      const standing = standings.get(team.id)!;
      const accumulator = accumulators.get(team.id)!;
      accumulator.wins.push(standing.wins);
      accumulator.losses.push(standing.losses);
      accumulator.ties.push(standing.ties);
      const recordKey = `${standing.wins}-${standing.losses}-${standing.ties}`;
      accumulator.recordCounts.set(
        recordKey,
        (accumulator.recordCounts.get(recordKey) ?? 0) + 1
      );
    }

    for (const conference of [afc, nfc]) {
      for (const winner of conference.divisionWinners) {
        accumulators.get(winner.id)!.divisionTitles += 1;
      }
      for (const seeded of conference.seeded) {
        const accumulator = accumulators.get(seeded.team.id)!;
        accumulator.playoffBerths += 1;
        accumulator.seedCounts[seeded.seed] += 1;
      }
    }

    const afcChampion = simulateConferencePostseason(
      afc.seeded,
      random,
      homeFieldRating
    );
    const nfcChampion = simulateConferencePostseason(
      nfc.seeded,
      random,
      homeFieldRating
    );
    if (afcChampion && nfcChampion) {
      accumulators.get(afcChampion.team.id)!.conferenceTitles += 1;
      accumulators.get(nfcChampion.team.id)!.conferenceTitles += 1;
      const superBowlChampion = simulatePostseasonGame(
        afcChampion,
        nfcChampion,
        random,
        homeFieldRating,
        true
      );
      accumulators.get(superBowlChampion.team.id)!.superBowlTitles += 1;
    }
  }

  const projections = input.teams.map((team): NflTeamSeasonProjection => {
    const accumulator = accumulators.get(team.id)!;
    const records = [...accumulator.recordCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const [mostLikelyKey, mostLikelyCount] = records[0];
    const [mostWins, mostLosses, mostTies] = mostLikelyKey.split("-").map(Number);
    const recordDistributionPct = Object.fromEntries(
      records.map(([record, count]) => [record, round(count / iterations * 100, 2)])
    );
    const seedOddsPct = Object.fromEntries(
      Array.from({ length: PLAYOFF_SEEDS }, (_, index) => {
        const seedNumber = index + 1;
        return [
          String(seedNumber),
          round(accumulator.seedCounts[seedNumber] / iterations * 100, 2)
        ];
      })
    ) as NflTeamSeasonProjection["seedOddsPct"];

    return {
      teamId: team.id,
      teamName: team.name,
      abbreviation: team.abbreviation ?? null,
      conference: team.conference,
      division: team.division,
      scheduledGames: teamGameCounts[team.id],
      meanWins: round(
        accumulator.wins.reduce((sum, value) => sum + value, 0) / iterations,
        2
      ),
      meanLosses: round(
        accumulator.losses.reduce((sum, value) => sum + value, 0) / iterations,
        2
      ),
      meanTies: round(
        accumulator.ties.reduce((sum, value) => sum + value, 0) / iterations,
        3
      ),
      medianWins: round(median(accumulator.wins), 1),
      winRange: {
        p10: percentile(accumulator.wins, 0.1),
        p90: percentile(accumulator.wins, 0.9)
      },
      mostLikelyRecord: {
        wins: mostWins,
        losses: mostLosses,
        ties: mostTies,
        probabilityPct: round(mostLikelyCount / iterations * 100, 2)
      },
      recordDistributionPct,
      divisionOddsPct: round(accumulator.divisionTitles / iterations * 100, 2),
      playoffOddsPct: round(accumulator.playoffBerths / iterations * 100, 2),
      seedOddsPct,
      conferenceTitleOddsPct: round(
        accumulator.conferenceTitles / iterations * 100,
        2
      ),
      superBowlOddsPct: round(
        accumulator.superBowlTitles / iterations * 100,
        2
      )
    };
  }).sort((left, right) =>
    left.conference.localeCompare(right.conference)
    || left.division.localeCompare(right.division)
    || right.meanWins - left.meanWins
    || left.teamName.localeCompare(right.teamName)
  );

  const expectedLeagueWins = [...accumulators.values()].reduce(
    (sum, accumulator) => sum + accumulator.wins.reduce(
      (teamSum, value) => teamSum + value,
      0
    ),
    0
  ) / iterations;
  const expectedLeagueLosses = [...accumulators.values()].reduce(
    (sum, accumulator) => sum + accumulator.losses.reduce(
      (teamSum, value) => teamSum + value,
      0
    ),
    0
  ) / iterations;
  const expectedTeamTies = [...accumulators.values()].reduce(
    (sum, accumulator) => sum + accumulator.ties.reduce(
      (teamSum, value) => teamSum + value,
      0
    ),
    0
  ) / iterations;
  const expectedTeamGames = expectedLeagueWins + expectedLeagueLosses + expectedTeamTies;
  const expectedTeamGamesTarget = input.games.length * 2;

  return {
    generatedAt: new Date().toISOString(),
    iterations,
    seed,
    teams: projections,
    audit: {
      scheduleGames: input.games.length,
      totalGameSimulations: input.games.length * iterations,
      teamGameCounts,
      expectedLeagueWins: round(expectedLeagueWins, 3),
      expectedLeagueLosses: round(expectedLeagueLosses, 3),
      expectedTeamTies: round(expectedTeamTies, 3),
      expectedTeamGames: round(expectedTeamGames, 3),
      expectedTeamGamesTarget,
      scheduleBalanceDelta: round(
        Math.abs(expectedTeamGames - expectedTeamGamesTarget),
        6
      ),
      tiebreakerVersion: "nfl-order-v1",
      postseasonFormat: "14-team-reseeded-v1"
    }
  };
}
