export type NbaTeamAnalyticsProfile = {
  teamName: string;
  offensiveRating: number;
  defensiveRating: number;
  pace: number;
  efgPct: number;
  threePointAttemptRate: number;
  turnoverPct: number;
  reboundPct: number;
  freeThrowRate: number;
  recentForm: number;
  restTravel: number;
};

function normalizeTeam(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function seedUnit(seed: number) {
  return (seed % 1000) / 1000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(2));
}

const TEAM_OVERRIDES: Record<string, Partial<NbaTeamAnalyticsProfile>> = {
  bostonceltics: { offensiveRating: 120.2, defensiveRating: 110.1, pace: 98.1, efgPct: 57.5, threePointAttemptRate: 47.1, reboundPct: 51.6, recentForm: 4.2 },
  oklahomacitythunder: { offensiveRating: 119.1, defensiveRating: 108.9, pace: 99.7, efgPct: 56.3, turnoverPct: 11.2, recentForm: 4.5 },
  denvernuggets: { offensiveRating: 118.4, defensiveRating: 113.2, pace: 97.4, efgPct: 57.1, turnoverPct: 12.1, reboundPct: 52.4, recentForm: 3.4 },
  minnesotatimberwolves: { offensiveRating: 115.7, defensiveRating: 109.8, pace: 97.9, efgPct: 55.1, reboundPct: 51.8, recentForm: 3.2 },
  newyorkknicks: { offensiveRating: 117.3, defensiveRating: 113.0, pace: 96.3, reboundPct: 52.7, turnoverPct: 11.9, recentForm: 2.9 },
  milwaukeebucks: { offensiveRating: 117.9, defensiveRating: 115.4, pace: 99.2, efgPct: 56.4, freeThrowRate: 24.1, recentForm: 2.6 },
  clevelandcavaliers: { offensiveRating: 116.4, defensiveRating: 111.4, pace: 97.8, efgPct: 56.1, recentForm: 3.1 },
  dallasmavericks: { offensiveRating: 117.2, defensiveRating: 115.6, pace: 98.7, threePointAttemptRate: 43.2, recentForm: 2.8 },
  phoenixsuns: { offensiveRating: 116.9, defensiveRating: 114.9, pace: 98.2, efgPct: 56.0, freeThrowRate: 23.8, recentForm: 2.3 },
  losangeleslakers: { offensiveRating: 115.9, defensiveRating: 114.8, pace: 100.1, freeThrowRate: 25.2, reboundPct: 50.2, recentForm: 2.2 },
  goldenswarriors: { offensiveRating: 115.2, defensiveRating: 113.6, pace: 100.3, threePointAttemptRate: 46.8, efgPct: 55.4, recentForm: 2.1 },
  chicagobulls: { offensiveRating: 113.1, defensiveRating: 116.1, pace: 99.4, efgPct: 53.5, turnoverPct: 12.5, recentForm: -0.4 },
  detroitpistons: { offensiveRating: 112.4, defensiveRating: 117.0, pace: 100.4, turnoverPct: 13.9, recentForm: -0.8 },
  washingtonwizards: { offensiveRating: 110.8, defensiveRating: 119.4, pace: 101.1, turnoverPct: 14.4, recentForm: -2.4 }
};

export function getNbaTeamAnalyticsProfile(teamName: string): NbaTeamAnalyticsProfile {
  const key = normalizeTeam(teamName);
  const seed = hashString(key);
  const synthetic: NbaTeamAnalyticsProfile = {
    teamName,
    offensiveRating: range(seed >>> 1, 111.0, 118.8),
    defensiveRating: range(seed >>> 2, 110.2, 117.8),
    pace: range(seed >>> 3, 96.2, 101.5),
    efgPct: range(seed >>> 4, 52.8, 57.2),
    threePointAttemptRate: range(seed >>> 5, 34.0, 47.5),
    turnoverPct: range(seed >>> 6, 11.0, 14.8),
    reboundPct: range(seed >>> 7, 48.2, 53.0),
    freeThrowRate: range(seed >>> 8, 18.2, 25.5),
    recentForm: range(seed >>> 9, -3.5, 4.5),
    restTravel: range(seed >>> 10, -2.5, 2.8)
  };

  return { ...synthetic, ...(TEAM_OVERRIDES[key] ?? {}) };
}

export function compareNbaProfiles(awayTeam: string, homeTeam: string) {
  const away = getNbaTeamAnalyticsProfile(awayTeam);
  const home = getNbaTeamAnalyticsProfile(homeTeam);
  return {
    away,
    home,
    offensiveEdge: home.offensiveRating - away.offensiveRating,
    defensiveEdge: away.defensiveRating - home.defensiveRating,
    paceAverage: (away.pace + home.pace) / 2,
    efgEdge: home.efgPct - away.efgPct,
    threePointVolatility: (away.threePointAttemptRate + home.threePointAttemptRate) / 80,
    turnoverEdge: away.turnoverPct - home.turnoverPct,
    reboundEdge: home.reboundPct - away.reboundPct,
    freeThrowEdge: home.freeThrowRate - away.freeThrowRate,
    restTravelEdge: home.restTravel - away.restTravel,
    formEdge: home.recentForm - away.recentForm
  };
}
