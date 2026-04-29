import { buildNbaStatsApiTeamAnalyticsFeed } from "@/services/nba/nba-stats-api-feed";
import { normalizeNbaTeam, type NbaTeamAnalyticsProfile } from "@/services/simulation/nba-team-analytics";

type EspnCompetition = {
  competitors?: Array<{
    homeAway?: string;
    team?: {
      displayName?: string;
      name?: string;
      shortDisplayName?: string;
      abbreviation?: string;
    };
  }>;
};

type EspnEvent = {
  date?: string;
  competitions?: EspnCompetition[];
};

type NbaMatchup = {
  awayTeam: string;
  homeTeam: string;
  startTime: string | null;
};

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

function dateKey(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function num(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function fetchEspnScoreboardForDate(date: string) {
  const url = new URL(ESPN_SCOREBOARD_URL);
  url.searchParams.set("dates", date);
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SharkEdge/1.5" },
    cache: "force-cache",
    next: { revalidate: Number(process.env.NBA_INTERNAL_CONTEXT_CACHE_TTL_SECONDS ?? 60 * 60) }
  });
  if (!response.ok) return [] as EspnEvent[];
  const body = await response.json();
  return Array.isArray(body?.events) ? body.events : [];
}

function teamName(competition: EspnCompetition, homeAway: "home" | "away") {
  const competitor = competition.competitors?.find((entry) => entry.homeAway === homeAway);
  const team = competitor?.team;
  return team?.displayName || team?.name || team?.shortDisplayName || team?.abbreviation || null;
}

export async function getNbaUpcomingMatchups() {
  const windows = Number(process.env.NBA_INTERNAL_CONTEXT_LOOKAHEAD_DAYS ?? 4);
  const dates = Array.from({ length: Math.max(1, windows) }, (_, index) => dateKey(index));
  const eventGroups = await Promise.all(dates.map(fetchEspnScoreboardForDate));
  const matchups: NbaMatchup[] = [];

  for (const event of eventGroups.flat()) {
    const competition = event.competitions?.[0];
    if (!competition) continue;
    const awayTeam = teamName(competition, "away");
    const homeTeam = teamName(competition, "home");
    if (!awayTeam || !homeTeam) continue;
    matchups.push({ awayTeam, homeTeam, startTime: event.date ?? null });
  }

  return matchups;
}

async function teamMap() {
  const rows = await buildNbaStatsApiTeamAnalyticsFeed();
  const map = new Map<string, NbaTeamAnalyticsProfile>();
  for (const row of rows) {
    if (row.teamName) map.set(normalizeNbaTeam(row.teamName), row as NbaTeamAnalyticsProfile);
  }
  return map;
}

function profile(map: Map<string, NbaTeamAnalyticsProfile>, teamName: string) {
  return map.get(normalizeNbaTeam(teamName));
}

function restEdge(startTime: string | null) {
  if (!startTime) return 0;
  const hour = new Date(startTime).getUTCHours();
  if (!Number.isFinite(hour)) return 0;
  return hour >= 2 ? -0.15 : 0.1;
}

