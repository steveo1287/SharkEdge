export type AnalyticsSignalDirection = "positive" | "negative" | "neutral";

export type AnalyticsFactorCategory =
  | "weather"
  | "travel"
  | "schedule"
  | "tempo"
  | "offense"
  | "defense"
  | "matchup"
  | "market"
  | "player"
  | "ratings"
  | "injury"
  | "style";

export type AnalyticsFactor = {
  key: string;
  label: string;
  category: AnalyticsFactorCategory;
  value: number;
  direction: AnalyticsSignalDirection;
  weight: number;
  impactScore: number;
  confidence: number;
  detail: string;
  source: string;
};

export type WeatherSignal = {
  provider: string;
  model: string;
  temperatureF: number | null;
  feelsLikeF: number | null;
  windMph: number | null;
  windDirection: string | null;
  gustMph: number | null;
  humidityPct: number | null;
  pressureMb: number | null;
  precipitationProbabilityPct: number | null;
  precipitationIntensityMm: number | null;
  cloudCoverPct: number | null;
  roofOpenImpact: boolean;
  notes: string[];
  confidence: number;
};

export type EnvironmentalContext = {
  weather: WeatherSignal[];
  weatherBlend: {
    runEnvironmentDelta: number;
    scoringEnvironmentDelta: number;
    paceDelta: number;
    passingDelta: number;
    kickingDelta: number;
    confidence: number;
    summary: string;
  };
  altitudeFt: number | null;
  surface: string | null;
  indoor: boolean | null;
  travelMilesHome: number | null;
  travelMilesAway: number | null;
  circadianPenaltyHome: number | null;
  circadianPenaltyAway: number | null;
};

export type MatchupProfile = {
  teamVsTeam: {
    offensiveEfficiencyGap: number | null;
    defensiveResistanceGap: number | null;
    reboundingGap: number | null;
    turnoverGap: number | null;
    shotQualityGap: number | null;
    specialTeamsGap: number | null;
  };
  styleVsStyle: {
    paceClash: number | null;
    rimAndThreePressure: number | null;
    isoVsSwitch: number | null;
    transitionEdge: number | null;
    trenchMismatch: number | null;
    groundGameEdge: number | null;
  };
  playerVsPlayer: Array<{
    player: string;
    opponent: string;
    edge: number;
    reason: string;
  }>;
};

export type RatingsContext = {
  videoGameRatingsAvailable: boolean;
  teamOverall: number | null;
  teamOffense: number | null;
  teamDefense: number | null;
  starPowerIndex: number | null;
  depthIndex: number | null;
  notes: string[];
};

export type SimulationEnhancementReport = {
  sport: string;
  eventId: string;
  generatedAt: string;
  modelVersion: string;
  factors: AnalyticsFactor[];
  environment: EnvironmentalContext;
  matchup: MatchupProfile;
  ratings: RatingsContext;
  confidence: number;
  notes: string[];
};