export async function buildInternalNbaDecisionContextFeed() {
  const [matchups, teams] = await Promise.all([getNbaUpcomingMatchups(), teamMap()]);
  return matchups.map((game) => {
    const away = profile(teams, game.awayTeam);
    const home = profile(teams, game.homeTeam);
    const awayPace = num(away?.pace, 98.5);
    const homePace = num(home?.pace, 98.5);
    const awayOff = num(away?.offensiveRating, 114);
    const homeOff = num(home?.offensiveRating, 114);
    const awayDef = num(away?.defensiveRating, 114);
    const homeDef = num(home?.defensiveRating, 114);
    const scheduleFatigueEdge = restEdge(game.startTime);
    const restAdvantage = num(home?.restTravel, 0) - num(away?.restTravel, 0);
    const recentShotQualityEdge = ((homeOff - homeDef) - (awayOff - awayDef)) / 6;
    const recentRimPressureEdge = (num(home?.freeThrowRate, 21) - num(away?.freeThrowRate, 21)) / 9;
    const defensiveSchemeEdge = (awayDef - homeDef) / 8;
    const benchDepthEdge = (num(home?.reboundPct, 50) - num(away?.reboundPct, 50)) / 7;
    const clutchEdge = (num(home?.recentForm, 0) - num(away?.recentForm, 0)) / 2;
    const paceDelta = ((awayPace + homePace) / 2 - 98.5) / 2;
    const decisionEdge = scheduleFatigueEdge + restAdvantage * 0.35 + recentShotQualityEdge * 0.45 + defensiveSchemeEdge * 0.3 + benchDepthEdge * 0.18 + clutchEdge * 0.22;
    const totalContextEdge = paceDelta + recentRimPressureEdge * 0.35 + (num(home?.efgPct, 54.5) + num(away?.efgPct, 54.5) - 109) / 14;

    return {
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      source: "real",
      scheduleFatigueEdge: Number(scheduleFatigueEdge.toFixed(2)),
      travelEdge: 0,
      altitudeEdge: normalizeNbaTeam(game.homeTeam).includes("denvernuggets") ? 0.8 : 0,
      restAdvantage: Number(restAdvantage.toFixed(2)),
      refereePaceBias: 0,
      refereeFoulBias: 0,
      marketPublicBias: 0,
      sharpSplitSignal: 0,
      recentShotQualityEdge: Number(recentShotQualityEdge.toFixed(2)),
      recentRimPressureEdge: Number(recentRimPressureEdge.toFixed(2)),
      defensiveSchemeEdge: Number(defensiveSchemeEdge.toFixed(2)),
      matchupSizeEdge: Number(((num(home?.reboundPct, 50) - num(away?.reboundPct, 50)) / 8).toFixed(2)),
      benchDepthEdge: Number(benchDepthEdge.toFixed(2)),
      clutchEdge: Number(clutchEdge.toFixed(2)),
      garbageTimeRisk: Number(clamp(Math.abs((homeOff - awayOff) + (awayDef - homeDef)) / 35, 0, 1).toFixed(2)),
      blowoutRisk: Number(clamp(Math.abs((homeOff - awayOff) + (awayDef - homeDef)) / 26, 0, 1).toFixed(2)),
      decisionEdge: Number(decisionEdge.toFixed(2)),
      totalContextEdge: Number(totalContextEdge.toFixed(2)),
      volatilityContext: Number(clamp(1 + Math.abs(num(home?.threePointAttemptRate, 38) - num(away?.threePointAttemptRate, 38)) / 120, 0.85, 1.25).toFixed(2)),
      confidenceAdjustment: Number(clamp(Math.abs(decisionEdge) * 0.35 + (away && home ? 1.4 : -1.5), -3, 4).toFixed(2)),
      notes: [
        "Derived from public ESPN schedule data plus NBA Stats/DataBallr team efficiency.",
        "Referee and market split fields stay neutral until a true source is configured."
      ]
    };
  });
}

export async function buildInternalNbaSynergyContextFeed() {
  const [matchups, teams] = await Promise.all([getNbaUpcomingMatchups(), teamMap()]);
  return matchups.map((game) => {
    const away = profile(teams, game.awayTeam);
    const home = profile(teams, game.homeTeam);
    const offEdge = (num(home?.offensiveRating, 114) - num(away?.offensiveRating, 114)) / 5;
    const defEdge = (num(away?.defensiveRating, 114) - num(home?.defensiveRating, 114)) / 5;
    const paceEdge = (num(home?.pace, 98.5) - num(away?.pace, 98.5)) / 4;
    const shotEdge = (num(home?.efgPct, 54.5) - num(away?.efgPct, 54.5)) / 2.8;
    const threeEdge = (num(home?.threePointAttemptRate, 38) - num(away?.threePointAttemptRate, 38)) / 9;
    const reboundEdge = (num(home?.reboundPct, 50) - num(away?.reboundPct, 50)) / 5;
    const tovEdge = (num(away?.turnoverPct, 13) - num(home?.turnoverPct, 13)) / 3;
    const starCreationEdge = offEdge + shotEdge * 0.3;
    const synergySideEdge = starCreationEdge + defEdge * 0.4 + tovEdge * 0.35 + reboundEdge * 0.2;
    const synergyTotalEdge = paceEdge + shotEdge * 0.45 + threeEdge * 0.35 + num(home?.freeThrowRate, 21) / 80 + num(away?.freeThrowRate, 21) / 90 - 0.5;

    return {
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      source: "real",
      coachAdjustmentEdge: 0,
      timeoutAtoEdge: 0,
      rotationStabilityEdge: away && home ? 0.35 : -0.4,
      lineupContinuityEdge: away && home ? 0.3 : -0.35,
      pickRollBallHandlerEdge: Number((offEdge * 0.35).toFixed(2)),
      pickRollRollManEdge: Number((reboundEdge * 0.22).toFixed(2)),
      isolationEdge: Number((starCreationEdge * 0.22).toFixed(2)),
      postUpEdge: Number((reboundEdge * 0.15).toFixed(2)),
      spotUpEdge: Number((threeEdge + shotEdge * 0.25).toFixed(2)),
      transitionEdge: Number((paceEdge + tovEdge * 0.25).toFixed(2)),
      offensiveReboundEdge: Number((reboundEdge * 0.45).toFixed(2)),
      rimFrequencyEdge: Number(((num(home?.freeThrowRate, 21) - num(away?.freeThrowRate, 21)) / 8).toFixed(2)),
      cornerThreeEdge: Number((threeEdge * 0.55).toFixed(2)),
      pullUpThreeEdge: Number((threeEdge * 0.38).toFixed(2)),
      paintTouchEdge: Number((reboundEdge * 0.25 + shotEdge * 0.18).toFixed(2)),
      driveKickEdge: Number((offEdge * 0.24 + threeEdge * 0.2).toFixed(2)),
      opponentRimDeterrenceEdge: Number((defEdge * 0.32).toFixed(2)),
      opponentSwitchabilityEdge: Number((defEdge * 0.22).toFixed(2)),
      opponentPointOfAttackEdge: Number((defEdge * 0.28 + tovEdge * 0.2).toFixed(2)),
      opponentCloseoutEdge: Number((defEdge * 0.2 - threeEdge * 0.12).toFixed(2)),
      foulDisciplineEdge: Number(((num(away?.freeThrowRate, 21) - num(home?.freeThrowRate, 21)) / 10).toFixed(2)),
      turnoverCreationEdge: Number(tovEdge.toFixed(2)),
      lateGameExecutionEdge: Number(((num(home?.recentForm, 0) - num(away?.recentForm, 0)) / 3).toFixed(2)),
      benchCreationEdge: Number((offEdge * 0.2).toFixed(2)),
      starCreationEdge: Number(starCreationEdge.toFixed(2)),
      synergySideEdge: Number(synergySideEdge.toFixed(2)),
      synergyTotalEdge: Number(synergyTotalEdge.toFixed(2)),
      synergyVolatility: Number(clamp(1 + Math.abs(threeEdge) / 16 + Math.abs(paceEdge) / 18, 0.85, 1.25).toFixed(2)),
      confidenceAdjustment: Number(clamp(Math.abs(synergySideEdge) * 0.28 + (away && home ? 1 : -1.8), -3, 4).toFixed(2)),
      notes: [
        "Derived from NBA Stats/DataBallr team efficiency and shot-profile proxies.",
        "Direct Synergy play-type ingestion remains available through the DB cache when stats.nba.com permits it."
      ]
    };
  });
}
